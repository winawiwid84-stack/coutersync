import React, { useMemo, useState } from 'react';
import {
  Box,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  LayoutGrid,
  Map as MapIcon,
  MapPin,
  MessageSquareText,
  Search,
  Sparkles,
  Star,
  Tag,
} from 'lucide-react';
import {
  Booking,
  Court,
  DynamicPricingRule,
  SportCategory,
  Venue,
  VenueReview,
} from '../types/courtsync';
import {
  OPERATING_HOURS,
  calculateSlotPrice,
  formatDateIndo,
  formatHourRange,
  formatIDR,
  formatSingleHour,
  getNext7Days,
} from '../utils/format';
import { BandungVenueMap } from './BandungVenueMap';

export interface SelectedSlotPayload {
  venue: Venue;
  court: Court;
  date: string;
  hours: number[];
  totalPrice: number;
  originalPrice: number;
  discountApplied: number;
}

interface B2CVenueExplorerProps {
  venues: Venue[];
  bookings: Booking[];
  reviews: VenueReview[];
  pricingRules: Record<string, DynamicPricingRule>;
  onProceedToBooking: (payload: SelectedSlotPayload) => void;
  onJumpToMabar: () => void;
  onOpen3DViewer: (sport: SportCategory) => void;
  onGoToTicketsForReview: () => void;
  openPlayCount: number;
}

const SPORT_FILTERS: ('Semua' | SportCategory)[] = [
  'Semua',
  'Badminton',
  'Futsal',
  'Mini Soccer',
  'Padel',
];

export const B2CVenueExplorer: React.FC<B2CVenueExplorerProps> = ({
  venues,
  bookings,
  reviews,
  pricingRules,
  onProceedToBooking,
  onJumpToMabar,
  onOpen3DViewer,
  onGoToTicketsForReview,
  openPlayCount,
}) => {
  const days = useMemo(() => getNext7Days(), []);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedSport, setSelectedSport] = useState<'Semua' | SportCategory>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(days[0].iso);
  const [activeVenueId, setActiveVenueId] = useState<string>(venues[0]?.id ?? '');
  const [activeCourtId, setActiveCourtId] = useState<string>(venues[0]?.courts[0]?.id ?? '');
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  // Compute live aggregate rating & review list per venue
  const reviewsByVenue = useMemo(() => {
    const grouped: Record<string, VenueReview[]> = {};
    reviews.forEach((rev) => {
      if (!grouped[rev.venueId]) grouped[rev.venueId] = [];
      grouped[rev.venueId].push(rev);
    });
    return grouped;
  }, [reviews]);

  const getVenueRatingStats = (venue: Venue) => {
    const list = reviewsByVenue[venue.id] ?? [];
    if (list.length === 0) {
      return { avgRating: venue.rating, totalReviews: venue.reviewCount, list };
    }
    const avgOfSubmitted = list.reduce((sum, r) => sum + r.rating, 0) / list.length;
    // Blend base historical rating smoothly with live submitted reviews
    const baseWeight = Math.min(20, venue.reviewCount);
    const blended = (venue.rating * baseWeight + avgOfSubmitted * list.length) / (baseWeight + list.length);
    return {
      avgRating: Number(blended.toFixed(1)),
      totalReviews: venue.reviewCount + list.length,
      list,
    };
  };

  const filteredVenues = useMemo(() => {
    return venues.filter((v) => {
      const matchSport = selectedSport === 'Semua' || v.sport === selectedSport;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.area.toLowerCase().includes(q) ||
        v.sport.toLowerCase().includes(q);
      return matchSport && matchQuery;
    });
  }, [venues, selectedSport, searchQuery]);

  const activeVenue = useMemo(() => {
    const found = filteredVenues.find((v) => v.id === activeVenueId);
    return found ?? filteredVenues[0] ?? null;
  }, [filteredVenues, activeVenueId]);

  const activeCourt = useMemo(() => {
    if (!activeVenue) return null;
    return activeVenue.courts.find((c) => c.id === activeCourtId) ?? activeVenue.courts[0] ?? null;
  }, [activeVenue, activeCourtId]);

  const handleSelectVenue = (venue: Venue) => {
    setActiveVenueId(venue.id);
    setActiveCourtId(venue.courts[0]?.id ?? '');
    setSelectedHours([]);
  };

  const handleSelectCourt = (courtId: string) => {
    setActiveCourtId(courtId);
    setSelectedHours([]);
  };

  const handleSelectDate = (iso: string) => {
    setSelectedDate(iso);
    setSelectedHours([]);
  };

  // Map booked hours for active court + date
  const bookedHourMap = useMemo(() => {
    const map: Record<number, Booking> = {};
    if (!activeCourt) return map;
    bookings.forEach((b) => {
      if (b.courtId === activeCourt.id && b.date === selectedDate && b.status !== 'cancelled') {
        b.hours.forEach((h) => {
          map[h] = b;
        });
      }
    });
    return map;
  }, [bookings, activeCourt, selectedDate]);

  const toggleHour = (hour: number) => {
    if (bookedHourMap[hour]) return;
    setSelectedHours((prev) => {
      if (prev.includes(hour)) {
        return prev.filter((h) => h !== hour).sort((a, b) => a - b);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), hour].sort((a, b) => a - b);
      }
      return [...prev, hour].sort((a, b) => a - b);
    });
  };

  // Compute pricing for currently selected slots
  const selectionTotals = useMemo(() => {
    if (!activeVenue || !activeCourt || selectedHours.length === 0) {
      return { totalPrice: 0, originalPrice: 0, discountApplied: 0 };
    }
    const rule = pricingRules[activeVenue.id];
    let totalPrice = 0;
    let originalPrice = 0;
    selectedHours.forEach((h) => {
      const calc = calculateSlotPrice(activeCourt.basePricePerHour, selectedDate, h, rule);
      totalPrice += calc.finalPrice;
      originalPrice += activeCourt.basePricePerHour;
    });
    return {
      totalPrice,
      originalPrice,
      discountApplied: Math.max(0, originalPrice - totalPrice),
    };
  }, [activeVenue, activeCourt, selectedHours, selectedDate, pricingRules]);

  const handleContinueBooking = () => {
    if (!activeVenue || !activeCourt || selectedHours.length === 0) return;
    onProceedToBooking({
      venue: activeVenue,
      court: activeCourt,
      date: selectedDate,
      hours: selectedHours,
      ...selectionTotals,
    });
  };

  const activeRule = activeVenue ? pricingRules[activeVenue.id] : undefined;

  return (
    <div className="space-y-8 pb-24">
      {/* Compact Energetic Hero & Search Strip */}
      <section className="bg-[#0F172A] text-white rounded-2xl px-6 py-7 sm:px-8 sm:py-9">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-7 space-y-3">
            <p className="text-xs font-medium text-emerald-400">
              Bandung, Jawa Barat · Booking Real-Time & Patungan Otomatis
            </p>
            <h1 className="font-display font-extrabold text-2xl sm:text-4xl tracking-tight leading-tight text-balance">
              Kunci lapangan favoritmu di Bandung, tanpa ribet konfirmasi manual.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
              Cek ketersediaan slot live 08:00–22:00, nikmati diskon otomatis jam sepi, patungan link QRIS bareng teman, atau gabung sesi Open Play komunitas.
            </p>
          </div>
          <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari GOR Cikutra, Dago, Buah Batu, Pasteur..."
                className="w-full pl-10 pr-4 py-3 text-sm bg-slate-800/90 border border-slate-700 text-white placeholder:text-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <button
              type="button"
              onClick={onJumpToMabar}
              className="inline-flex items-center justify-between gap-3 px-4 py-3 bg-amber-400/15 hover:bg-amber-400/20 border border-amber-400/35 rounded-xl text-left transition-colors"
            >
              <div>
                <p className="text-xs font-semibold text-amber-300">Cari lawan main hari ini?</p>
                <p className="text-xs text-slate-200 mt-0.5">
                  Lihat {openPlayCount} sesi Open Play (Mabar) aktif di Bandung
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-300 shrink-0" />
            </button>
          </div>
        </div>

        {/* Sport Category Filter Controls */}
        <div className="mt-6 pt-5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {SPORT_FILTERS.map((sport) => {
              const active = selectedSport === sport;
              return (
                <button
                  key={sport}
                  type="button"
                  onClick={() => {
                    setSelectedSport(sport);
                    setSelectedHours([]);
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {sport}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              role="group"
              aria-label="Mode tampilan venue"
              className="inline-flex items-center p-1 bg-slate-800 border border-slate-700 rounded-lg"
            >
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === 'list'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Jadwal &amp; Slot</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === 'map'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Peta GOR Bandung</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                onOpen3DViewer(
                  selectedSport === 'Semua' ? activeVenue?.sport ?? 'Badminton' : selectedSport
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 transition-colors whitespace-nowrap"
            >
              <Box className="w-3.5 h-3.5" />
              <span>Tur 3D Lapangan</span>
            </button>
          </div>
        </div>
      </section>

      {/* Interactive Google Maps Bandung View */}
      {viewMode === 'map' ? (
        <BandungVenueMap
          selectedSport={selectedSport}
          venues={venues}
          onSelectCourtSyncVenue={(venueId) => {
            const target = venues.find((v) => v.id === venueId);
            if (target) {
              setSelectedSport('Semua');
              handleSelectVenue(target);
              setViewMode('list');
            }
          }}
          onOpen3DForSport={(sport) => onOpen3DViewer(sport)}
        />
      ) : filteredVenues.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <p className="font-display font-bold text-slate-900 text-lg">
            Venue tidak ditemukan untuk pencarian "{searchQuery}"
          </p>
          <p className="text-sm text-slate-500">
            Coba pilih kategori olahraga lain atau reset kata kunci lokasi Bandung.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedSport('Semua');
              setSearchQuery('');
            }}
            className="px-4 py-2 text-xs font-semibold bg-[#0F172A] text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Reset Filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Venue Cards */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-slate-900">
                Pilih Venue Bandung
              </h2>
              <span className="text-xs text-slate-500">Klik untuk cek slot jam</span>
            </div>

            <div className="space-y-3">
              {filteredVenues.map((venue) => {
                const isSelected = activeVenue?.id === venue.id;
                const minPrice = Math.min(...venue.courts.map((c) => c.basePricePerHour));
                const rule = pricingRules[venue.id];
                const hasImgError = imgErrors[venue.id];

                return (
                  <button
                    key={venue.id}
                    type="button"
                    onClick={() => handleSelectVenue(venue)}
                    className={`w-full text-left bg-white rounded-xl overflow-hidden transition-all border ${
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row">
                      {/* Venue Thumbnail */}
                      <div className="sm:w-36 h-36 sm:h-auto shrink-0 relative bg-slate-900 overflow-hidden">
                        {!hasImgError ? (
                          <img
                            src={venue.imageUrl}
                            alt={venue.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setImgErrors((prev) => ({ ...prev, [venue.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-slate-800 to-slate-950 text-slate-200">
                            <span className="font-display font-bold text-xs">{venue.sport}</span>
                            <span className="text-[11px] text-slate-400 mt-0.5">{venue.area}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent sm:hidden" />
                      </div>

                      {/* Venue Content */}
                      <div className="p-4 flex-1 min-w-0 flex flex-col justify-between gap-2">
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {venue.sport} · {venue.courts.length} Lapangan
                            </span>
                            {(() => {
                              const stats = getVenueRatingStats(venue);
                              return (
                                <span className="inline-flex items-center gap-1 font-mono font-semibold text-slate-800 tabular-nums">
                                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                  {stats.avgRating.toFixed(1)}
                                  <span className="font-sans font-normal text-[11px] text-slate-400">
                                    ({stats.totalReviews})
                                  </span>
                                </span>
                              );
                            })()}
                          </div>

                          <h3 className="font-display font-bold text-slate-900 text-base leading-snug mt-1 truncate">
                            {venue.name}
                          </h3>

                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 truncate">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{venue.area}</span>
                          </p>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-end justify-between gap-2">
                          <div>
                            <p className="text-[11px] text-slate-500">Mulai dari</p>
                            <p className="font-mono font-bold text-sm text-slate-900 tabular-nums">
                              {formatIDR(minPrice)}
                              <span className="font-sans font-normal text-xs text-slate-500">/jam</span>
                            </p>
                          </div>
                          {rule?.enabled && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md whitespace-nowrap">
                              <Tag className="w-3 h-3" />
                              Promo -{rule.discountPercent}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Live Schedule & Interactive Time-Slot Grid */}
          {activeVenue && activeCourt && (
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {/* Venue Detail Banner */}
              <div className="p-5 sm:p-6 border-b border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-emerald-700">
                      {activeVenue.sport} · Buka {formatSingleHour(activeVenue.openHour)} – {formatSingleHour(activeVenue.closeHour)} WIB
                    </p>
                    <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight mt-0.5">
                      {activeVenue.name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {activeVenue.address}
                    </p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpen3DViewer(activeVenue.sport)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Box className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Lihat Lapangan 3D</span>
                    </button>
                    {activeRule?.enabled && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                        <p className="font-semibold text-amber-900 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                          {activeRule.label} (-{activeRule.discountPercent}%)
                        </p>
                        <p className="text-amber-800/90 mt-0.5 font-mono tabular-nums text-[11px]">
                          Jam {formatSingleHour(activeRule.startHour)} – {formatSingleHour(activeRule.endHour)} WIB
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Unboxed inline facilities list */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                  {activeVenue.facilities.map((fac, idx) => (
                    <React.Fragment key={fac}>
                      <span>{fac}</span>
                      {idx < activeVenue.facilities.length - 1 && (
                        <span className="text-slate-300" aria-hidden="true">·</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Date Selector Rail */}
              <div className="px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    Pilih Tanggal Main
                  </span>
                  <span className="text-xs text-slate-500">{formatDateIndo(selectedDate)}</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {days.map((d) => {
                    const active = d.iso === selectedDate;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => handleSelectDate(d.iso)}
                        className={`py-2 px-1 rounded-lg text-center transition-colors border ${
                          active
                            ? 'bg-[#0F172A] text-white border-[#0F172A]'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <p className={`text-[11px] font-medium ${active ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {d.isToday ? 'Hari Ini' : d.dayShort}
                        </p>
                        <p className="font-mono font-bold text-sm tabular-nums mt-0.5">{d.dateNum}</p>
                        <p className={`text-[10px] ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                          {d.monthShort}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Court Selector Tabs */}
              <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-700 mb-2.5">Pilih Lapangan</p>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {activeVenue.courts.map((court) => {
                    const active = court.id === activeCourt.id;
                    return (
                      <button
                        key={court.id}
                        type="button"
                        onClick={() => handleSelectCourt(court.id)}
                        className={`px-3.5 py-2 rounded-lg border text-left transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-[#0F172A] text-white border-[#0F172A]'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <p className="text-xs font-semibold">{court.name}</p>
                        <p className={`text-[11px] mt-0.5 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                          {court.surface}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hourly Time-Slot Grid (08:00 - 22:00) */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Jadwal Live 08:00 – 22:00 WIB (Pilih hingga 4 jam)
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500" />
                      Tersedia
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/25 border border-amber-500" />
                      Promo Off-Peak
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 border border-slate-300" />
                      Terisi
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {OPERATING_HOURS.map((hour) => {
                    const booked = bookedHourMap[hour];
                    const isPicked = selectedHours.includes(hour);
                    const priceInfo = calculateSlotPrice(
                      activeCourt.basePricePerHour,
                      selectedDate,
                      hour,
                      activeRule
                    );

                    if (booked) {
                      return (
                        <div
                          key={hour}
                          aria-disabled="true"
                          className="p-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed select-none"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-xs tabular-nums">
                              {formatSingleHour(hour)} – {formatSingleHour(hour + 1)}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium mt-2">
                            {booked.source === 'member' ? 'Terisi · Member' : 'Terisi'}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={hour}
                        type="button"
                        onClick={() => toggleHour(hour)}
                        className={`p-3 rounded-xl border text-left transition-all relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                          isPicked
                            ? 'bg-[#0F172A] border-[#0F172A] text-white'
                            : priceInfo.isPromo
                            ? 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-500 text-slate-900'
                            : 'bg-white border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50/40 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-bold text-xs tabular-nums">
                            {formatSingleHour(hour)}–{formatSingleHour(hour + 1)}
                          </span>
                          {isPicked ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : priceInfo.isPromo ? (
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 tabular-nums">
                              -{priceInfo.discountPercent}%
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2">
                          {priceInfo.isPromo && !isPicked && (
                            <p className="font-mono text-[10px] line-through text-slate-400 tabular-nums">
                              {formatIDR(activeCourt.basePricePerHour)}
                            </p>
                          )}
                          <p
                            className={`font-mono font-bold text-xs tabular-nums ${
                              isPicked ? 'text-emerald-400' : 'text-emerald-700'
                            }`}
                          >
                            {formatIDR(priceInfo.finalPrice)}
                          </p>
                          <p
                            className={`text-[10px] mt-0.5 font-medium ${
                              isPicked
                                ? 'text-slate-300'
                                : priceInfo.isPromo
                                ? 'text-amber-700'
                                : 'text-emerald-700/80'
                            }`}
                          >
                            {isPicked
                              ? 'Dipilih'
                              : priceInfo.isPromo
                              ? 'Promo Off-Peak'
                              : 'Tersedia'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Inline Selection Summary & Primary CTA */}
                <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {selectedHours.length > 0 ? (
                    <>
                      <div>
                        <p className="text-xs text-slate-500">
                          {activeCourt.name} · {selectedHours.length} jam ({formatHourRange(selectedHours)} WIB)
                        </p>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <p className="font-mono font-extrabold text-lg text-slate-900 tabular-nums">
                            {formatIDR(selectionTotals.totalPrice)}
                          </p>
                          {selectionTotals.discountApplied > 0 && (
                            <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                              Hemat {formatIDR(selectionTotals.discountApplied)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleContinueBooking}
                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-display font-bold text-sm rounded-xl transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-2"
                      >
                        <span>Lanjut Booking & Patungan</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="w-full flex items-center justify-between text-xs text-slate-500">
                      <span>Pilih satu atau beberapa slot hijau di atas untuk mulai booking.</span>
                      <span className="font-mono text-slate-700 font-semibold hidden sm:inline">
                        Instant Lock · QRIS & VA
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Player Reviews & 1-5 Star Rating Breakdown */}
              {(() => {
                const stats = getVenueRatingStats(activeVenue);
                return (
                  <div className="p-5 sm:p-6 bg-slate-50/70 border-t border-slate-200 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-center">
                          <p className="font-mono font-extrabold text-xl text-slate-900 tabular-nums leading-none">
                            {stats.avgRating.toFixed(1)}
                          </p>
                          <div className="flex items-center justify-center gap-0.5 mt-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${
                                  s <= Math.round(stats.avgRating)
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-300'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-sm text-slate-900 flex items-center gap-1.5">
                            <MessageSquareText className="w-4 h-4 text-emerald-600" />
                            Ulasan Pemain Terverifikasi
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {stats.totalReviews} rating komunitas Bandung · Feedback langsung pasca-sesi
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={onGoToTicketsForReview}
                        className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Beri Ulasan dari Tiket Saya
                      </button>
                    </div>

                    {stats.list.length > 0 && (
                      <div className="space-y-2.5">
                        {stats.list.slice(0, 4).map((rev) => (
                          <div
                            key={rev.id}
                            className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="font-semibold text-xs text-slate-900">
                                  {rev.reviewerName}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {rev.courtName} · {rev.createdAtLabel}
                                </p>
                              </div>
                              <div className="inline-flex items-center gap-0.5 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                <span className="font-mono font-bold text-xs text-slate-900 tabular-nums">
                                  {rev.rating}.0
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">{rev.comment}</p>
                            {rev.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {rev.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
