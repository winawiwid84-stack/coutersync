import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building,
  Check,
  Clock,
  Copy,
  CreditCard,
  Link2,
  Loader2,
  Lock,
  LogIn,
  QrCode,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  Booking,
  PaymentMethod,
  SkillLevel,
  SplitParticipant,
} from '../types/courtsync';
import {
  formatDateIndo,
  formatHourRange,
  formatIDR,
  generateBookingCode,
} from '../utils/format';
import { SelectedSlotPayload } from './B2CVenueExplorer';
import { QrCodeSvg } from './QrCodeSvg';
import { ETicketCard } from './ETicketCard';

interface BookingModalProps {
  selection: SelectedSlotPayload | null;
  isSignedIn: boolean;
  defaultName?: string;
  defaultPhone?: string;
  onPromptLogin: () => void;
  onClose: () => void;
  onConfirmBooking: (params: {
    bookingCode: string;
    venueId: string;
    courtId: string;
    date: string;
    hours: number[];
    customerName: string;
    customerPhone: string;
    paymentMethod: PaymentMethod;
    totalPrice: number;
    discountApplied: number;
    paymentMode: 'full' | 'split';
    splitLink?: string;
    splitParticipants?: SplitParticipant[];
    publishOpenPlay: boolean;
    openPlayConfig?: {
      title: string;
      maxPlayers: number;
      skillLevel: SkillLevel;
      description: string;
    };
  }) => Promise<{ ok: boolean; error?: string; booking?: Booking }>;
  onMarkParticipantPaid: (bookingId: string, participantId: string) => void;
  onOpenMabarChat: (openPlayId: string) => void;
  onGoToTickets: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  selection,
  isSignedIn,
  defaultName,
  defaultPhone,
  onPromptLogin,
  onClose,
  onConfirmBooking,
  onMarkParticipantPaid,
  onOpenMabarChat,
  onGoToTickets,
}) => {
  const [step, setStep] = useState<'config' | 'payment' | 'ticket'>('config');
  const [customerName, setCustomerName] = useState(defaultName || '');
  const [customerPhone, setCustomerPhone] = useState(defaultPhone || '');

  // Payment mode: full vs split
  const [paymentMode, setPaymentMode] = useState<'full' | 'split'>('full');
  const [splitCount, setSplitCount] = useState(4);
  const [participantNames, setParticipantNames] = useState<Record<number, string>>({});
  const [splitPaidIds, setSplitPaidIds] = useState<string[]>(['p-0']);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Open Play (Mabar) publishing
  const [publishOpenPlay, setPublishOpenPlay] = useState(false);
  const [mabarTitle, setMabarTitle] = useState('');
  const [mabarQuota, setMabarQuota] = useState(8);
  const [mabarSkill, setMabarSkill] = useState<SkillLevel>('Menengah');
  const [mabarDesc, setMabarDesc] = useState(
    'Yuk mabar santai tapi seru di Bandung! Cocok buat cari keringat dan kenalan baru.'
  );

  // Payment channel & lock timer
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('QRIS');
  const [lockSeconds, setLockSeconds] = useState(599);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [copiedVa, setCopiedVa] = useState(false);

  const draftBookingCode = useMemo(() => generateBookingCode(), [selection]);
  const splitLink = `https://courtsync.id/split/${draftBookingCode}`;

  useEffect(() => {
    if (!selection) return;
    setMabarTitle(`Mabar ${selection.venue.sport} — ${selection.venue.name}`);
    setMabarQuota(
      selection.venue.sport === 'Padel'
        ? 4
        : selection.venue.sport === 'Badminton'
        ? 8
        : selection.venue.sport === 'Futsal'
        ? 10
        : 14
    );
  }, [selection]);

  useEffect(() => {
    if (step !== 'payment') return;
    const timer = setInterval(() => {
      setLockSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  if (!selection) return null;

  const perPersonAmount = Math.ceil(selection.totalPrice / splitCount / 1000) * 1000;

  const splitParticipants: SplitParticipant[] = Array.from({ length: splitCount }, (_, idx) => {
    const id = `p-${idx}`;
    const isHost = idx === 0;
    const paid = isHost || splitPaidIds.includes(id);
    return {
      id,
      name: isHost
        ? `${customerName.trim() || defaultName || 'Kamu'} (Host)`
        : (participantNames[idx]?.trim() || `Peserta ${idx + 1}`),
      amount: perPersonAmount,
      paid,
      paidAt: paid ? 'Baru saja' : undefined,
      isHost,
    };
  });

  const paidNowCount = splitParticipants.filter((p) => p.paid).length;
  const amountDueNow = paymentMode === 'split' ? perPersonAmount : selection.totalPrice;

  const handleTogglePaid = (id: string) => {
    if (id === 'p-0') return;
    setSplitPaidIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCopySplitLink = () => {
    navigator.clipboard?.writeText(splitLink).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  const vaNumber =
    paymentMethod === 'VA_BCA'
      ? '3901 0812 2345 6789'
      : paymentMethod === 'VA_MANDIRI'
      ? '8801 4081 2234 5678'
      : '8277 0812 2345 6789';

  const handleCopyVa = () => {
    navigator.clipboard?.writeText(vaNumber.replace(/\s+/g, '')).catch(() => {});
    setCopiedVa(true);
    setTimeout(() => setCopiedVa(false), 1600);
  };

  const handleConfirmPayment = async () => {
    setConflictError(null);
    if (!isSignedIn) {
      onPromptLogin();
      return;
    }
    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.trim();
    if (cleanName.length < 2) {
      setConflictError('Isi nama pemesan terlebih dahulu pada Langkah 1.');
      return;
    }
    if (cleanPhone.length < 6) {
      setConflictError('Isi nomor WhatsApp aktif (minimal 6 digit) pada Langkah 1.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onConfirmBooking({
        bookingCode: draftBookingCode,
        venueId: selection.venue.id,
        courtId: selection.court.id,
        date: selection.date,
        hours: selection.hours,
        customerName: cleanName,
        customerPhone: cleanPhone,
        paymentMethod,
        totalPrice: selection.totalPrice,
        discountApplied: selection.discountApplied,
        paymentMode,
        splitLink: paymentMode === 'split' ? splitLink : undefined,
        splitParticipants: paymentMode === 'split' ? splitParticipants : undefined,
        publishOpenPlay,
        openPlayConfig: publishOpenPlay
          ? {
              title: mabarTitle.trim() || `Mabar ${selection.venue.sport} ${selection.venue.name}`,
              maxPlayers: mabarQuota,
              skillLevel: mabarSkill,
              description: mabarDesc.trim(),
            }
          : undefined,
      });

      if (!result.ok) {
        setConflictError(result.error ?? 'Slot sudah dipesan oleh pengguna lain.');
        return;
      }

      if (result.booking) {
        setConfirmedBooking(result.booking);
        setStep('ticket');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const mins = String(Math.floor(lockSeconds / 60)).padStart(2, '0');
  const secs = String(lockSeconds % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Booking Lapangan CourtSync"
        className="w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top Modal Header */}
        <div className="bg-[#0F172A] text-white px-5 sm:px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div>
            <p className="text-xs text-emerald-400 font-medium">
              {step === 'config'
                ? 'Langkah 1 dari 2 · Detail Booking & Patungan'
                : step === 'payment'
                ? 'Langkah 2 dari 2 · Pembayaran & Kunci Slot'
                : 'Booking Terkonfirmasi · E-Ticket Siap Digunakan'}
            </p>
            <h3 className="font-display font-bold text-base sm:text-lg mt-0.5">
              {selection.venue.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal booking"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 thin-scrollbar">
          {/* Booking Summary Strip */}
          {step !== 'ticket' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold text-slate-900">{selection.court.name}</p>
                <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
                  {formatDateIndo(selection.date)} · {formatHourRange(selection.hours)} WIB ({selection.hours.length} jam)
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono font-extrabold text-base text-slate-900 tabular-nums">
                  {formatIDR(selection.totalPrice)}
                </p>
                {selection.discountApplied > 0 && (
                  <p className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                    Termasuk promo -{formatIDR(selection.discountApplied)}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'config' && (
            <>
              {!isSignedIn && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950">
                  <span>Masuk akun Google agar jadwal lapangan terkunci resmi di Cloud &amp; E-Ticket tersimpan.</span>
                  <button
                    type="button"
                    onClick={onPromptLogin}
                    className="px-3 py-1.5 bg-[#0F172A] text-white font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Masuk / Daftar
                  </button>
                </div>
              )}

              {/* Customer Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nama Pemesan / Koordinator
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Raka Pratama"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    No. WhatsApp (untuk E-Ticket)
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Payment Mode: Full vs Automatic Split Bill */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-800">Skema Pembayaran</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('full')}
                    className={`p-3.5 rounded-xl border text-left transition-colors ${
                      paymentMode === 'full'
                        ? 'border-emerald-500 bg-emerald-50/60'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-semibold text-sm text-slate-900">Bayar Penuh</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      1 transaksi langsung lunas ({formatIDR(selection.totalPrice)})
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('split')}
                    className={`p-3.5 rounded-xl border text-left transition-colors ${
                      paymentMode === 'split'
                        ? 'border-emerald-500 bg-emerald-50/60'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-600" />
                      Patungan (Split Bill)
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Bagi rata otomatis + link bayar teman
                    </p>
                  </button>
                </div>

                {/* Split Bill Calculator & Live Participant Tracker */}
                {paymentMode === 'split' && (
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/70 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Jumlah Peserta Patungan</p>
                        <p className="text-xs text-slate-500">
                          Iuran otomatis per orang:{' '}
                          <span className="font-mono font-bold text-emerald-700 tabular-nums">
                            {formatIDR(perPersonAmount)}
                          </span>
                        </p>
                      </div>
                      <div className="inline-flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setSplitCount((c) => Math.max(2, c - 1))}
                          className="px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
                        >
                          -
                        </button>
                        <span className="px-3.5 py-1.5 font-mono font-bold text-sm text-slate-900 tabular-nums border-x border-slate-200">
                          {splitCount} Org
                        </span>
                        <button
                          type="button"
                          onClick={() => setSplitCount((c) => Math.min(14, c + 1))}
                          className="px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Shareable Payment Link */}
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
                      <Link2 className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
                      <span className="font-mono text-xs text-slate-600 truncate flex-1">
                        {splitLink}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopySplitLink}
                        className="px-3 py-1.5 text-xs font-semibold bg-[#0F172A] text-white hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedLink ? 'Disalin' : 'Salin Link'}
                      </button>
                    </div>

                    {/* Live Participant Status Tracker */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700">
                          Status Patungan ({paidNowCount}/{splitCount} Lunas)
                        </span>
                        <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                          Terkumpul {formatIDR(Math.min(selection.totalPrice, paidNowCount * perPersonAmount))} / {formatIDR(selection.totalPrice)}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${(paidNowCount / splitCount) * 100}%` }}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white thin-scrollbar">
                        {splitParticipants.map((p, idx) => (
                          <div
                            key={p.id}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              {p.isHost ? (
                                <span className="font-medium text-slate-800 truncate block">{p.name}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={participantNames[idx] ?? ''}
                                  onChange={(e) =>
                                    setParticipantNames((prev) => ({ ...prev, [idx]: e.target.value }))
                                  }
                                  placeholder={`Nama Peserta ${idx + 1}`}
                                  className="w-full max-w-[180px] px-2 py-0.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              )}
                              <span className="font-mono text-slate-500 tabular-nums">
                                {formatIDR(p.amount)}
                              </span>
                            </div>
                            {p.isHost ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold whitespace-nowrap">
                                <Check className="w-3.5 h-3.5" />
                                Host (Checkout)
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleTogglePaid(p.id)}
                                className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-colors whitespace-nowrap inline-flex items-center gap-1 ${
                                  p.paid
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                                }`}
                              >
                                {p.paid ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    Lunas (QRIS)
                                  </>
                                ) : (
                                  'Konfirmasi Bayar'
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Publish as Open Play (Mabar) Toggle */}
              <div className="p-4 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm text-slate-900">
                      Publikasikan sebagai Open Play (Mabar)
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Buka slot agar komunitas Bandung bisa ikut gabung, patungan otomatis, dan masuk ke Chat Lobi.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={publishOpenPlay}
                    onClick={() => setPublishOpenPlay((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                      publishOpenPlay ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 bg-white rounded-full shadow transition-transform transform ${
                        publishOpenPlay ? 'translate-x-5.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {publishOpenPlay && (
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Judul Sesi Mabar
                      </label>
                      <input
                        type="text"
                        value={mabarTitle}
                        onChange={(e) => setMabarTitle(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Kuota Total Pemain
                        </label>
                        <input
                          type="number"
                          min={2}
                          max={24}
                          value={mabarQuota}
                          onChange={(e) => setMabarQuota(Math.max(2, Math.min(24, Number(e.target.value) || 4)))}
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 tabular-nums"
                        />
                        <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                          Estimasi patungan Mabar: {formatIDR(Math.ceil(selection.totalPrice / mabarQuota / 1000) * 1000)}/orang
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Level Permainan
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['Pemula', 'Menengah', 'Mahir'] as SkillLevel[]).map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() => setMabarSkill(lvl)}
                              className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                                mabarSkill === lvl
                                  ? 'bg-amber-400 border-amber-500 text-slate-950'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Catatan untuk Peserta
                      </label>
                      <textarea
                        rows={2}
                        value={mabarDesc}
                        onChange={(e) => setMabarDesc(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'payment' && (
            <div className="space-y-5">
              {/* Real-time Slot Lock Banner */}
              <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-medium">
                  <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Slot sementara dikunci untuk mencegah double-booking</span>
                </div>
                <span className="font-mono font-bold text-emerald-800 tabular-nums shrink-0 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {mins}:{secs}
                </span>
              </div>

              {conflictError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{conflictError}</span>
                </div>
              )}

              {/* Payment Method Selector */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-slate-800">Pilih Metode Pembayaran</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'QRIS' as PaymentMethod, label: 'QRIS Instan', sub: 'GoPay / OVO / BCA' },
                    { id: 'VA_BCA' as PaymentMethod, label: 'BCA Virtual Acc', sub: 'Verifikasi otomatis' },
                    { id: 'VA_MANDIRI' as PaymentMethod, label: 'Mandiri VA', sub: 'Verifikasi otomatis' },
                    { id: 'VA_BNI' as PaymentMethod, label: 'BNI VA', sub: 'Verifikasi otomatis' },
                  ].map((ch) => {
                    const active = paymentMethod === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setPaymentMethod(ch.id)}
                        className={`p-3 rounded-xl border text-left transition-colors ${
                          active
                            ? 'border-[#0F172A] bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <p className="text-xs font-bold">{ch.label}</p>
                        <p className={`text-[10px] mt-0.5 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                          {ch.sub}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Payment Panel */}
              <div className="p-5 border border-slate-200 rounded-xl bg-slate-50/70">
                {paymentMethod === 'QRIS' ? (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="p-3 bg-white border border-slate-200 rounded-xl shrink-0">
                      <QrCodeSvg value={`QRIS|COURTSYNC|${draftBookingCode}|${amountDueNow}`} size={148} />
                    </div>
                    <div className="space-y-2 text-center sm:text-left">
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <QrCode className="w-4 h-4 text-emerald-600" />
                        QRIS Nasional — CourtSync Bandung
                      </div>
                      <p className="text-xs text-slate-600">
                        Scan menggunakan BCA Mobile, Livin&apos;, GoPay, OVO, Dana, atau ShopeePay.
                      </p>
                      <div className="pt-1">
                        <p className="text-[11px] text-slate-500">
                          {paymentMode === 'split' ? 'Tagihan Porsi Host Sekarang' : 'Total Tagihan'}
                        </p>
                        <p className="font-mono font-extrabold text-xl text-slate-900 tabular-nums">
                          {formatIDR(amountDueNow)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Building className="w-4 h-4 text-emerald-600" />
                      Nomor Virtual Account ({paymentMethod.replace('VA_', '')})
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3.5 bg-white border border-slate-200 rounded-lg">
                      <span className="font-mono font-bold text-base sm:text-lg text-slate-900 tracking-wider tabular-nums">
                        {vaNumber}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyVa}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        {copiedVa ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedVa ? 'Disalin' : 'Salin VA'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Nominal Transfer</span>
                      <span className="font-mono font-bold text-sm text-slate-900 tabular-nums">
                        {formatIDR(amountDueNow)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'ticket' && confirmedBooking && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-900 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Pembayaran terverifikasi! Jadwal kamu otomatis tersinkronisasi dengan kasir{' '}
                  {selection.venue.name}.
                </span>
              </div>

              <ETicketCard
                booking={confirmedBooking}
                venue={selection.venue}
                onMarkParticipantPaid={(bookingId, participantId) => {
                  onMarkParticipantPaid(bookingId, participantId);
                  setConfirmedBooking((prev) => {
                    if (!prev || prev.id !== bookingId || !prev.splitParticipants) return prev;
                    return {
                      ...prev,
                      splitParticipants: prev.splitParticipants.map((p) =>
                        p.id === participantId ? { ...p, paid: true, paidAt: 'Baru saja' } : p
                      ),
                    };
                  });
                }}
                onOpenMabarChat={(openPlayId) => {
                  onClose();
                  onOpenMabarChat(openPlayId);
                }}
              />
            </div>
          )}
        </div>

        {/* Sticky Modal Footer */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          {step === 'config' && (
            <>
              <div>
                <p className="text-[11px] text-slate-500">
                  {paymentMode === 'split' ? 'Bayar porsi Host sekarang' : 'Total bayar'}
                </p>
                <p className="font-mono font-extrabold text-base text-slate-900 tabular-nums">
                  {formatIDR(amountDueNow)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep('payment')}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-display font-bold text-sm rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                <CreditCard className="w-4 h-4" />
                Lanjut ke Pembayaran
              </button>
            </>
          )}

          {step === 'payment' && (
            <>
              <button
                type="button"
                onClick={() => setStep('config')}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-950 border border-slate-300 bg-white rounded-xl transition-colors"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleConfirmPayment()}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-slate-950 font-display font-bold text-sm rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mengunci Slot di Cloud...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Konfirmasi Bayar &amp; Terbitkan E-Ticket
                  </>
                )}
              </button>
            </>
          )}

          {step === 'ticket' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToTickets();
                }}
                className="px-5 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white font-display font-semibold text-xs rounded-xl transition-colors whitespace-nowrap"
              >
                Lihat di Tiket Saya
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
