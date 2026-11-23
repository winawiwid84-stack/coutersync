import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  MapPin,
  MessageSquare,
  Share2,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { Booking, Venue, VenueReview } from '../types/courtsync';
import { formatDateIndo, formatHourRange, formatIDR } from '../utils/format';
import { QrCodeSvg } from './QrCodeSvg';

interface ETicketCardProps {
  booking: Booking;
  venue: Venue;
  existingReview?: VenueReview;
  onMarkParticipantPaid?: (bookingId: string, participantId: string) => void;
  onOpenMabarChat?: (openPlayId: string) => void;
  onOpenReview?: (booking: Booking, venue: Venue) => void;
  onCancelBooking?: (bookingId: string) => Promise<void>;
  compact?: boolean;
}

export const ETicketCard: React.FC<ETicketCardProps> = ({
  booking,
  venue,
  existingReview,
  onMarkParticipantPaid,
  onOpenMabarChat,
  onOpenReview,
  onCancelBooking,
  compact = false,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const court = venue.courts.find((c) => c.id === booking.courtId);
  const paidCount = booking.splitParticipants?.filter((p) => p.paid).length ?? 0;
  const totalParticipants = booking.splitParticipants?.length ?? 0;

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(booking.bookingCode).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleCopySplitLink = () => {
    if (!booking.splitLink) return;
    navigator.clipboard?.writeText(booking.splitLink).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Top Slate Header */}
      <div className="bg-[#0F172A] text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 font-medium">E-Ticket Resmi CourtSync</p>
          <h4 className="font-display font-bold text-base sm:text-lg tracking-tight mt-0.5">
            {venue.name}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {booking.checkedInAt && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 bg-amber-500/15 border border-amber-400/30 px-2.5 py-1 rounded-md">
              <Check className="w-3.5 h-3.5" />
              Check-In · {booking.checkedInAt}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-1 rounded-md">
            <ShieldCheck className="w-3.5 h-3.5" />
            {booking.paymentMode === 'split' && paidCount < totalParticipants
              ? `Patungan ${paidCount}/${totalParticipants}`
              : 'Lunas & Terkunci'}
          </span>
        </div>
      </div>

      <div className={`p-5 ${compact ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-12 gap-6 items-start'}`}>
        {/* Details column */}
        <div className={compact ? 'space-y-4' : 'md:col-span-7 space-y-4'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Lapangan</p>
              <p className="font-semibold text-slate-900 mt-0.5">{court?.name ?? booking.courtId}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Pemesan</p>
              <p className="font-semibold text-slate-900 mt-0.5">{booking.customerName}</p>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Tanggal Main</p>
                <p className="font-semibold text-slate-900">{formatDateIndo(booking.date)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Jadwal ({booking.hours.length} Jam)</p>
                <p className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatHourRange(booking.hours)} WIB
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-slate-600 pt-3 border-t border-slate-100">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>{venue.address}</span>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-sm">
            <div>
              <p className="text-xs text-slate-500">Total Pembayaran ({booking.paymentMethod.replace('_', ' ')})</p>
              <p className="font-mono font-bold text-base text-slate-900 tabular-nums mt-0.5">
                {formatIDR(booking.totalPrice)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {booking.bookingCode}
            </button>
          </div>

          {/* Split Bill Participant Status */}
          {booking.paymentMode === 'split' && booking.splitParticipants && booking.splitParticipants.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Status Patungan ({paidCount}/{totalParticipants} Lunas)
                </div>
                {booking.splitLink && (
                  <button
                    type="button"
                    onClick={handleCopySplitLink}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Link Patungan Disalin!' : 'Salin Link Patungan'}
                  </button>
                )}
              </div>

              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${(paidCount / totalParticipants) * 100}%` }}
                />
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50">
                {booking.splitParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{p.name}</p>
                      <p className="font-mono text-slate-500 tabular-nums">{formatIDR(p.amount)}</p>
                    </div>
                    {p.paid ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold whitespace-nowrap shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        Lunas {p.paidAt ? `· ${p.paidAt}` : ''}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-amber-700 font-medium">Menunggu</span>
                        {onMarkParticipantPaid && (
                          <button
                            type="button"
                            onClick={() => onMarkParticipantPaid(booking.id, p.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-amber-300 hover:border-emerald-500 hover:text-emerald-700 text-amber-900 rounded-md transition-colors whitespace-nowrap"
                          >
                            Konfirmasi Bayar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Row: Open Play Lobby Chat + Post-Booking Venue Rating & Review */}
          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            {booking.openPlayId && onOpenMabarChat && (
              <button
                type="button"
                onClick={() => onOpenMabarChat(booking.openPlayId!)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-amber-950 bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors whitespace-nowrap"
              >
                <MessageSquare className="w-4 h-4" />
                Buka Chat Lobi Mabar
              </button>
            )}

            {!compact && onOpenReview && !existingReview && (
              <button
                type="button"
                onClick={() => onOpenReview(booking, venue)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                Selesai Main? Beri Ulasan &amp; Rating
              </button>
            )}

            {!compact && onCancelBooking && !booking.checkedInAt && (
              confirmCancel ? (
                <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg text-xs">
                  <span className="text-red-800 font-medium">Batalkan &amp; lepas slot?</span>
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={async () => {
                      setIsCancelling(true);
                      try {
                        await onCancelBooking(booking.id);
                      } finally {
                        setIsCancelling(false);
                        setConfirmCancel(false);
                      }
                    }}
                    className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded"
                  >
                    {isCancelling ? '...' : 'Ya'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(false)}
                    className="px-2 py-0.5 text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="text-xs font-medium text-slate-500 hover:text-red-600 px-2 py-1.5 transition-colors"
                >
                  Batalkan Booking
                </button>
              )
            )}
          </div>

          {/* Submitted Review Confirmation Card */}
          {existingReview && (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-900">
                  Ulasanmu Terkirim untuk {venue.name}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3.5 h-3.5 ${
                        star <= existingReview.rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300'
                      }`}
                    />
                  ))}
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                &ldquo;{existingReview.comment}&rdquo;
              </p>
              {existingReview.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {existingReview.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-semibold text-emerald-800 bg-white border border-emerald-200 px-2 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dynamic QR Check-In Section */}
        <div
          className={`${
            compact ? 'pt-4 border-t border-dashed border-slate-200' : 'md:col-span-5 md:border-l md:border-dashed md:border-slate-200 md:pl-6'
          } flex flex-col items-center justify-center text-center`}
        >
          <div className="p-3 bg-white border border-slate-200 rounded-xl">
            <QrCodeSvg value={`COURTSYNC|${booking.bookingCode}|${venue.id}|${booking.date}`} size={152} />
          </div>
          <p className="font-mono text-xs font-bold text-slate-900 mt-3 tracking-wider">
            {booking.bookingCode}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
            Tunjukkan QR ini ke petugas kasir {venue.name} untuk check-in lapangan.
          </p>
        </div>
      </div>
    </div>
  );
};
