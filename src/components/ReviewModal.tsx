import React, { useState } from 'react';
import { Check, Loader2, ShieldCheck, Star, X } from 'lucide-react';
import { Booking, Venue } from '../types/courtsync';
import { formatDateIndo, formatHourRange } from '../utils/format';

interface ReviewModalProps {
  booking: Booking;
  venue: Venue;
  defaultReviewerName: string;
  isSignedIn: boolean;
  onClose: () => void;
  onSubmitReview: (payload: {
    venueId: string;
    bookingId: string;
    bookingCode: string;
    courtName: string;
    reviewerName: string;
    rating: number;
    comment: string;
    tags: string[];
    playedDate: string;
  }) => Promise<void>;
}

const RATING_LABELS: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Kurang Memuaskan', subtitle: 'Banyak hal yang perlu segera diperbaiki' },
  2: { title: 'Cukup Kurang', subtitle: 'Masih di bawah ekspektasi pemain' },
  3: { title: 'Cukup Oke', subtitle: 'Standar untuk main santai bersama teman' },
  4: { title: 'Sangat Bagus', subtitle: 'Nyaman, bersih, dan layak direkomendasikan' },
  5: { title: 'Juara Banget!', subtitle: 'Pengalaman main terbaik di Bandung' },
};

const REVIEW_TAGS = [
  'Lapangan Bersih',
  'Lampu Terang',
  'Parkir Luas',
  'Staff Ramah',
  'Toilet & Shower Nyaman',
  'Harga Worth It',
  'Check-in Cepat',
  'Fasilitas Lengkap',
];

export const ReviewModal: React.FC<ReviewModalProps> = ({
  booking,
  venue,
  defaultReviewerName,
  isSignedIn,
  onClose,
  onSubmitReview,
}) => {
  const court = venue.courts.find((c) => c.id === booking.courtId);
  const courtName = court?.name ?? booking.courtId;

  const [rating, setRating] = useState<number>(5);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>(['Lapangan Bersih', 'Check-in Cepat']);
  const [reviewerName, setReviewerName] = useState<string>(
    defaultReviewerName || booking.customerName.replace(/\s*\(Peserta Mabar\)\s*/i, '')
  );
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeStar = hoveredRating || rating;
  const activeLabel = RATING_LABELS[activeStar] ?? RATING_LABELS[5];

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 5 ? [...prev, tag] : prev
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanComment = comment.trim();
    if (cleanComment.length < 5) {
      setError('Tuliskan ulasan singkat minimal 5 karakter agar membantu pemain Bandung lainnya.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmitReview({
        venueId: venue.id,
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        courtName,
        reviewerName: reviewerName.trim() || 'Pemain CourtSync',
        rating,
        comment: cleanComment,
        tags: selectedTags,
        playedDate: booking.date,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim ulasan. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Beri Ulasan & Rating Venue"
        className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-[#0F172A] text-white px-5 py-4 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-xs font-semibold text-emerald-400">
              Sesi Selesai · Feedback Langsung untuk Mitra GOR
            </p>
            <h2 className="font-display font-bold text-lg tracking-tight mt-0.5">
              Beri Rating {venue.name}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {courtName} · {formatDateIndo(booking.date)} · {formatHourRange(booking.hours)} WIB
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal ulasan"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto thin-scrollbar">
          {/* Interactive 1-5 Star Selector */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center space-y-2.5">
            <p className="text-xs font-semibold text-slate-600">
              Bagaimana pengalaman mainmu di {venue.name}?
            </p>
            <div
              className="flex items-center justify-center gap-2"
              onMouseLeave={() => setHoveredRating(0)}
            >
              {[1, 2, 3, 4, 5].map((starValue) => {
                const filled = starValue <= activeStar;
                return (
                  <button
                    key={starValue}
                    type="button"
                    onClick={() => setRating(starValue)}
                    onMouseEnter={() => setHoveredRating(starValue)}
                    aria-label={`Beri ${starValue} bintang`}
                    className="p-1 rounded-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <Star
                      className={`w-9 h-9 transition-colors ${
                        filled
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-slate-100 text-slate-300'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <div>
              <p className="font-display font-bold text-sm text-slate-900">
                {activeStar}.0 / 5.0 — {activeLabel.title}
              </p>
              <p className="text-xs text-slate-500">{activeLabel.subtitle}</p>
            </div>
          </div>

          {/* Quick Highlight Tags */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Yang paling menonjol (pilih maks. 5)
              </label>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                {selectedTags.length}/5
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {REVIEW_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 ${
                      active
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {active && <Check className="w-3 h-3 text-emerald-600" />}
                    <span>{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reviewer Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama Tampil di Ulasan
            </label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              maxLength={80}
              placeholder="Contoh: Raka Pratama"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Written Feedback */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Ceritakan pengalaman mainmu
              </label>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {comment.length}/600
              </span>
            </div>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={600}
              placeholder={`Ceritakan kondisi lantai/karpet, pencahayaan, parkir, atau pelayanan di ${venue.name}...`}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              {isSignedIn
                ? `Tersimpan Cloud · Kode ${booking.bookingCode}`
                : `Terverifikasi sesi ${booking.bookingCode}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Nanti Saja
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-slate-950 font-display font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Kirim Ulasan ({rating}★)</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
