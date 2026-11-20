import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  OpenPlaySession,
  PaymentMethod,
  SkillLevel,
  SportCategory,
  Venue,
} from '../types/courtsync';
import { formatDateIndo, formatHourRange, formatIDR } from '../utils/format';
import { QrCodeSvg } from './QrCodeSvg';

interface OpenPlayFeedProps {
  sessions: OpenPlaySession[];
  venues: Venue[];
  onJoinSession: (sessionId: string, playerName: string, paymentMethod: PaymentMethod) => void;
  onOpenChat: (sessionId: string) => void;
  onCreateFromExplore: () => void;
}

const SPORTS: ('Semua' | SportCategory)[] = ['Semua', 'Badminton', 'Futsal', 'Mini Soccer', 'Padel'];
const LEVELS: ('Semua' | SkillLevel)[] = ['Semua', 'Pemula', 'Menengah', 'Mahir'];

export const OpenPlayFeed: React.FC<OpenPlayFeedProps> = ({
  sessions,
  venues,
  onJoinSession,
  onOpenChat,
  onCreateFromExplore,
}) => {
  const [sportFilter, setSportFilter] = useState<'Semua' | SportCategory>('Semua');
  const [levelFilter, setLevelFilter] = useState<'Semua' | SkillLevel>('Semua');
  const [checkoutSession, setCheckoutSession] = useState<OpenPlaySession | null>(null);
  const [playerName, setPlayerName] = useState('Andi Saputra');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('QRIS');

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const okSport = sportFilter === 'Semua' || s.sport === sportFilter;
      const okLevel = levelFilter === 'Semua' || s.skillLevel === levelFilter;
      return okSport && okLevel;
    });
  }, [sessions, sportFilter, levelFilter]);

  const getVenue = (id: string) => venues.find((v) => v.id === id);

  const handleConfirmJoin = () => {
    if (!checkoutSession) return;
    onJoinSession(checkoutSession.id, playerName.trim() || 'Pemain CourtSync', payMethod);
    const joinedId = checkoutSession.id;
    setCheckoutSession(null);
    onOpenChat(joinedId);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header Banner */}
      <section className="bg-[#0F172A] text-white rounded-2xl px-6 py-7 sm:px-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-semibold text-amber-400">
            Open Play & Matchmaking Komunitas Bandung
          </p>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight text-balance">
            Gabung sesi Mabar hari ini — slot lapangan sudah terkonfirmasi.
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Tidak perlu cari 10 orang dulu. Pilih level permainan yang cocok, bayar patungan per orang via QRIS, dan langsung koordinasi di Chat Lobi sementara.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateFromExplore}
          className="px-5 py-3 bg-amber-400 hover:bg-amber-500 text-slate-950 font-display font-bold text-xs sm:text-sm rounded-xl transition-colors whitespace-nowrap shrink-0 self-start lg:self-auto"
        >
          Buat Sesi Mabar Baru
        </button>
      </section>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {SPORTS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSportFilter(sp)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                sportFilter === sp
                  ? 'bg-[#0F172A] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {sp}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-slate-100 overflow-x-auto no-scrollbar">
          <span className="text-xs text-slate-500 mr-1 whitespace-nowrap">Level:</span>
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevelFilter(lvl)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                levelFilter === lvl
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Match Cards Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <p className="font-display font-bold text-slate-900">
            Belum ada sesi Mabar yang sesuai filter
          </p>
          <p className="text-xs text-slate-500">
            Ubah filter kategori/level atau booking lapangan sendiri lalu buka sebagai Open Play.
          </p>
          <button
            type="button"
            onClick={() => {
              setSportFilter('Semua');
              setLevelFilter('Semua');
            }}
            className="px-4 py-2 text-xs font-semibold bg-[#0F172A] text-white rounded-lg"
          >
            Tampilkan Semua Sesi
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((session) => {
            const venue = getVenue(session.venueId);
            const court = venue?.courts.find((c) => c.id === session.courtId);
            const remaining = Math.max(0, session.maxPlayers - session.currentPlayers);
            const isFull = remaining === 0;
            const fillPercent = Math.min(100, (session.currentPlayers / session.maxPlayers) * 100);

            return (
              <article
                key={session.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Card Top Bar */}
                  <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                          Open Play · {session.sport}
                        </span>
                        <span className="font-medium text-slate-600">
                          Level {session.skillLevel}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-slate-500">Host: {session.hostName}</span>
                      </div>
                      <h2 className="font-display font-bold text-lg text-slate-900 leading-snug">
                        {session.title}
                      </h2>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-mono font-extrabold text-base text-slate-900 tabular-nums">
                        {formatIDR(session.costPerPerson)}
                      </p>
                      <p className="text-[11px] text-slate-500">per orang</p>
                    </div>
                  </div>

                  {/* Venue & Schedule Details */}
                  <div className="px-5 pb-4 space-y-3">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {session.description}
                    </p>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{venue?.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{court?.name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-slate-900">{formatDateIndo(session.date)}</p>
                          <p className="font-mono text-[11px] text-slate-600 tabular-nums flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formatHourRange(session.hours)} WIB
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Slot Quota Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          {session.currentPlayers}/{session.maxPlayers} pemain bergabung
                        </span>
                        <span
                          className={`font-semibold tabular-nums ${
                            isFull ? 'text-slate-500' : remaining <= 2 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {isFull ? 'Kuota Penuh' : `Sisa ${remaining} slot`}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isFull ? 'bg-slate-400' : remaining <= 2 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${fillPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                  {session.joinedByCurrentUser ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                        <Check className="w-4 h-4" />
                        Slot Kamu Terkunci
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenChat(session.id)}
                        className="px-4 py-2 bg-[#0F172A] hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                        Buka Chat Lobi
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-slate-500">
                        {isFull ? 'Tunggu sesi berikutnya' : 'Konfirmasi instan · QRIS / VA'}
                      </span>
                      <button
                        type="button"
                        disabled={isFull}
                        onClick={() => setCheckoutSession(session)}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-500 text-slate-950 font-display font-bold text-xs rounded-lg transition-colors whitespace-nowrap"
                      >
                        {isFull ? 'Slot Penuh' : 'Gabung & Kunci Slot'}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Instant Checkout Modal for Joining Open Play */}
      {checkoutSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Gabung Open Play"
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="bg-[#0F172A] text-white px-5 py-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-amber-400">Checkout Instan Open Play</p>
                <h3 className="font-display font-bold text-base mt-0.5">{checkoutSession.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutSession(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <p className="font-semibold text-slate-900">
                  {getVenue(checkoutSession.venueId)?.name}
                </p>
                <p className="text-slate-600 font-mono tabular-nums">
                  {formatDateIndo(checkoutSession.date)} · {formatHourRange(checkoutSession.hours)} WIB
                </p>
                <p className="text-emerald-700 font-semibold pt-1">
                  Biaya Patungan: <span className="font-mono tabular-nums">{formatIDR(checkoutSession.costPerPerson)}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Kamu di Daftar Pemain
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(['QRIS', 'VA_BCA'] as PaymentMethod[]).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setPayMethod(pm)}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                      payMethod === pm
                        ? 'bg-[#0F172A] text-white border-[#0F172A]'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {pm === 'QRIS' ? 'QRIS Instan' : 'BCA Virtual Account'}
                  </button>
                ))}
              </div>

              {payMethod === 'QRIS' ? (
                <div className="flex flex-col items-center p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <QrCodeSvg value={`MABAR|${checkoutSession.id}|${checkoutSession.costPerPerson}`} size={128} />
                  <p className="text-[11px] text-slate-500 mt-2">
                    Scan QRIS untuk mengunci 1 slot & masuk ke Chat Lobi
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <p className="text-slate-500">Nomor BCA Virtual Account</p>
                  <p className="font-mono font-bold text-base text-slate-900 mt-1 tabular-nums">
                    3901 7721 0984 1120
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmJoin}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-display font-bold text-sm rounded-xl transition-colors inline-flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                Bayar {formatIDR(checkoutSession.costPerPerson)} & Kunci Slot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
