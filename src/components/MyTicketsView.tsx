import React from 'react';
import { Star, Ticket } from 'lucide-react';
import { Booking, Venue, VenueReview } from '../types/courtsync';
import { ETicketCard } from './ETicketCard';

interface MyTicketsViewProps {
  bookings: Booking[];
  venues: Venue[];
  reviews: VenueReview[];
  onSimulateParticipantPay: (bookingId: string, participantId: string) => void;
  onOpenMabarChat: (openPlayId: string) => void;
  onOpenReview: (booking: Booking, venue: Venue) => void;
  onExploreClick: () => void;
}

export const MyTicketsView: React.FC<MyTicketsViewProps> = ({
  bookings,
  venues,
  reviews,
  onSimulateParticipantPay,
  onOpenMabarChat,
  onOpenReview,
  onExploreClick,
}) => {
  const userBookings = bookings.filter((b) => b.isUserBooking && b.status !== 'cancelled');
  const reviewedBookingIds = new Set(reviews.map((r) => r.bookingId));
  const pendingReviewCount = userBookings.filter((b) => !reviewedBookingIds.has(b.id)).length;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-emerald-700">
            E-Ticket, Riwayat Patungan &amp; Ulasan Venue
          </p>
          <h1 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight mt-0.5">
            Tiket Aktif Saya
          </h1>
        </div>
        <button
          type="button"
          onClick={onExploreClick}
          className="px-4 py-2 text-xs font-semibold bg-[#0F172A] hover:bg-slate-800 text-white rounded-lg transition-colors"
        >
          Booking Lapangan Lainnya
        </button>
      </div>

      {pendingReviewCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 fill-slate-950" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                Ada {pendingReviewCount} sesi booking yang siap diberi ulasan bintang 1–5
              </p>
              <p className="text-xs text-slate-600">
                Feedback langsungmu membantu Mitra GOR Bandung meningkatkan kualitas lapangan dan fasilitas.
              </p>
            </div>
          </div>
        </div>
      )}

      {userBookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Ticket className="w-6 h-6" />
          </div>
          <h2 className="font-display font-bold text-lg text-slate-900">
            Belum ada E-Ticket aktif
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Booking lapangan di Bandung atau gabung sesi Open Play untuk mendapatkan E-Ticket QR otomatis di sini.
          </p>
          <button
            type="button"
            onClick={onExploreClick}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-display font-bold text-xs rounded-xl transition-colors"
          >
            Cari Lapangan Sekarang
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {userBookings.map((booking) => {
            const venue = venues.find((v) => v.id === booking.venueId);
            if (!venue) return null;
            const existingReview = reviews.find((r) => r.bookingId === booking.id);
            return (
              <ETicketCard
                key={booking.id}
                booking={booking}
                venue={venue}
                existingReview={existingReview}
                onSimulateParticipantPay={onSimulateParticipantPay}
                onOpenMabarChat={onOpenMabarChat}
                onOpenReview={onOpenReview}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

