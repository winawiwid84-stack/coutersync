import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AppMode,
  Booking,
  Court,
  DynamicPricingRule,
  GeneratedContentPackage,
  OpenPlaySession,
  PaymentMethod,
  SavedContentDraft,
  SkillLevel,
  SplitParticipant,
  SportCategory,
  UserProfile,
  UserRole,
  Venue,
  VenueReview,
  VideoScene,
} from '../types/courtsync';

const ADMIN_EMAIL = 'winawiwid84@gmail.com';
const LEGACY_DEMO_VENUE_IDS = new Set([
  'gor-cikutra',
  'futsal-buahbatu',
  'dago-padel',
  'padel-dago',
  'minisoccer-cihampelas',
]);

const DEFAULT_SPORT_IMAGES: Record<SportCategory, string> = {
  Badminton: '/assets/courtsync/venue-badminton.jpg',
  Futsal: '/assets/courtsync/venue-futsal.jpg',
  'Mini Soccer': '/assets/courtsync/venue-minisoccer.jpg',
  Padel: '/assets/courtsync/venue-padel.jpg',
};

function slugifyId(raw: string): string {
  const clean = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return clean || 'gor-bandung';
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: String(d.uid),
      displayName: String(d.displayName),
      email: String(d.email),
      phone: d.phone ? String(d.phone) : undefined,
      accountType: d.accountType === 'mitra_gor' ? 'mitra_gor' : 'player',
      verifiedMitra: Boolean(d.verifiedMitra),
      favoriteSport: d.favoriteSport ? String(d.favoriteSport) : undefined,
      skillLevel: d.skillLevel as SkillLevel | undefined,
      venueName: d.venueName ? String(d.venueName) : undefined,
      venueArea: d.venueArea ? String(d.venueArea) : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
}

export async function saveUserProfile(params: {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  accountType: UserRole;
  favoriteSport?: string;
  skillLevel?: SkillLevel;
  venueName?: string;
  venueArea?: string;
}): Promise<UserProfile> {
  const userRef = doc(db, 'users', params.uid);
  const existing = await getDoc(userRef);
  const isBootstrappedAdmin = params.email === ADMIN_EMAIL;

  const cleanName = params.displayName.trim().slice(0, 100) || 'Pengguna CourtSync';
  const cleanPhone = params.phone?.trim().slice(0, 30);
  const cleanFavoriteSport = params.favoriteSport?.trim().slice(0, 60);
  const cleanVenueName = params.venueName?.trim().slice(0, 120);
  const cleanVenueArea = params.venueArea?.trim().slice(0, 80);

  try {
    if (!existing.exists()) {
      const payload: Record<string, unknown> = {
        uid: params.uid,
        displayName: cleanName.length >= 2 ? cleanName : 'Pemain CourtSync',
        email: params.email.slice(0, 120),
        accountType: params.accountType,
        verifiedMitra: isBootstrappedAdmin && params.accountType === 'mitra_gor',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanPhone) payload.phone = cleanPhone;
      if (cleanFavoriteSport) payload.favoriteSport = cleanFavoriteSport;
      if (params.skillLevel) payload.skillLevel = params.skillLevel;
      if (cleanVenueName) payload.venueName = cleanVenueName;
      if (cleanVenueArea) payload.venueArea = cleanVenueArea;

      await setDoc(userRef, payload);
      return {
        uid: params.uid,
        displayName: String(payload.displayName),
        email: params.email,
        phone: cleanPhone,
        accountType: params.accountType,
        verifiedMitra: Boolean(payload.verifiedMitra),
        favoriteSport: cleanFavoriteSport,
        skillLevel: params.skillLevel,
        venueName: cleanVenueName,
        venueArea: cleanVenueArea,
      };
    } else {
      const existingData = existing.data();
      const updatePayload: Record<string, unknown> = {
        displayName: cleanName.length >= 2 ? cleanName : String(existingData.displayName),
        accountType: params.accountType,
        updatedAt: serverTimestamp(),
      };
      if (cleanPhone) updatePayload.phone = cleanPhone;
      if (cleanFavoriteSport) updatePayload.favoriteSport = cleanFavoriteSport;
      if (params.skillLevel) updatePayload.skillLevel = params.skillLevel;
      if (cleanVenueName) updatePayload.venueName = cleanVenueName;
      if (cleanVenueArea) updatePayload.venueArea = cleanVenueArea;

      await updateDoc(userRef, updatePayload);
      return {
        uid: params.uid,
        displayName: String(updatePayload.displayName),
        email: String(existingData.email),
        phone: cleanPhone ?? (existingData.phone ? String(existingData.phone) : undefined),
        accountType: params.accountType,
        verifiedMitra: Boolean(existingData.verifiedMitra),
        favoriteSport:
          cleanFavoriteSport ??
          (existingData.favoriteSport ? String(existingData.favoriteSport) : undefined),
        skillLevel: params.skillLevel ?? (existingData.skillLevel as SkillLevel | undefined),
        venueName: cleanVenueName ?? (existingData.venueName ? String(existingData.venueName) : undefined),
        venueArea: cleanVenueArea ?? (existingData.venueArea ? String(existingData.venueArea) : undefined),
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${params.uid}`);
  }
}

/**
 * Removes any legacy seeded demo venues & their courts from Firestore (Admin only).
 * Never deletes real Mitra GOR venues registered by users.
 */
export async function purgeSeededDemoVenues(): Promise<number> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.email !== ADMIN_EMAIL) return 0;

  try {
    const [venuesSnap, courtsSnap] = await Promise.all([
      getDocs(query(collection(db, 'venues'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'courts'), where('isPublic', '==', true))),
    ]);

    const batch = writeBatch(db);
    let deleteCount = 0;

    venuesSnap.forEach((docSnap) => {
      if (LEGACY_DEMO_VENUE_IDS.has(docSnap.id)) {
        batch.delete(docSnap.ref);
        deleteCount += 1;
      }
    });

    courtsSnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (LEGACY_DEMO_VENUE_IDS.has(String(d.venueId || ''))) {
        batch.delete(docSnap.ref);
        deleteCount += 1;
      }
    });

    if (deleteCount > 0) {
      await batch.commit();
    }
    return deleteCount;
  } catch (error) {
    if (error instanceof Error && error.message.includes('permission')) {
      return 0;
    }
    return 0;
  }
}

/**
 * Deletes a single Mitra GOR venue and all of its courts in Firestore (Venue Owner or Admin).
 */
export async function deleteVenueWithCourtsInFirestore(
  venueId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return {
      ok: false,
      error: 'Masuk dengan akun Google terverifikasi terlebih dahulu untuk menghapus GOR.',
    };
  }

  try {
    const courtsSnap = await getDocs(
      query(
        collection(db, 'courts'),
        where('isPublic', '==', true),
        where('venueId', '==', venueId)
      )
    );
    const batch = writeBatch(db);
    courtsSnap.forEach((cDoc) => batch.delete(cDoc.ref));
    batch.delete(doc(db, 'venues', venueId));
    await batch.commit();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Gagal menghapus GOR. Hanya pemilik GOR atau Admin yang dapat menghapus.',
    };
  }
}

/**
 * Deletes ALL Mitra GOR venues and courts in Firestore (Admin only).
 */
export async function deleteAllVenuesInFirestore(): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return {
      ok: false,
      deleted: 0,
      error: 'Masuk dengan akun Admin terlebih dahulu untuk mengosongkan semua Mitra GOR.',
    };
  }

  try {
    const [venuesSnap, courtsSnap] = await Promise.all([
      getDocs(query(collection(db, 'venues'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'courts'), where('isPublic', '==', true))),
    ]);

    const refs = [...courtsSnap.docs.map((d) => d.ref), ...venuesSnap.docs.map((d) => d.ref)];
    if (refs.length === 0) {
      return { ok: true, deleted: 0 };
    }

    // Firestore writeBatch limit is 500 ops per batch
    for (let i = 0; i < refs.length; i += 450) {
      const batch = writeBatch(db);
      refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    return { ok: true, deleted: venuesSnap.size };
  } catch (error) {
    return {
      ok: false,
      deleted: 0,
      error:
        error instanceof Error
          ? error.message
          : 'Gagal mengosongkan daftar Mitra GOR di database.',
    };
  }
}

/**
 * Allows any authenticated Mitra GOR to publish a real sports venue & its courts directly into Firestore.
 */
export async function createVenueWithCourtsInFirestore(params: {
  name: string;
  sport: SportCategory;
  area: string;
  address: string;
  openHour: number;
  closeHour: number;
  facilities: string[];
  bankAccount: string;
  courts: Array<{
    name: string;
    surface: string;
    indoor: boolean;
    basePricePerHour: number;
  }>;
}): Promise<{ ok: boolean; venue?: Venue; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return {
      ok: false,
      error: 'Silakan masuk dengan akun Google terverifikasi terlebih dahulu untuk mendaftarkan GOR.',
    };
  }

  const venueId = `${slugifyId(params.name)}-${Date.now().toString(36).slice(-4)}`;
  const cleanName = params.name.trim().slice(0, 120);
  const cleanArea = params.area.trim().slice(0, 80);
  const cleanAddress = params.address.trim().slice(0, 240);
  const cleanBank = params.bankAccount.trim().slice(0, 140);
  const cleanFacilities = params.facilities
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (cleanName.length < 2 || cleanArea.length < 2 || cleanAddress.length < 5 || cleanBank.length < 3) {
    return {
      ok: false,
      error: 'Lengkapi nama GOR, area Bandung, alamat lengkap, dan rekening pencairan H+1.',
    };
  }
  if (params.courts.length === 0) {
    return { ok: false, error: 'Tambahkan minimal 1 lapangan beserta tarif per jam.' };
  }

  const imageUrl = DEFAULT_SPORT_IMAGES[params.sport];

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'venues', venueId), {
      name: cleanName,
      sport: params.sport,
      area: cleanArea,
      address: cleanAddress,
      rating: 5.0,
      reviewCount: 0,
      imageUrl,
      openHour: Math.max(0, Math.min(23, Math.round(params.openHour))),
      closeHour: Math.max(1, Math.min(24, Math.round(params.closeHour))),
      facilities: cleanFacilities.length > 0 ? cleanFacilities : ['Parkir Luas', 'Toilet & Ruang Ganti'],
      bankAccount: cleanBank,
      pricingEnabled: true,
      pricingDays: [1, 2, 3, 4, 5],
      pricingStartHour: 9,
      pricingEndHour: 15,
      pricingDiscountPercent: 20,
      pricingLabel: 'Promo Off-Peak Siang',
      ownerUid: user.uid,
      isPublic: true,
      updatedAt: serverTimestamp(),
    });

    const createdCourts: Court[] = params.courts.slice(0, 12).map((c, idx) => {
      const courtId = `${venueId}-c${idx + 1}`;
      const basePrice = Math.max(20000, Math.min(20000000, Math.round(c.basePricePerHour)));
      const courtObj: Court = {
        id: courtId,
        venueId,
        name: (c.name.trim() || `Lapangan ${idx + 1}`).slice(0, 100),
        surface: (c.surface.trim() || 'Standar Turnamen').slice(0, 100),
        indoor: Boolean(c.indoor),
        basePricePerHour: basePrice,
        ownerUid: user.uid,
      };
      batch.set(doc(db, 'courts', courtId), {
        venueId,
        name: courtObj.name,
        surface: courtObj.surface,
        indoor: courtObj.indoor,
        basePricePerHour: courtObj.basePricePerHour,
        ownerUid: user.uid,
        isPublic: true,
      });
      return courtObj;
    });

    await batch.commit();

    const venue: Venue = {
      id: venueId,
      name: cleanName,
      sport: params.sport,
      area: cleanArea,
      address: cleanAddress,
      rating: 5.0,
      reviewCount: 0,
      imageUrl,
      openHour: Math.max(0, Math.min(23, Math.round(params.openHour))),
      closeHour: Math.max(1, Math.min(24, Math.round(params.closeHour))),
      facilities: cleanFacilities.length > 0 ? cleanFacilities : ['Parkir Luas', 'Toilet & Ruang Ganti'],
      bankAccount: cleanBank,
      courts: createdCourts,
      ownerUid: user.uid,
    };

    return { ok: true, venue };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Gagal menyimpan GOR ke Firestore.',
    };
  }
}

/**
 * Persists a booking atomically into Firestore using a transaction on `booking_slots/{courtId}_{date}_{hour}`
 * to mathematically prevent concurrent double-booking across all devices.
 */
export async function createAtomicFirestoreBooking(
  booking: Booking,
  openPlay?: OpenPlaySession,
  venueOwnerUid?: string
): Promise<{ ok: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return {
      ok: false,
      error: 'Masuk dengan akun Google terverifikasi terlebih dahulu agar booking tersimpan & slot terkunci real-time.',
    };
  }

  try {
    await runTransaction(db, async (tx) => {
      // 1. Verify every requested slot lock does not already exist
      for (const hour of booking.hours) {
        const slotId = `${booking.courtId}_${booking.date}_${hour}`;
        const slotRef = doc(db, 'booking_slots', slotId);
        const existingSlot = await tx.get(slotRef);
        if (existingSlot.exists()) {
          throw new Error(`CONFLICT:${hour}`);
        }
      }

      // 2. Write parent booking document
      const bookingRef = doc(db, 'bookings', booking.id);
      const bookingPayload: Record<string, unknown> = {
        bookingCode: booking.bookingCode,
        venueId: booking.venueId,
        courtId: booking.courtId,
        date: booking.date,
        hours: booking.hours.slice(0, 6),
        customerName: booking.customerName.slice(0, 100),
        customerPhone: booking.customerPhone.slice(0, 30),
        source: booking.source,
        paymentMethod: booking.paymentMethod,
        totalPrice: Math.round(booking.totalPrice),
        discountApplied: Math.round(booking.discountApplied),
        paymentMode: booking.paymentMode,
        status: booking.status,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (venueOwnerUid) bookingPayload.venueOwnerUid = venueOwnerUid.slice(0, 128);
      if (booking.splitLink) bookingPayload.splitLink = booking.splitLink.slice(0, 200);
      if (booking.openPlayId) bookingPayload.openPlayId = booking.openPlayId.slice(0, 128);
      if (booking.notes) bookingPayload.notes = booking.notes.slice(0, 300);

      tx.set(bookingRef, bookingPayload);

      // 3. Write atomic lock docs in booking_slots
      for (const hour of booking.hours) {
        const slotId = `${booking.courtId}_${booking.date}_${hour}`;
        tx.set(doc(db, 'booking_slots', slotId), {
          venueId: booking.venueId,
          courtId: booking.courtId,
          date: booking.date,
          hour,
          bookingId: booking.id,
          source: booking.source,
          ownerUid: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      // 4. Write Split Bill participant rows if applicable
      if (booking.paymentMode === 'split' && booking.splitParticipants) {
        booking.splitParticipants.forEach((p: SplitParticipant, idx: number) => {
          const participantDocId = `${booking.id}_${p.id || `p${idx}`}`;
          const partPayload: Record<string, unknown> = {
            bookingId: booking.id,
            ownerUid: user.uid,
            name: p.name.slice(0, 100),
            amount: Math.round(p.amount),
            paid: Boolean(p.paid),
            isHost: Boolean(p.isHost),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (p.paidAt) partPayload.paidAt = p.paidAt.slice(0, 64);
          tx.set(doc(db, 'booking_participants', participantDocId), partPayload);
        });
      }

      // 5. Publish Open Play room if toggled
      if (openPlay) {
        tx.set(doc(db, 'open_plays', openPlay.id), {
          bookingId: booking.id,
          title: openPlay.title.slice(0, 140),
          sport: openPlay.sport,
          venueId: openPlay.venueId,
          courtId: openPlay.courtId,
          date: openPlay.date,
          hours: openPlay.hours.slice(0, 6),
          hostName: openPlay.hostName.slice(0, 80),
          ownerUid: user.uid,
          skillLevel: openPlay.skillLevel,
          maxPlayers: openPlay.maxPlayers,
          currentPlayers: 1,
          costPerPerson: Math.round(openPlay.costPerPerson),
          description: openPlay.description.slice(0, 400),
          participantUids: [user.uid],
          participantNames: [openPlay.hostName.slice(0, 80)],
          status: 'open',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('CONFLICT:')) {
      const hour = error.message.split(':')[1];
      return {
        ok: false,
        error: `Konflik jadwal terdeteksi di jam ${String(hour).padStart(2, '0')}:00 WIB — slot baru saja dikunci pemain lain.`,
      };
    }
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan booking ke database. Pastikan akun Anda sudah masuk.',
    };
  }
}

/**
 * Cancels a booking in Firestore AND atomically releases its `booking_slots` locks.
 */
export async function cancelBookingInFirestore(booking: Booking): Promise<{ ok: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { ok: false, error: 'Silakan masuk terlebih dahulu untuk membatalkan jadwal.' };
  }

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'bookings', booking.id), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
    for (const hour of booking.hours) {
      const slotId = `${booking.courtId}_${booking.date}_${hour}`;
      batch.delete(doc(db, 'booking_slots', slotId));
    }
    await batch.commit();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Gagal membatalkan booking di database.',
    };
  }
}

/**
 * Marks a booking as Checked-In at the GOR cashier desk in Firestore.
 */
export async function checkInBookingInFirestore(bookingId: string): Promise<{ ok: boolean; checkedInAt?: string; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { ok: false, error: 'Masuk sebagai Mitra GOR untuk melakukan check-in E-Ticket.' };
  }

  const nowTime = `${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
  try {
    await updateDoc(doc(db, 'bookings', bookingId), {
      checkedInAt: nowTime,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, checkedInAt: nowTime };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Gagal menyimpan status check-in.',
    };
  }
}

/**
 * Atomically joins an Open Play (Mabar) room in Firestore and records a system lobby notice.
 */
export async function joinOpenPlayInFirestore(
  session: OpenPlaySession,
  playerName: string,
  paymentMethod: PaymentMethod
): Promise<{ ok: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return {
      ok: false,
      error: 'Masuk dengan akun Google terlebih dahulu untuk bergabung & mengunci slot Open Play.',
    };
  }

  const cleanName = (playerName.trim() || user.displayName || 'Pemain CourtSync').slice(0, 80);

  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'open_plays', session.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new Error('Sesi Open Play tidak ditemukan.');
      }
      const d = snap.data();
      const uids: string[] = Array.isArray(d.participantUids) ? d.participantUids.map(String) : [];
      const names: string[] = Array.isArray(d.participantNames) ? d.participantNames.map(String) : [];
      const maxPlayers = Number(d.maxPlayers || session.maxPlayers);
      const currentPlayers = Number(d.currentPlayers || uids.length);

      if (uids.includes(user.uid)) {
        throw new Error('Kamu sudah terdaftar pada sesi Open Play ini.');
      }
      if (d.status !== 'open' || currentPlayers >= maxPlayers) {
        throw new Error('Maaf, kuota pemain sesi Open Play ini sudah penuh.');
      }

      const nextCount = currentPlayers + 1;
      tx.update(ref, {
        currentPlayers: nextCount,
        participantUids: [...uids, user.uid],
        participantNames: [...names, cleanName],
        status: nextCount >= maxPlayers ? 'full' : 'open',
        updatedAt: serverTimestamp(),
      });
    });

    // Write live system notification in the lobby subcollection
    const msgId = `msg-join-${Date.now()}`;
    await setDoc(doc(db, 'open_plays', session.id, 'messages', msgId), {
      sessionId: session.id,
      senderUid: user.uid,
      senderName: 'Sistem CourtSync',
      text: `${cleanName} resmi bergabung & mengunci 1 slot lewat ${paymentMethod.replace('_', ' ')}.`,
      isSystem: true,
      createdAt: serverTimestamp(),
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Gagal bergabung ke sesi Open Play.',
    };
  }
}

/**
 * Fires the Express Midtrans/Xendit payment webhook endpoint AND updates the participant record in Firestore.
 */
export async function triggerSplitBillPaymentWebhook(params: {
  bookingId: string;
  bookingCode: string;
  participantId: string;
  participantIndex: number;
  amount: number;
  gateway?: 'midtrans' | 'xendit';
}): Promise<void> {
  const gatewayOrderId = `${params.bookingCode}-P${params.participantIndex + 1}`;
  const gateway = params.gateway ?? 'midtrans';

  try {
    const body =
      gateway === 'xendit'
        ? {
            id: `xnd_${Date.now()}`,
            external_id: gatewayOrderId,
            status: 'PAID',
            amount: params.amount,
          }
        : {
            order_id: gatewayOrderId,
            status_code: '200',
            gross_amount: `${params.amount}.00`,
            transaction_status: 'settlement',
            transaction_id: `mdt_${Date.now()}`,
          };

    await fetch('/api/webhooks/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Keep client UX resilient even if webhook route is offline
  }

  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docId = `${params.bookingId}_${params.participantId}`;
  const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  try {
    await updateDoc(doc(db, 'booking_participants', docId), {
      paid: true,
      paidAt: nowTime,
      paymentRef: `${gateway.toUpperCase()}-${gatewayOrderId}`,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('No document to update')) {
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, `booking_participants/${docId}`);
  }
}

/**
 * Updates Dynamic Pricing rules in Firestore (Venue Owner or Admin).
 */
export async function persistVenueDynamicPricing(
  venue: Venue,
  rule: DynamicPricingRule
): Promise<{ ok: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { ok: false, error: 'Masuk sebagai Mitra GOR untuk menyimpan aturan Dynamic Pricing ke cloud.' };
  }

  try {
    await updateDoc(doc(db, 'venues', venue.id), {
      pricingEnabled: rule.enabled,
      pricingDays: rule.days.slice(0, 7),
      pricingStartHour: rule.startHour,
      pricingEndHour: rule.endHour,
      pricingDiscountPercent: rule.discountPercent,
      pricingLabel: rule.label.slice(0, 80),
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Tidak memiliki izin mengubah promo GOR ini (hanya pemilik GOR atau Admin).',
    };
  }
}

/**
 * Sends a Lobby Chat message to Firestore subcollection (real-time synced to all participants).
 */
export async function persistLobbyMessage(
  sessionId: string,
  senderName: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { ok: false, error: 'Masuk dengan akun Google untuk mengirim pesan di Chat Lobi.' };
  }

  const messageId = `msg-${Date.now()}`;
  try {
    await setDoc(doc(db, 'open_plays', sessionId, 'messages', messageId), {
      sessionId,
      senderUid: user.uid,
      senderName: senderName.slice(0, 80),
      text: text.slice(0, 500),
      isSystem: false,
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Gagal mengirim pesan ke lobi.',
    };
  }
}

/**
 * Persists an AI Content Agent output draft (text & storyboard metadata only) to Firestore.
 */
export async function saveContentDraftToFirestore(params: {
  roleMode: AppMode;
  venueId?: string;
  platform: string;
  tone: string;
  prompt: string;
  mediaType: 'none' | 'image' | 'video';
  mediaFileName?: string;
  content: GeneratedContentPackage;
}): Promise<SavedContentDraft | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;

  const draftId = `draft-${Date.now()}`;
  const videoScriptJson = JSON.stringify(params.content.videoScript || []).slice(0, 8000);
  const hashtags = (params.content.hashtags || [])
    .filter((h) => typeof h === 'string' && h.trim().length > 0)
    .slice(0, 20);
  const visualTips = (params.content.visualTips || [])
    .filter((t) => typeof t === 'string' && t.trim().length > 0)
    .slice(0, 10);

  const payload: Record<string, unknown> = {
    ownerUid: user.uid,
    roleMode: params.roleMode,
    platform: params.platform.slice(0, 60) || 'Instagram Reels',
    tone: params.tone.slice(0, 60) || 'Energik & Sporty',
    prompt: (params.prompt.trim() || 'Konten dari media unggahan').slice(0, 1000),
    mediaType: params.mediaType,
    title: (params.content.title || 'Konten CourtSync').slice(0, 200),
    hook: (params.content.hook || 'Yuk main bareng!').slice(0, 500),
    caption: (params.content.caption || 'Caption konten olahraga Bandung').slice(0, 3500),
    hashtags,
    createdAt: serverTimestamp(),
  };

  if (params.venueId) payload.venueId = params.venueId.slice(0, 128);
  if (params.mediaFileName) payload.mediaFileName = params.mediaFileName.slice(0, 180);
  if (params.content.whatsappBroadcast) {
    payload.whatsappBroadcast = params.content.whatsappBroadcast.slice(0, 2000);
  }
  if (params.content.cta) payload.cta = params.content.cta.slice(0, 400);
  if (params.content.mediaAnalysis) {
    payload.mediaAnalysis = params.content.mediaAnalysis.slice(0, 1500);
  }
  if (params.content.bestPostingTime) {
    payload.bestPostingTime = params.content.bestPostingTime.slice(0, 300);
  }
  if (visualTips.length > 0) payload.visualTips = visualTips;
  if (videoScriptJson.length > 2) payload.videoScriptJson = videoScriptJson;

  try {
    await setDoc(doc(db, 'content_drafts', draftId), payload);
    return {
      id: draftId,
      roleMode: params.roleMode,
      venueId: params.venueId,
      platform: String(payload.platform),
      tone: String(payload.tone),
      prompt: String(payload.prompt),
      mediaType: params.mediaType,
      mediaFileName: params.mediaFileName,
      content: params.content,
      createdAtLabel: 'Baru saja (Cloud)',
      persistedToCloud: true,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `content_drafts/${draftId}`);
  }
}

export async function fetchUserContentDrafts(uid: string): Promise<SavedContentDraft[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'content_drafts'), where('ownerUid', '==', uid))
    );
    return snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        let parsedScript: VideoScene[] = [];
        if (typeof d.videoScriptJson === 'string') {
          try {
            parsedScript = JSON.parse(d.videoScriptJson) as VideoScene[];
          } catch {
            parsedScript = [];
          }
        }
        return {
          id: docSnap.id,
          roleMode: (d.roleMode === 'B2B' ? 'B2B' : 'B2C') as AppMode,
          venueId: d.venueId ? String(d.venueId) : undefined,
          platform: String(d.platform || 'Instagram Reels'),
          tone: String(d.tone || 'Energik & Sporty'),
          prompt: String(d.prompt || ''),
          mediaType: (d.mediaType === 'image' || d.mediaType === 'video' ? d.mediaType : 'none') as
            | 'none'
            | 'image'
            | 'video',
          mediaFileName: d.mediaFileName ? String(d.mediaFileName) : undefined,
          content: {
            title: String(d.title || ''),
            platform: String(d.platform || 'Instagram Reels'),
            contentGoal: d.roleMode === 'B2B' ? 'Promosi Mitra GOR' : 'Konten Komunitas Mabar',
            mediaAnalysis: String(d.mediaAnalysis || ''),
            hook: String(d.hook || ''),
            caption: String(d.caption || ''),
            videoScript: parsedScript,
            whatsappBroadcast: String(d.whatsappBroadcast || ''),
            cta: String(d.cta || ''),
            hashtags: Array.isArray(d.hashtags) ? d.hashtags.map(String) : [],
            bestPostingTime: String(d.bestPostingTime || ''),
            visualTips: Array.isArray(d.visualTips) ? d.visualTips.map(String) : [],
          },
          createdAtLabel: 'Tersimpan di Cloud',
          persistedToCloud: true,
        };
      })
      .reverse();
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'content_drafts');
  }
}

export async function deleteContentDraftFromFirestore(draftId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  try {
    await deleteDoc(doc(db, 'content_drafts', draftId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `content_drafts/${draftId}`);
  }
}

/**
 * Persists a post-booking player review & 1-5 star rating to Firestore `/reviews/{reviewId}`.
 */
export async function createVenueReviewToFirestore(params: {
  venueId: string;
  bookingId: string;
  bookingCode: string;
  courtName: string;
  reviewerName: string;
  rating: number;
  comment: string;
  tags: string[];
  playedDate: string;
}): Promise<VenueReview | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;

  const cleanRating = Math.min(5, Math.max(1, Math.round(params.rating)));
  const cleanTags = params.tags
    .filter((t) => typeof t === 'string' && t.trim().length > 0)
    .slice(0, 8);
  const reviewId = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const payload = {
    venueId: params.venueId.slice(0, 128),
    bookingId: params.bookingId.slice(0, 128),
    bookingCode: params.bookingCode.slice(0, 32),
    courtName: params.courtName.slice(0, 100),
    ownerUid: user.uid,
    reviewerName: (params.reviewerName.trim() || 'Pemain CourtSync').slice(0, 100),
    rating: cleanRating,
    comment: params.comment.trim().slice(0, 600),
    tags: cleanTags,
    playedDate: params.playedDate.slice(0, 10),
    isPublic: true,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'reviews', reviewId), payload);
    return {
      id: reviewId,
      venueId: payload.venueId,
      bookingId: payload.bookingId,
      bookingCode: payload.bookingCode,
      courtName: payload.courtName,
      reviewerName: payload.reviewerName,
      rating: cleanRating,
      comment: payload.comment,
      tags: cleanTags,
      playedDate: payload.playedDate,
      createdAtLabel: 'Baru saja (Cloud)',
      persistedToCloud: true,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reviews/${reviewId}`);
  }
}

/**
 * Loads public Bandung venue reviews from Firestore `/reviews`.
 */
export async function fetchPublicVenueReviews(): Promise<VenueReview[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'reviews'), where('isPublic', '==', true))
    );
    return snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          venueId: String(d.venueId || ''),
          bookingId: String(d.bookingId || ''),
          bookingCode: String(d.bookingCode || ''),
          courtName: String(d.courtName || ''),
          reviewerName: String(d.reviewerName || 'Pemain Bandung'),
          rating: Math.min(5, Math.max(1, Number(d.rating || 5))),
          comment: String(d.comment || ''),
          tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
          playedDate: String(d.playedDate || ''),
          createdAtLabel: 'Tersimpan di Cloud',
          persistedToCloud: true,
        };
      })
      .reverse();
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reviews');
  }
}
