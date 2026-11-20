import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  Landmark,
  Percent,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  B2BTab,
  Booking,
  BookingSource,
  DynamicPricingRule,
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

interface B2BOwnerDashboardProps {
  venues: Venue[];
  bookings: Booking[];
  reviews: VenueReview[];
  pricingRules: Record<string, DynamicPricingRule>;
  activeTab: B2BTab;
  onTabChange: (tab: B2BTab) => void;
  onAddManualBooking: (params: {
    venueId: string;
    courtId: string;
    date: string;
    hours: number[];
    customerName: string;
    customerPhone: string;
    source: BookingSource;
    totalPrice: number;
    notes?: string;
  }) => { ok: boolean; error?: string };
  onCancelBooking: (bookingId: string) => void;
  onUpdatePricingRule: (venueId: string, rule: DynamicPricingRule) => void;
  onPreviewInB2C: () => void;
}

const WEEKDAYS = [
  { id: 1, short: 'Sen' },
  { id: 2, short: 'Sel' },
  { id: 3, short: 'Rab' },
  { id: 4, short: 'Kam' },
  { id: 5, short: 'Jum' },
  { id: 6, short: 'Sab' },
  { id: 0, short: 'Min' },
];

export const B2BOwnerDashboard: React.FC<B2BOwnerDashboardProps> = ({
  venues,
  bookings,
  reviews,
  pricingRules,
  activeTab,
  onTabChange,
  onAddManualBooking,
  onCancelBooking,
  onUpdatePricingRule,
  onPreviewInB2C,
}) => {
  const days = useMemo(() => getNext7Days(), []);
  const [selectedVenueId, setSelectedVenueId] = useState(venues[0]?.id ?? '');
  const [selectedDate, setSelectedDate] = useState(days[0].iso);
  const [inspectedBooking, setInspectedBooking] = useState<Booking | null>(null);

  // Walk-In Modal state
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [wiCourtId, setWiCourtId] = useState('');
  const [wiDate, setWiDate] = useState(days[0].iso);
  const [wiStartHour, setWiStartHour] = useState(14);
  const [wiDuration, setWiDuration] = useState(2);
  const [wiName, setWiName] = useState('');
  const [wiPhone, setWiPhone] = useState('');
  const [wiSource, setWiSource] = useState<'walkin' | 'member'>('walkin');
  const [wiNotes, setWiNotes] = useState('');
  const [wiToast, setWiToast] = useState<string | null>(null);

  const venue = useMemo(
    () => venues.find((v) => v.id === selectedVenueId) ?? venues[0],
    [venues, selectedVenueId]
  );

  const rule = pricingRules[venue.id] ?? {
    venueId: venue.id,
    enabled: false,
    days: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 15,
    discountPercent: 20,
    label: 'Promo Off-Peak',
  };

  // Venue bookings for selected date & overall
  const venueAllBookings = useMemo(
    () => bookings.filter((b) => b.venueId === venue.id && b.status !== 'cancelled'),
    [bookings, venue.id]
  );

  const venueDateBookings = useMemo(
    () => venueAllBookings.filter((b) => b.date === selectedDate),
    [venueAllBookings, selectedDate]
  );

  // Metrics & H+1 Settlement calculation
  const metrics = useMemo(() => {
    const totalSlotsToday = venue.courts.length * OPERATING_HOURS.length;
    const bookedHoursToday = venueDateBookings.reduce((sum, b) => sum + b.hours.length, 0);
    const occupancyPct = totalSlotsToday > 0 ? Math.round((bookedHoursToday / totalSlotsToday) * 100) : 0;

    const todayRevenue = venueDateBookings.reduce((sum, b) => sum + b.totalPrice, 0);
    const onlineGross = venueAllBookings
      .filter((b) => b.source === 'online')
      .reduce((sum, b) => sum + b.totalPrice, 0);
    const walkInTotal = venueAllBookings
      .filter((b) => b.source === 'walkin')
      .reduce((sum, b) => sum + b.totalPrice, 0);
    const memberTotal = venueAllBookings
      .filter((b) => b.source === 'member')
      .reduce((sum, b) => sum + b.totalPrice, 0);

    const platformFee = Math.round(onlineGross * 0.025);
    const netSettlementH1 = Math.max(0, onlineGross - platformFee);

    return {
      occupancyPct,
      bookedHoursToday,
      totalSlotsToday,
      todayRevenue,
      onlineGross,
      walkInTotal,
      memberTotal,
      platformFee,
      netSettlementH1,
      onlineCount: venueDateBookings.filter((b) => b.source === 'online').length,
      memberCount: venueDateBookings.filter((b) => b.source === 'member').length,
      walkInCount: venueDateBookings.filter((b) => b.source === 'walkin').length,
    };
  }, [venue, venueDateBookings, venueAllBookings]);

  // Open Walk-In Modal (optionally prefilled from clicking an empty slot)
  const openWalkInModal = (courtId?: string, hour?: number) => {
    setWiCourtId(courtId ?? venue.courts[0]?.id ?? '');
    setWiDate(selectedDate);
    setWiStartHour(hour ?? 14);
    setWiDuration(1);
    setWiName('');
    setWiPhone('');
    setWiSource('walkin');
    setWiNotes('');
    setWalkInOpen(true);
  };

  // Requested hours for Walk-In Modal
  const requestedWiHours = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < wiDuration; i++) {
      if (wiStartHour + i <= 21) {
        arr.push(wiStartHour + i);
      }
    }
    return arr;
  }, [wiStartHour, wiDuration]);

  // Real-time Anti-Double-Booking Conflict Detection
  const wiConflict = useMemo(() => {
    if (!walkInOpen || !wiCourtId) return null;
    for (const h of requestedWiHours) {
      const existing = bookings.find(
        (b) =>
          b.courtId === wiCourtId &&
          b.date === wiDate &&
          b.status !== 'cancelled' &&
          b.hours.includes(h)
      );
      if (existing) {
        return {
          hour: h,
          booking: existing,
        };
      }
    }
    return null;
  }, [walkInOpen, wiCourtId, wiDate, requestedWiHours, bookings]);

  const wiEstimatedPrice = useMemo(() => {
    const court = venue.courts.find((c) => c.id === wiCourtId);
    if (!court) return 0;
    return requestedWiHours.reduce((sum, h) => {
      const calc = calculateSlotPrice(court.basePricePerHour, wiDate, h, rule);
      return sum + calc.finalPrice;
    }, 0);
  }, [venue.courts, wiCourtId, requestedWiHours, wiDate, rule]);

  const handleWalkInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (wiConflict || requestedWiHours.length === 0) return;

    const result = onAddManualBooking({
      venueId: venue.id,
      courtId: wiCourtId,
      date: wiDate,
      hours: requestedWiHours,
      customerName: wiName.trim() || (wiSource === 'member' ? 'Member Rutin Baru' : 'Tamu Walk-In'),
      customerPhone: wiPhone.trim() || '0812-0000-0000',
      source: wiSource,
      totalPrice: wiEstimatedPrice,
      notes: wiNotes.trim() || undefined,
    });

    if (result.ok) {
      setWalkInOpen(false);
      setWiToast(
        `${wiSource === 'member' ? 'Member Rutin' : 'Walk-In'} berhasil dikunci (${formatHourRange(requestedWiHours)} WIB).`
      );
      setTimeout(() => setWiToast(null), 3500);
    }
  };

  // Helper to toggle day in Dynamic Pricing
  const togglePricingDay = (dayNum: number) => {
    const exists = rule.days.includes(dayNum);
    const nextDays = exists ? rule.days.filter((d) => d !== dayNum) : [...rule.days, dayNum];
    onUpdatePricingRule(venue.id, { ...rule, days: nextDays });
  };

  return (
    <div className="space-y-6 pb-20">
      {/* B2B Workspace Header */}
      <section className="bg-[#0F172A] text-white rounded-2xl px-6 py-6 sm:px-8 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-emerald-400">
            Dashboard Mitra GOR · Anti-Double-Booking Aktif
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display font-extrabold text-xl sm:text-2xl tracking-tight">
              {venue.name}
            </h1>
            <select
              aria-label="Pilih Venue Mitra"
              value={venue.id}
              onChange={(e) => {
                setSelectedVenueId(e.target.value);
                setInspectedBooking(null);
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 border border-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  Ganti GOR: {v.name} ({v.sport})
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-400">
            {venue.address} · {venue.courts.length} Lapangan Terdaftar
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onPreviewInB2C}
            className="px-4 py-2.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Lihat di Mode Pemain</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => openWalkInModal()}
            className="px-4 py-2.5 text-xs font-display font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Tambah Walk-In
          </button>
        </div>
      </section>

      {/* Success Toast */}
      {wiToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs font-semibold text-emerald-900">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            {wiToast}
          </span>
          <button type="button" onClick={() => setWiToast(null)} className="text-emerald-700 hover:text-emerald-950">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4-Column KPI & Settlement H+1 Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Omzet Terjadwal ({formatDateIndo(selectedDate).split(',')[0]})</p>
          <p className="font-mono font-extrabold text-2xl text-slate-900 tabular-nums mt-1.5">
            {formatIDR(metrics.todayRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1.5">
            {venueDateBookings.length} booking · {metrics.bookedHoursToday} jam terisi
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Okupansi Lapangan</p>
          <div className="flex items-baseline gap-2 mt-1.5">
            <p className="font-mono font-extrabold text-2xl text-slate-900 tabular-nums">
              {metrics.occupancyPct}%
            </p>
            <span className="text-xs text-slate-500 tabular-nums">
              ({metrics.bookedHoursToday}/{metrics.totalSlotsToday} slot)
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2.5">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${metrics.occupancyPct}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Distribusi Channel Hari Ini</p>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-emerald-700 font-medium">Online CourtSync</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">{metrics.onlineCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-indigo-700 font-medium">Member Rutin</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">{metrics.memberCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-700 font-medium">Walk-In Kasir</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">{metrics.walkInCount}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0F172A] text-white border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
            <span>Settlement H+1 Otomatis</span>
            <Landmark className="w-4 h-4" />
          </div>
          <p className="font-mono font-extrabold text-2xl text-white tabular-nums mt-1.5">
            {formatIDR(metrics.netSettlementH1)}
          </p>
          <p className="text-[11px] text-slate-300 mt-1.5 truncate">
            Cair Besok 10:00 WIB · {venue.bankAccount.split(' a.n.')[0]}
          </p>
        </div>
      </section>

      {/* Secondary Sub-Navigation Switcher */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit overflow-x-auto max-w-full">
        {[
          { id: 'calendar' as B2BTab, label: 'Kalender & Walk-In' },
          { id: 'pricing' as B2BTab, label: 'Dynamic Pricing (Off-Peak)' },
          {
            id: 'reviews' as B2BTab,
            label: `Ulasan Pemain (${reviews.filter((r) => r.venueId === venue.id).length})`,
          },
          { id: 'revenue' as B2BTab, label: 'Pendapatan & Settlement H+1' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: INTERACTIVE VENUE CALENDAR GRID */}
      {activeTab === 'calendar' && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-bold text-base text-slate-900">
                Jadwal Lapangan Real-Time — {formatDateIndo(selectedDate)}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik sel kosong untuk tambah Walk-In cepat, atau klik blok jadwal untuk lihat detail pemesan.
              </p>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {days.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => {
                    setSelectedDate(d.iso);
                    setInspectedBooking(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    selectedDate === d.iso
                      ? 'bg-[#0F172A] text-white border-[#0F172A]'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {d.isToday ? 'Hari Ini' : `${d.dayShort} ${d.dateNum}`}
                </button>
              ))}
            </div>
          </div>

          {/* Legend Bar */}
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4 text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                Booking Online (CourtSync)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-slate-800" />
                Member Rutin Bulanan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-amber-400" />
                Walk-In Kasir
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-white border border-dashed border-slate-300" />
                Kosong (+ Walk-In)
              </span>
            </div>
            {rule.enabled && (
              <span className="text-emerald-700 font-semibold font-mono tabular-nums">
                Diskon Off-Peak -{rule.discountPercent}% aktif ({formatSingleHour(rule.startHour)}–{formatSingleHour(rule.endHour)})
              </span>
            )}
          </div>

          {/* Horizontal Scrollable Matrix Grid */}
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full border-collapse min-w-[960px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-3 text-xs font-bold text-slate-700 border-r border-slate-200 w-48">
                    Lapangan
                  </th>
                  {OPERATING_HOURS.map((hour) => {
                    const priceSample = calculateSlotPrice(
                      venue.courts[0]?.basePricePerHour ?? 100000,
                      selectedDate,
                      hour,
                      rule
                    );
                    return (
                      <th
                        key={hour}
                        className="px-2 py-2.5 text-center border-r border-slate-100 last:border-r-0 min-w-[78px]"
                      >
                        <div className="font-mono text-xs font-bold text-slate-800 tabular-nums">
                          {formatSingleHour(hour)}
                        </div>
                        {priceSample.isPromo && (
                          <div className="font-mono text-[10px] font-semibold text-amber-700 mt-0.5">
                            -{priceSample.discountPercent}%
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {venue.courts.map((court) => (
                  <tr key={court.id} className="hover:bg-slate-50/40">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-slate-200 align-middle">
                      <p className="font-semibold text-xs text-slate-900">{court.name}</p>
                      <p className="font-mono text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {formatIDR(court.basePricePerHour)}/jam
                      </p>
                    </td>

                    {OPERATING_HOURS.map((hour) => {
                      const booking = venueDateBookings.find(
                        (b) => b.courtId === court.id && b.hours.includes(hour)
                      );

                      if (!booking) {
                        return (
                          <td
                            key={hour}
                            className="p-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                          >
                            <button
                              type="button"
                              onClick={() => openWalkInModal(court.id, hour)}
                              title={`Tambah Walk-In di ${court.name} jam ${formatSingleHour(hour)}`}
                              className="w-full h-12 rounded-lg border border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/60 text-slate-400 hover:text-emerald-700 text-[10px] font-medium transition-colors flex items-center justify-center"
                            >
                              +
                            </button>
                          </td>
                        );
                      }

                      const isSelected = inspectedBooking?.id === booking.id;
                      const styleBySource =
                        booking.source === 'online'
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-950'
                          : booking.source === 'member'
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-amber-400/25 border-amber-500 text-amber-950';

                      return (
                        <td
                          key={hour}
                          className="p-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                        >
                          <button
                            type="button"
                            onClick={() => setInspectedBooking(booking)}
                            className={`w-full h-12 px-1.5 py-1 rounded-lg border text-left transition-all overflow-hidden ${styleBySource} ${
                              isSelected ? 'ring-2 ring-offset-1 ring-slate-900' : ''
                            }`}
                          >
                            <p className="text-[10px] font-bold truncate leading-tight">
                              {booking.customerName}
                            </p>
                            <p
                              className={`text-[9px] font-medium mt-0.5 truncate ${
                                booking.source === 'member' ? 'text-slate-300' : 'opacity-80'
                              }`}
                            >
                              {booking.source === 'online'
                                ? 'Online'
                                : booking.source === 'member'
                                ? 'Member'
                                : 'Walk-In'}
                            </p>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inspected Booking Detail Strip */}
          {inspectedBooking && (
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-slate-900">{inspectedBooking.bookingCode}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-semibold text-slate-800">{inspectedBooking.customerName}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-slate-600">{inspectedBooking.customerPhone}</span>
                </div>
                <p className="text-slate-600">
                  {venue.courts.find((c) => c.id === inspectedBooking.courtId)?.name} ·{' '}
                  <span className="font-mono font-semibold text-slate-800 tabular-nums">
                    {formatHourRange(inspectedBooking.hours)} WIB
                  </span>{' '}
                  · {formatIDR(inspectedBooking.totalPrice)} ({inspectedBooking.paymentMethod.replace('_', ' ')})
                </p>
              </div>
              <div className="flex items-center gap-2">
                {inspectedBooking.source !== 'online' && (
                  <button
                    type="button"
                    onClick={() => {
                      onCancelBooking(inspectedBooking.id);
                      setInspectedBooking(null);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Batalkan Slot
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectedBooking(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg"
                >
                  Tutup Detail
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: DYNAMIC PRICING CONTROL PANEL */}
      {activeTab === 'pricing' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
                  <Percent className="w-5 h-5 text-emerald-600" />
                  Aturan Diskon Otomatis (Off-Peak)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Tingkatkan okupansi jam sepi di {venue.name}. Perubahan langsung muncul sebagai tag promo di halaman Cari Lapangan pemain.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={rule.enabled}
                onClick={() => onUpdatePricingRule(venue.id, { ...rule, enabled: !rule.enabled })}
                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                  rule.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`block w-5 h-5 bg-white rounded-full shadow transition-transform transform ${
                    rule.enabled ? 'translate-x-6.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className={`space-y-5 ${rule.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
              {/* Promo Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Promo Tampil di Aplikasi
                </label>
                <input
                  type="text"
                  value={rule.label}
                  onChange={(e) => onUpdatePricingRule(venue.id, { ...rule, label: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Active Days */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">Hari Berlaku</label>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdatePricingRule(venue.id, { ...rule, days: [1, 2, 3, 4, 5] })
                    }
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Preset Senin–Jumat
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const active = rule.days.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => togglePricingDay(day.id)}
                        className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                          active
                            ? 'bg-[#0F172A] text-white border-[#0F172A]'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hour Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Jam Mulai Off-Peak
                  </label>
                  <select
                    value={rule.startHour}
                    onChange={(e) => {
                      const nextStart = Number(e.target.value);
                      onUpdatePricingRule(venue.id, {
                        ...rule,
                        startHour: nextStart,
                        endHour: Math.max(nextStart + 1, rule.endHour),
                      });
                    }}
                    className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  >
                    {[8, 9, 10, 11, 12, 13, 14, 15].map((h) => (
                      <option key={h} value={h}>
                        {formatSingleHour(h)} WIB
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Jam Selesai Off-Peak
                  </label>
                  <select
                    value={rule.endHour}
                    onChange={(e) =>
                      onUpdatePricingRule(venue.id, { ...rule, endHour: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  >
                    {[11, 12, 13, 14, 15, 16, 17, 18].map((h) => (
                      <option key={h} value={h} disabled={h <= rule.startHour}>
                        {formatSingleHour(h)} WIB
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Discount Percent */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">Besaran Diskon Otomatis</label>
                  <span className="font-mono font-extrabold text-lg text-emerald-700 tabular-nums">
                    -{rule.discountPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={45}
                  step={5}
                  value={rule.discountPercent}
                  onChange={(e) =>
                    onUpdatePricingRule(venue.id, { ...rule, discountPercent: Number(e.target.value) })
                  }
                  className="w-full accent-emerald-500"
                />
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  {[10, 15, 20, 25, 30, 40].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => onUpdatePricingRule(venue.id, { ...rule, discountPercent: pct })}
                      className={`px-3 py-1 rounded-md text-xs font-mono font-semibold border transition-colors ${
                        rule.discountPercent === pct
                          ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      -{pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Live Price Preview Table */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="font-display font-bold text-base text-slate-900">
                Simulasi Tarif Lapangan
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Perbandingan harga reguler vs harga otomatis jam off-peak ({formatSingleHour(rule.startHour)}–{formatSingleHour(rule.endHour)} WIB).
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 text-left font-semibold">Lapangan</th>
                    <th className="py-2 text-right font-semibold">Reguler</th>
                    <th className="py-2 text-right font-semibold">Off-Peak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {venue.courts.map((c) => {
                    const offPeak = rule.enabled
                      ? Math.round((c.basePricePerHour * (100 - rule.discountPercent)) / 100 / 1000) * 1000
                      : c.basePricePerHour;
                    return (
                      <tr key={c.id}>
                        <td className="py-3 font-medium text-slate-800">{c.name}</td>
                        <td className="py-3 text-right font-mono text-slate-500 tabular-nums">
                          {formatIDR(c.basePricePerHour)}
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatIDR(offPeak)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onPreviewInB2C}
                className="w-full py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <span>Uji Tampilan Promo di Mode Pemain</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: REVENUE & H+1 SETTLEMENT */}
      {activeTab === 'revenue' && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* H+1 Payout Card */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Pencairan Dana Otomatis</p>
                  <h2 className="font-display font-bold text-lg text-slate-900 mt-0.5">
                    Ringkasan Settlement H+1
                  </h2>
                </div>
                <Building2 className="w-5 h-5 text-slate-400" />
              </div>

              <div className="space-y-2.5 text-sm border-y border-slate-100 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Pendapatan Booking Online (QRIS/VA)</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatIDR(metrics.onlineGross)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Biaya Layanan Platform (2,5%)</span>
                  <span className="font-mono text-red-600 tabular-nums">
                    -{formatIDR(metrics.platformFee)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-900">Estimasi Cair Bersih (H+1)</span>
                  <span className="font-mono font-extrabold text-lg text-emerald-700 tabular-nums">
                    {formatIDR(metrics.netSettlementH1)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                <p>
                  <span className="font-semibold text-slate-800">Rekening Tujuan:</span> {venue.bankAccount}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Jadwal Transfer:</span> Otomatis H+1 pukul 10:00 WIB (Bebas biaya admin bank)
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Kasir Langsung (Walk-In & Member):</span>{' '}
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatIDR(metrics.walkInTotal + metrics.memberTotal)}
                  </span>{' '}
                  (diterima langsung di GOR)
                </p>
              </div>
            </div>

            {/* Transaction Ledger Table */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Riwayat Transaksi {venue.name}
                  </h3>
                  <p className="text-xs text-slate-500">Semua channel booking tersinkronisasi</p>
                </div>
                <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
                  {venueAllBookings.length} transaksi
                </span>
              </div>
              <div className="overflow-x-auto thin-scrollbar">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="px-4 py-3 text-left font-semibold">Kode / Pemesan</th>
                      <th className="px-4 py-3 text-left font-semibold">Jadwal</th>
                      <th className="px-4 py-3 text-left font-semibold">Channel</th>
                      <th className="px-4 py-3 text-right font-semibold">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {venueAllBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{b.customerName}</p>
                          <p className="font-mono text-[11px] text-slate-500">{b.bookingCode}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-800">{formatDateIndo(b.date)}</p>
                          <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {formatHourRange(b.hours)} WIB
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-semibold ${
                              b.source === 'online'
                                ? 'text-emerald-700'
                                : b.source === 'member'
                                ? 'text-slate-800'
                                : 'text-amber-700'
                            }`}
                          >
                            {b.source === 'online'
                              ? 'Online · H+1'
                              : b.source === 'member'
                              ? 'Member Rutin'
                              : 'Walk-In Kasir'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {formatIDR(b.totalPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: PLAYER REVIEWS & 1-5 STAR FEEDBACK */}
      {activeTab === 'reviews' && (() => {
        const venueReviews = reviews.filter((r) => r.venueId === venue.id);
        const avg =
          venueReviews.length > 0
            ? (
                venueReviews.reduce((acc, r) => acc + r.rating, 0) / venueReviews.length
              ).toFixed(1)
            : venue.rating.toFixed(1);

        return (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Rating Breakdown Card */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-emerald-700">Reputasi Venue Bandung</p>
                <h2 className="font-display font-bold text-lg text-slate-900 mt-0.5">
                  Skor Rating {venue.name}
                </h2>
              </div>

              <div className="flex items-center gap-4 py-3 border-y border-slate-100">
                <p className="font-mono font-extrabold text-4xl text-slate-900 tabular-nums">
                  {avg}
                </p>
                <div>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= Math.round(Number(avg))
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {venueReviews.length} ulasan terbaru · {venue.reviewCount + venueReviews.length} total rating
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = venueReviews.filter((r) => r.rating === star).length;
                  const pct = venueReviews.length > 0 ? Math.round((count / venueReviews.length) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2.5 text-xs">
                      <span className="font-mono font-bold text-slate-700 w-7 inline-flex items-center gap-0.5">
                        {star}
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono text-slate-500 w-6 text-right tabular-nums">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Reviews List */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Feedback Langsung Pemain
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dikirim oleh pemain setelah menyelesaikan sesi booking CourtSync
                  </p>
                </div>
              </div>

              {venueReviews.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  Belum ada ulasan baru untuk venue ini.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {venueReviews.map((rev) => (
                    <div key={rev.id} className="p-5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm text-slate-900">{rev.reviewerName}</p>
                          <p className="text-xs text-slate-500">
                            {rev.courtName} · Kode <span className="font-mono">{rev.bookingCode}</span> · {rev.createdAtLabel}
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3.5 h-3.5 ${
                                s <= rev.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-200'
                              }`}
                            />
                          ))}
                          <span className="font-mono font-bold text-xs text-slate-900 ml-1 tabular-nums">
                            {rev.rating}.0
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{rev.comment}</p>
                      {rev.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {rev.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* MANUAL WALK-IN / MEMBER MODAL WITH ANTI-DOUBLE-BOOKING VALIDATION */}
      {walkInOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tambah Walk-In Booking"
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="bg-[#0F172A] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-400">Input Kasir · Anti-Double-Booking</p>
                <h3 className="font-display font-bold text-base mt-0.5">
                  Tambah Walk-In / Member — {venue.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setWalkInOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="p-5 space-y-4">
              {/* Source Switch */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWiSource('walkin')}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                    wiSource === 'walkin'
                      ? 'bg-amber-400 border-amber-500 text-slate-950'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  Walk-In Kasir
                </button>
                <button
                  type="button"
                  onClick={() => setWiSource('member')}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                    wiSource === 'member'
                      ? 'bg-[#0F172A] border-[#0F172A] text-white'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  Member Rutin Bulanan
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Lapangan</label>
                  <select
                    value={wiCourtId}
                    onChange={(e) => setWiCourtId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {venue.courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
                  <select
                    value={wiDate}
                    onChange={(e) => setWiDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {days.map((d) => (
                      <option key={d.iso} value={d.iso}>
                        {d.isToday ? `Hari Ini (${d.dateNum} ${d.monthShort})` : `${d.dayFull}, ${d.dateNum} ${d.monthShort}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Mulai</label>
                  <select
                    value={wiStartHour}
                    onChange={(e) => setWiStartHour(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  >
                    {OPERATING_HOURS.map((h) => (
                      <option key={h} value={h}>
                        {formatSingleHour(h)} WIB
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Durasi</label>
                  <select
                    value={wiDuration}
                    onChange={(e) => setWiDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {[1, 2, 3].map((dur) => (
                      <option key={dur} value={dur}>
                        {dur} Jam ({formatHourRange(Array.from({ length: dur }, (_, i) => wiStartHour + i).filter((x) => x <= 21))})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live Anti-Double-Booking Validation Feedback */}
              {wiConflict ? (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-900">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-800">Konflik Jadwal Terdeteksi (Anti-Double-Booking)</p>
                    <p className="mt-0.5 leading-relaxed">
                      Slot jam <span className="font-mono font-bold">{formatSingleHour(wiConflict.hour)} WIB</span> sudah terisi oleh{' '}
                      <span className="font-semibold">{wiConflict.booking.customerName}</span> ({wiConflict.booking.bookingCode}). Pilih jam atau lapangan lain.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs text-emerald-900">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Check className="w-4 h-4 text-emerald-600" />
                    Slot {formatHourRange(requestedWiHours)} WIB tersedia & aman dari bentrok
                  </span>
                  <span className="font-mono font-bold tabular-nums">{formatIDR(wiEstimatedPrice)}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Pelanggan / Komunitas
                  </label>
                  <input
                    type="text"
                    required
                    value={wiName}
                    onChange={(e) => setWiName(e.target.value)}
                    placeholder="Contoh: Pak Asep / PB Antapani"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">No. HP / WhatsApp</label>
                  <input
                    type="tel"
                    value={wiPhone}
                    onChange={(e) => setWiPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Kasir (Opsional)</label>
                <input
                  type="text"
                  value={wiNotes}
                  onChange={(e) => setWiNotes(e.target.value)}
                  placeholder="Contoh: DP tunai Rp 50.000, pelunasan di akhir"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWalkInOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={Boolean(wiConflict) || !wiName.trim()}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-display font-bold text-xs rounded-lg transition-colors"
                >
                  Simpan &amp; Kunci Jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
