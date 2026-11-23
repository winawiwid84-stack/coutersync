import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { isPostgresConfigured, queryPg, withPgTransaction } from '../db/postgres.ts';
import { BANDUNG_VENUES, INITIAL_DYNAMIC_PRICING } from '../../data/mockBandungData.ts';
import { OPERATING_HOURS, calculateSlotPrice, generateBookingCode } from '../../utils/format.ts';

export const courtsyncRouter = Router();

// Real-time Server-Sent Events (SSE) subscribers keyed by bookingCode for Split Bill webhook push
const sseClients = new Map<string, Set<Response>>();

function broadcastSplitBillEvent(bookingCode: string, payload: Record<string, unknown>) {
  const clients = sseClients.get(bookingCode);
  if (!clients || clients.size === 0) return;
  const serialized = `event: split_bill_update\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((clientRes) => {
    clientRes.write(serialized);
  });
}

/**
 * GET /api/events/split-bill/:bookingCode
 * Real-time SSE stream notifying connected UI clients when a Midtrans/Xendit webhook updates a participant's Split Bill status.
 */
courtsyncRouter.get('/events/split-bill/:bookingCode', (req: Request, res: Response) => {
  const { bookingCode } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ bookingCode, connectedAt: new Date().toISOString() })}\n\n`);

  if (!sseClients.has(bookingCode)) {
    sseClients.set(bookingCode, new Set());
  }
  sseClients.get(bookingCode)!.add(res);

  req.on('close', () => {
    sseClients.get(bookingCode)?.delete(res);
  });
});

/**
 * GET /api/availability?venueId=gor-cikutra&courtId=cikutra-1&date=2026-11-19
 * Returns 08:00-22:00 hourly availability with dynamic off-peak pricing and locked slot indicators.
 */
courtsyncRouter.get('/availability', async (req: Request, res: Response) => {
  const venueId = String(req.query.venueId || '');
  const courtId = String(req.query.courtId || '');
  const date = String(req.query.date || '');

  if (!venueId || !courtId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: 'Parameter venueId, courtId, dan date (YYYY-MM-DD) wajib diisi.',
    });
  }

  try {
    if (isPostgresConfigured()) {
      const venueRes = await queryPg(
        `SELECT v.*, c.id AS court_id, c.name AS court_name, c.base_price_per_hour
         FROM venues v
         INNER JOIN courts c ON c.venue_id = v.id
         WHERE v.id = $1 AND c.id = $2`,
        [venueId, courtId]
      );

      if (venueRes.rows.length === 0) {
        return res.status(404).json({ error: 'Venue atau lapangan tidak ditemukan.' });
      }

      const row = venueRes.rows[0];
      const slotsRes = await queryPg(
        `SELECT bs.slot_hour, b.source, b.booking_code
         FROM booking_slots bs
         INNER JOIN bookings b ON b.id = bs.booking_id
         WHERE bs.court_id = $1 AND bs.booking_date = $2 AND b.status <> 'cancelled'`,
        [courtId, date]
      );

      const lockedMap = new Map<number, { source: string; bookingCode: string }>();
      for (const s of slotsRes.rows) {
        lockedMap.set(Number(s.slot_hour), {
          source: String(s.source),
          bookingCode: String(s.booking_code),
        });
      }

      const rule = {
        venueId,
        enabled: Boolean(row.pricing_enabled),
        days: (row.pricing_days as number[]) || [1, 2, 3, 4, 5],
        startHour: Number(row.pricing_start_hour),
        endHour: Number(row.pricing_end_hour),
        discountPercent: Number(row.pricing_discount_percent),
        label: String(row.pricing_label),
      };

      const slots = OPERATING_HOURS.map((hour) => {
        const lock = lockedMap.get(hour);
        const pricing = calculateSlotPrice(Number(row.base_price_per_hour), date, hour, rule);
        return {
          hour,
          available: !lock,
          source: lock?.source ?? null,
          basePrice: Number(row.base_price_per_hour),
          finalPrice: pricing.finalPrice,
          isPromo: pricing.isPromo,
          discountPercent: pricing.discountPercent,
          promoLabel: pricing.promoLabel ?? null,
        };
      });

      return res.json({
        source: 'postgresql',
        venueId,
        courtId,
        date,
        slots,
      });
    }

    // Fallback when PG credentials are not set in the preview container (UI syncs directly with Firestore)
    const venue = BANDUNG_VENUES.find((v) => v.id === venueId);
    const court = venue?.courts.find((c) => c.id === courtId);
    if (!venue || !court) {
      return res.status(404).json({ error: 'Venue atau lapangan tidak ditemukan.' });
    }
    const rule = INITIAL_DYNAMIC_PRICING[venueId];
    const slots = OPERATING_HOURS.map((hour) => {
      const pricing = calculateSlotPrice(court.basePricePerHour, date, hour, rule);
      return {
        hour,
        available: true,
        source: null,
        basePrice: court.basePricePerHour,
        finalPrice: pricing.finalPrice,
        isPromo: pricing.isPromo,
        discountPercent: pricing.discountPercent,
        promoLabel: pricing.promoLabel ?? null,
      };
    });

    return res.json({
      source: 'realtime_sync',
      venueId,
      courtId,
      date,
      slots,
    });
  } catch (error) {
    console.error('[GET /api/availability] Error:', error);
    return res.status(500).json({ error: 'Gagal memuat ketersediaan jadwal lapangan.' });
  }
});

/**
 * POST /api/bookings
 * Atomic booking creation using PostgreSQL transaction + UNIQUE(court_id, booking_date, slot_hour) lock.
 * Automatically rejects concurrent double-booking with HTTP 409 Conflict.
 */
courtsyncRouter.post('/bookings', async (req: Request, res: Response) => {
  const {
    venueId,
    courtId,
    date,
    hours,
    customerName,
    customerPhone,
    source = 'online',
    paymentMethod = 'QRIS',
    paymentMode = 'full',
    totalPrice,
    discountApplied = 0,
    splitParticipants = [],
    notes,
  } = req.body ?? {};

  if (
    !venueId ||
    !courtId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ||
    !Array.isArray(hours) ||
    hours.length === 0 ||
    !customerName
  ) {
    return res.status(400).json({ error: 'Data booking tidak lengkap atau format jam tidak valid.' });
  }

  const normalizedHours = [...new Set(hours.map(Number))].filter((h) => h >= 8 && h <= 21).sort((a, b) => a - b);
  if (normalizedHours.length === 0) {
    return res.status(400).json({ error: 'Pilih minimal 1 jam operasional (08:00 - 21:00).' });
  }

  const bookingCode = generateBookingCode();
  const splitLink = paymentMode === 'split' ? `https://courtsync.id/split/${bookingCode}` : null;

  if (!isPostgresConfigured()) {
    return res.status(201).json({
      ok: true,
      mode: 'realtime_sync',
      bookingCode,
      splitLink,
      status: paymentMode === 'split' ? 'pending_split' : 'confirmed',
      message: 'Transaksi tervalidasi (sinkronisasi realtime client-side aktif).',
    });
  }

  try {
    const created = await withPgTransaction(async (client) => {
      // 1. Insert header booking
      const bookingRes = await client.query(
        `INSERT INTO bookings (
          booking_code, venue_id, court_id, booking_date,
          customer_name, customer_phone, source, payment_method,
          payment_mode, total_price, discount_applied, split_link, status, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *`,
        [
          bookingCode,
          venueId,
          courtId,
          date,
          String(customerName).trim(),
          String(customerPhone || '0812-0000-0000').trim(),
          source,
          paymentMethod,
          paymentMode,
          Number(totalPrice || 0),
          Number(discountApplied || 0),
          splitLink,
          paymentMode === 'split' ? 'pending_split' : 'confirmed',
          notes ? String(notes).trim() : null,
        ]
      );

      const bookingRow = bookingRes.rows[0];

      // 2. Insert atomic lock rows into booking_slots (UNIQUE(court_id, booking_date, slot_hour) prevents double-booking)
      for (const hour of normalizedHours) {
        await client.query(
          `INSERT INTO booking_slots (booking_id, venue_id, court_id, booking_date, slot_hour)
           VALUES ($1, $2, $3, $4, $5)`,
          [bookingRow.id, venueId, courtId, date, hour]
        );
      }

      // 3. Insert Split Bill participants if paymentMode === 'split'
      const insertedParticipants = [];
      if (paymentMode === 'split' && Array.isArray(splitParticipants) && splitParticipants.length > 0) {
        for (let i = 0; i < splitParticipants.length; i++) {
          const p = splitParticipants[i];
          const gatewayOrderId = `${bookingCode}-P${i + 1}`;
          const partRes = await client.query(
            `INSERT INTO booking_participants (
              booking_id, name, amount, is_host, paid, paid_at, gateway_order_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
              bookingRow.id,
              String(p.name || `Peserta ${i + 1}`),
              Number(p.amount || 0),
              Boolean(p.isHost),
              Boolean(p.paid),
              p.paid ? new Date().toISOString() : null,
              gatewayOrderId,
            ]
          );
          insertedParticipants.push(partRes.rows[0]);
        }
      }

      return { booking: bookingRow, hours: normalizedHours, participants: insertedParticipants };
    });

    return res.status(201).json({
      ok: true,
      ...created,
    });
  } catch (error: unknown) {
    const pgErr = error as { code?: string; constraint?: string };
    // PostgreSQL error code 23505 = unique_violation on uq_booking_slots_no_double_booking
    if (pgErr?.code === '23505') {
      return res.status(409).json({
        error: 'Konflik jadwal! Salah satu jam yang dipilih sudah terkunci oleh pemesan lain (Anti-Double-Booking).',
        code: 'SLOT_CONFLICT',
      });
    }
    console.error('[POST /api/bookings] Transaction failed:', error);
    return res.status(500).json({ error: 'Gagal menyimpan booking secara atomik.' });
  }
});

/**
 * Verifies Midtrans SHA-512 signature or Xendit callback verification token.
 */
function verifyPaymentWebhook(req: Request): {
  valid: boolean;
  gateway: 'midtrans' | 'xendit' | 'simulator';
  orderId: string;
  transactionId: string;
  isPaid: boolean;
} {
  const body = req.body ?? {};
  const xenditToken = req.header('x-callback-token');

  // 1. Xendit Webhook (Invoice / QRIS callback)
  if (xenditToken || body.external_id) {
    const expectedToken = process.env.XENDIT_CALLBACK_TOKEN;
    const valid = expectedToken ? xenditToken === expectedToken : true;
    const status = String(body.status || '').toUpperCase();
    return {
      valid,
      gateway: 'xendit',
      orderId: String(body.external_id || ''),
      transactionId: String(body.id || `XND-${Date.now()}`),
      isPaid: status === 'PAID' || status === 'SETTLED' || status === 'SUCCEEDED',
    };
  }

  // 2. Midtrans Webhook (Notification HTTP POST)
  if (body.order_id && body.status_code && body.gross_amount) {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    let valid = true;
    if (serverKey && body.signature_key) {
      const expectedSig = crypto
        .createHash('sha512')
        .update(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`)
        .digest('hex');
      valid = expectedSig === body.signature_key;
    }
    const txStatus = String(body.transaction_status || '').toLowerCase();
    return {
      valid,
      gateway: 'midtrans',
      orderId: String(body.order_id),
      transactionId: String(body.transaction_id || `MDT-${Date.now()}`),
      isPaid: txStatus === 'settlement' || txStatus === 'capture',
    };
  }

  return {
    valid: false,
    gateway: 'simulator',
    orderId: '',
    transactionId: '',
    isPaid: false,
  };
}

/**
 * POST /api/webhooks/payment
 * Receives Midtrans / Xendit callbacks to mark Split Bill participants as paid atomically
 * and broadcasts live updates over SSE to connected CourtSync UI clients.
 */
courtsyncRouter.post('/webhooks/payment', async (req: Request, res: Response) => {
  const parsed = verifyPaymentWebhook(req);
  if (!parsed.valid || !parsed.orderId) {
    return res.status(401).json({ error: 'Invalid payment gateway signature or missing order_id/external_id.' });
  }

  if (!parsed.isPaid) {
    return res.status(200).json({ ok: true, ignored: true, reason: 'Transaction not settled yet.' });
  }

  // Extract bookingCode prefix from gateway orderId (e.g., CS-BDG-84K2M9-P2 -> CS-BDG-84K2M9)
  const bookingCodeMatch = parsed.orderId.match(/^(CS-[A-Z0-9]+-[A-Z0-9]+)/);
  const bookingCode = bookingCodeMatch ? bookingCodeMatch[1] : parsed.orderId;
  const paidAtIso = new Date().toISOString();

  try {
    if (isPostgresConfigured()) {
      const updateResult = await withPgTransaction(async (client) => {
        const partRes = await client.query(
          `UPDATE booking_participants
           SET paid = TRUE,
               paid_at = $1,
               payment_gateway = $2,
               gateway_transaction_id = $3,
               updated_at = NOW()
           WHERE gateway_order_id = $4
           RETURNING *`,
          [paidAtIso, parsed.gateway, parsed.transactionId, parsed.orderId]
        );

        if (partRes.rows.length === 0) {
          return null;
        }

        const participant = partRes.rows[0];

        // Check if all participants for this booking are now paid -> auto-confirm booking
        const remainingRes = await client.query(
          `SELECT COUNT(*)::int AS unpaid_count
           FROM booking_participants
           WHERE booking_id = $1 AND paid = FALSE`,
          [participant.booking_id]
        );

        const allPaid = Number(remainingRes.rows[0]?.unpaid_count ?? 1) === 0;
        if (allPaid) {
          await client.query(
            `UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
            [participant.booking_id]
          );
        }

        return { participant, allPaid };
      });

      if (!updateResult) {
        return res.status(404).json({ error: 'Order ID peserta Split Bill tidak ditemukan.' });
      }

      broadcastSplitBillEvent(bookingCode, {
        gateway: parsed.gateway,
        orderId: parsed.orderId,
        transactionId: parsed.transactionId,
        participantId: updateResult.participant.id,
        paidAt: paidAtIso,
        allPaid: updateResult.allPaid,
      });

      return res.json({
        ok: true,
        gateway: parsed.gateway,
        orderId: parsed.orderId,
        allPaid: updateResult.allPaid,
      });
    }

    // Preview/Firestore mode: acknowledge verified webhook and push live SSE notification
    broadcastSplitBillEvent(bookingCode, {
      gateway: parsed.gateway,
      orderId: parsed.orderId,
      transactionId: parsed.transactionId,
      paidAt: paidAtIso,
      verified: true,
    });

    return res.json({
      ok: true,
      gateway: parsed.gateway,
      orderId: parsed.orderId,
      transactionId: parsed.transactionId,
      paidAt: paidAtIso,
    });
  } catch (error) {
    console.error('[POST /api/webhooks/payment] Error:', error);
    return res.status(500).json({ error: 'Gagal memproses webhook pembayaran Split Bill.' });
  }
});
