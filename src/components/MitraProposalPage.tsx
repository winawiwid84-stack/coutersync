import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calculator,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  FileSignature,
  FileText,
  Handshake,
  Landmark,
  Printer,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { SportCategory, Venue } from '../types/courtsync';
import { formatIDR } from '../utils/format';

interface MitraProposalPageProps {
  venues: Venue[];
  onRegisterMitra: () => void;
  onGoToCalendar: () => void;
}

type PartnershipTierId = 'reguler' | 'eksklusif' | 'korporasi';

interface PartnershipTier {
  id: PartnershipTierId;
  badge: string;
  name: string;
  tagline: string;
  registrationFee: string;
  monthlyFee: string;
  onlineCommissionLabel: string;
  onlineCommissionRate: number; // decimal, e.g., 0.025
  flatMonthlyCost: number; // IDR
  walkInFee: string;
  settlement: string;
  commitment: string;
  highlights: string[];
}

const PARTNERSHIP_TIERS: PartnershipTier[] = [
  {
    id: 'reguler',
    badge: 'Paling Populer',
    name: 'Skema A: Reguler (Pay-As-You-Grow)',
    tagline: 'Tanpa biaya tetap bulanan. Bayar komisi hanya saat booking online berhasil.',
    registrationFee: 'Rp 0 (Gratis)',
    monthlyFee: 'Rp 0 / bulan',
    onlineCommissionLabel: '2,5% / transaksi online',
    onlineCommissionRate: 0.025,
    flatMonthlyCost: 0,
    walkInFee: '0% (Gratis selamanya)',
    settlement: 'Otomatis H+1 pukul 10:00 WIB',
    commitment: 'Fleksibel (Tanpa kontrak ikatan)',
    highlights: [
      'Booking real-time 08:00–22:00 WIB dengan anti-double-booking',
      'Split Bill otomatis (QRIS & Virtual Account) + E-Ticket QR',
      'Dashboard Kalender Walk-In & Member Rutin tanpa potongan',
      'Panel Dynamic Pricing diskon jam sepi + Studio AI konten promo',
    ],
  },
  {
    id: 'eksklusif',
    badge: 'Komisi Lebih Hemat',
    name: 'Skema B: Eksklusif / Featured Venue',
    tagline: 'Untuk GOR unggulan & Padel/Mini Soccer yang menargetkan lonjakan okupansi.',
    registrationFee: 'Rp 0 (Gratis)',
    monthlyFee: 'Rp 0 / bulan',
    onlineCommissionLabel: '2,0% / transaksi online',
    onlineCommissionRate: 0.02,
    flatMonthlyCost: 0,
    walkInFee: '0% (Gratis selamanya)',
    settlement: 'Otomatis H+1 pukul 10:00 WIB',
    commitment: 'Minimum 6 bulan (dapat diperpanjang)',
    highlights: [
      'Potongan komisi khusus 2,0% untuk seluruh transaksi QRIS & VA',
      'Penempatan prioritas teratas di Jelajah & Peta GOR Bandung',
      'Pembuatan visual Tur 3D Lapangan kustom & promo Open Play rutin',
      'Dukungan kampanye komunitas mabar mingguan Bandung Raya',
    ],
  },
  {
    id: 'korporasi',
    badge: 'Multi-Cabang',
    name: 'Skema C: Korporasi / White-Label SaaS',
    tagline: 'Untuk jaringan Sport Center dengan 2+ cabang dan volume transaksi tinggi.',
    registrationFee: 'Rp 0 (Onboarding Gratis)',
    monthlyFee: 'Rp 950.000 / cabang / bln',
    onlineCommissionLabel: '0% komisi platform (MDR PG at-cost)',
    onlineCommissionRate: 0,
    flatMonthlyCost: 950000,
    walkInFee: '0% (Gratis selamanya)',
    settlement: 'Otomatis H+1 langsung ke rekening PT',
    commitment: 'Minimum 12 bulan',
    highlights: [
      '0% komisi transaksi platform — hemat besar untuk volume booking tinggi',
      'Dashboard multi-cabang terpusat & kontrol akses multi-kasir',
      'Ekspor laporan keuangan akuntansi & rekonsiliasi settlement',
      'Dedicated Account Manager & SLA dukungan teknis prioritas',
    ],
  },
];

const PROBLEM_SOLUTIONS = [
  {
    problem: 'Lapangan sepi di jam kerja (Senin–Jumat 09:00–15:00 WIB)',
    solution:
      'Dynamic Pricing Otomatis memasang diskon jam sepi instan yang langsung tampil sebagai tag promo di aplikasi pemain.',
  },
  {
    problem: 'Jadwal bentrok antara chat WhatsApp & tamu walk-in kasir',
    solution:
      'Kalender Real-Time Anti-Double-Booking mengunci slot secara atomik untuk booking online, member bulanan, dan walk-in.',
  },
  {
    problem: 'Admin repot menagih DP & pemain batal mendadak',
    solution:
      'Pembayaran QRIS/VA di muka + fitur Split Bill (Patungan) otomatis menerbitkan E-Ticket QR check-in untuk petugas kasir.',
  },
  {
    problem: 'Pemain batal sewa karena kurang orang untuk bermain',
    solution:
      'Fitur Open Play (Mabar) mempertemukan komunitas Bandung agar kuota pemain terpenuhi dan lapangan tetap terisi.',
  },
  {
    problem: 'Promosi media sosial GOR menyita waktu & biaya',
    solution:
      'Tampil di Peta GOR Bandung, Tur 3D Lapangan, Sistem Ulasan Bintang 1–5, plus Studio AI untuk membuat skrip Reels & broadcast WA.',
  },
];

const ONBOARDING_STEPS = [
  {
    day: 'Hari 1',
    title: 'Penandatanganan MoU & Pendataan',
    desc: 'Verifikasi rekening pencairan H+1, daftar lapangan, tarif reguler per jam, serta jadwal member rutin eksisting.',
  },
  {
    day: 'Hari 2',
    title: 'Setup Sistem & Katalog Digital',
    desc: 'Aktivasi akun Mitra GOR, pengaturan Dynamic Pricing jam sepi, pemetaan Peta GOR Bandung, dan uji coba E-Ticket QR.',
  },
  {
    day: 'Hari 3',
    title: 'Training Kasir 30 Menit & Go-Live',
    desc: 'Simulasi input tamu walk-in anti-bentrok & scan QR bersama petugas kasir, dilanjutkan peluncuran resmi ke komunitas Bandung.',
  },
];

export const MitraProposalPage: React.FC<MitraProposalPageProps> = ({
  venues,
  onRegisterMitra,
  onGoToCalendar,
}) => {
  // Editable Target Partner Details
  const [targetVenueName, setTargetVenueName] = useState('GOR Badminton Pasteur Arena');
  const [targetPicName, setTargetPicName] = useState('Bapak/Ibu Pengelola Venue');
  const [targetArea, setTargetArea] = useState('Pasteur, Kota Bandung');
  const [targetSport, setTargetSport] = useState<SportCategory>('Badminton');
  const [courtSyncPic, setCourtSyncPic] = useState('Tim Kemitraan CourtSync Bandung');
  const [courtSyncPhone, setCourtSyncPhone] = useState('082126666684');

  // Selected Partnership Tier
  const [selectedTierId, setSelectedTierId] = useState<PartnershipTierId>('reguler');

  // Interactive ROI Simulation State
  const [courtCount, setCourtCount] = useState(4);
  const [avgRate, setAvgRate] = useState(90000);
  const [offPeakDiscount, setOffPeakDiscount] = useState(25);
  const [extraOffPeakSlotsPerDay, setExtraOffPeakSlotsPerDay] = useState(4);
  const [extraMabarSlotsPerWeek, setExtraMabarSlotsPerWeek] = useState(6);

  const [copiedWa, setCopiedWa] = useState(false);

  const activeTier = useMemo(
    () => PARTNERSHIP_TIERS.find((t) => t.id === selectedTierId) ?? PARTNERSHIP_TIERS[0],
    [selectedTierId]
  );

  // Live ROI Calculation
  const roi = useMemo(() => {
    const offPeakPrice = Math.round((avgRate * (100 - offPeakDiscount)) / 100 / 1000) * 1000;
    const offPeakMonthlyGross = extraOffPeakSlotsPerDay * 22 * offPeakPrice;
    const mabarMonthlyGross = extraMabarSlotsPerWeek * 4 * avgRate;
    const totalAdditionalGross = offPeakMonthlyGross + mabarMonthlyGross;

    const platformCost =
      activeTier.flatMonthlyCost > 0
        ? activeTier.flatMonthlyCost
        : Math.round(totalAdditionalGross * activeTier.onlineCommissionRate);

    const netMonthlyGain = Math.max(0, totalAdditionalGross - platformCost);
    const annualNetGain = netMonthlyGain * 12;

    return {
      offPeakPrice,
      offPeakMonthlyGross,
      mabarMonthlyGross,
      totalAdditionalGross,
      platformCost,
      netMonthlyGain,
      annualNetGain,
    };
  }, [avgRate, offPeakDiscount, extraOffPeakSlotsPerDay, extraMabarSlotsPerWeek, activeTier]);

  const docMeta = useMemo(() => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const docNumber = `CS/BDG/MOU/${year}/${month}/018`;
    return { formattedDate, docNumber };
  }, []);

  const applyVenuePreset = (venue: Venue) => {
    setTargetVenueName(venue.name);
    setTargetArea(venue.area);
    setTargetSport(venue.sport);
    setCourtCount(venue.courts.length);
    const avg = Math.round(
      venue.courts.reduce((s, c) => s + c.basePricePerHour, 0) / venue.courts.length / 5000
    ) * 5000;
    setAvgRate(avg);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const handleCopyWhatsAppPitch = async () => {
    const message = [
      `Halo ${targetPicName} (${targetVenueName}),`,
      '',
      `Perkenalkan, saya ${courtSyncPic} dari *CourtSync (MainBareng)* — platform booking lapangan & komunitas olahraga Bandung.`,
      '',
      `Kami ingin menawarkan kerjasama kemitraan digital untuk *${targetVenueName}* (${targetSport}, ${targetArea}) melalui *${activeTier.name}*:`,
      `- Biaya pendaftaran & integrasi: ${activeTier.registrationFee}`,
      `- Skema layanan online: ${activeTier.onlineCommissionLabel}`,
      `- Tamu Walk-In & Member Rutin: 0% komisi (gratis di kalender anti-bentrok)`,
      `- Pencairan dana: ${activeTier.settlement}`,
      '',
      `Berdasarkan simulasi ${courtCount} lapangan (tarif rata-rata ${formatIDR(avgRate)}/jam), potensi tambahan pendapatan bersih melalui promo jam sepi & Open Play mencapai *${formatIDR(roi.netMonthlyGain)}/bulan*.`,
      '',
      `Boleh kami jadwalkan demo singkat 15 menit langsung di lokasi atau via Zoom minggu ini? Terima kasih!`,
      `Kontak: ${courtSyncPhone}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(message);
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2500);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Action Header (Hidden in Print) */}
      <section className="print:hidden bg-[#0F172A] text-white rounded-2xl px-6 py-6 sm:px-8 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-semibold text-emerald-400 inline-flex items-center gap-1.5">
            <Handshake className="w-3.5 h-3.5" />
            Portal Business Development · Kemitraan GOR Bandung
          </p>
          <h1 className="font-display font-extrabold text-xl sm:text-2xl tracking-tight">
            Proposal Penawaran &amp; Skema Kerjasama Mitra GOR
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Sesuaikan nama GOR tujuan, pilih bentuk kerjasama, hitung simulasi ROI real-time, lalu cetak langsung sebagai PDF profesional atau salin teks penawaran WhatsApp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopyWhatsAppPitch()}
            className="px-4 py-2.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            {copiedWa ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Pesan WA Disalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-emerald-400" />
                <span>Salin Pitch WhatsApp</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handlePrintPdf}
            className="px-4 py-2.5 text-xs font-display font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / Simpan PDF</span>
          </button>
        </div>
      </section>

      {/* Interactive Customizer & ROI Calculator Grid (Hidden in Print) */}
      <section className="print:hidden grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Target Partner Config + Tier Selector */}
        <div className="lg:col-span-7 space-y-5">
          {/* Card 1: Personalisasi Tujuan Proposal */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  1. Personalisasi GOR Tujuan
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Perubahan otomatis memperbarui dokumen proposal &amp; draf MoU di bawah.
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {venues.slice(0, 3).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => applyVenuePreset(v)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 rounded-md transition-colors"
                  >
                    Preset: {v.name.split(' ').slice(0, 2).join(' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama GOR / Venue Tujuan
                </label>
                <input
                  type="text"
                  value={targetVenueName}
                  onChange={(e) => setTargetVenueName(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Pemilik / PIC Mitra
                </label>
                <input
                  type="text"
                  value={targetPicName}
                  onChange={(e) => setTargetPicName(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Area / Alamat Bandung
                </label>
                <input
                  type="text"
                  value={targetArea}
                  onChange={(e) => setTargetArea(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cabang Olahraga Utama
                </label>
                <select
                  value={targetSport}
                  onChange={(e) => setTargetSport(e.target.value as SportCategory)}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Badminton">Badminton</option>
                  <option value="Futsal">Futsal</option>
                  <option value="Mini Soccer">Mini Soccer</option>
                  <option value="Padel">Padel</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PIC Pengirim (CourtSync)
                </label>
                <input
                  type="text"
                  value={courtSyncPic}
                  onChange={(e) => setCourtSyncPic(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  No. WhatsApp PIC CourtSync
                </label>
                <input
                  type="text"
                  value={courtSyncPhone}
                  onChange={(e) => setCourtSyncPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Pilihan Bentuk Kerjasama */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-emerald-600" />
                2. Pilih Bentuk &amp; Skema Kerjasama
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik salah satu skema untuk langsung mensimulasikan biaya &amp; menyertakannya pada draf proposal.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {PARTNERSHIP_TIERS.map((tier) => {
                const selected = tier.id === selectedTierId;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setSelectedTierId(tier.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      selected
                        ? 'bg-emerald-50/60 border-emerald-500 ring-2 ring-emerald-500/15'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-sm text-slate-900">
                          {tier.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            selected
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {tier.badge}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-emerald-700 tabular-nums">
                        {tier.onlineCommissionLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{tier.tagline}</p>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>Daftar: <strong className="text-slate-800">{tier.registrationFee}</strong></span>
                      <span>Langganan: <strong className="text-slate-800">{tier.monthlyFee}</strong></span>
                      <span>Walk-In: <strong className="text-emerald-700">{tier.walkInFee}</strong></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Interactive ROI Calculator */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-600" />
              3. Kalkulator Potensi Pendapatan Mitra
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulasikan kenaikan omzet dari optimalisasi jam sepi (*off-peak*) dan *Open Play* komunitas.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-slate-700">Jumlah Lapangan</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">{courtCount} Lapangan</span>
              </div>
              <input
                type="range"
                min={1}
                max={12}
                value={courtCount}
                onChange={(e) => setCourtCount(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-slate-700">Tarif Rata-Rata Reguler / Jam</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">{formatIDR(avgRate)}</span>
              </div>
              <input
                type="range"
                min={50000}
                max={700000}
                step={10000}
                value={avgRate}
                onChange={(e) => setAvgRate(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-slate-700">Diskon Promo Jam Sepi (Off-Peak)</span>
                <span className="font-mono font-bold text-amber-700 tabular-nums">
                  -{offPeakDiscount}% ({formatIDR(roi.offPeakPrice)}/jam)
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={40}
                step={5}
                value={offPeakDiscount}
                onChange={(e) => setOffPeakDiscount(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-slate-700">Tambahan Slot Off-Peak Terisi / Hari Kerja</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {extraOffPeakSlotsPerDay} jam/hari
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={12}
                value={extraOffPeakSlotsPerDay}
                onChange={(e) => setExtraOffPeakSlotsPerDay(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-slate-700">Konversi Open Play (Mabar) / Minggu</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {extraMabarSlotsPerWeek} jam/minggu
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                value={extraMabarSlotsPerWeek}
                onChange={(e) => setExtraMabarSlotsPerWeek(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>
          </div>

          {/* Live Financial Summary Box */}
          <div className="bg-[#0F172A] text-white rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Tambahan Omzet Off-Peak (22 hr)</span>
              <span className="font-mono tabular-nums">{formatIDR(roi.offPeakMonthlyGross)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Tambahan Omzet Open Play (4 mgg)</span>
              <span className="font-mono tabular-nums">{formatIDR(roi.mabarMonthlyGross)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-slate-800">
              <span>Biaya Layanan ({activeTier.name.split(':')[0]})</span>
              <span className="font-mono text-amber-300 tabular-nums">
                -{formatIDR(roi.platformCost)}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-700 flex items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Estimasi Tambahan Bersih / Bulan
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                  Proyeksi 12 bulan: {formatIDR(roi.annualNetGain)}
                </p>
              </div>
              <p className="font-mono font-extrabold text-xl text-emerald-400 tabular-nums">
                {formatIDR(roi.netMonthlyGain)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRegisterMitra}
              className="flex-1 py-2.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-display font-bold text-xs rounded-xl transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Daftar Akun Mitra GOR</span>
            </button>
            <button
              type="button"
              onClick={onGoToCalendar}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl transition-colors"
            >
              Buka Kalender GOR
            </button>
          </div>
        </div>
      </section>

      {/* =====================================================================
          PRINT-READY EXECUTIVE PROPOSAL & RINGKASAN MOU DOCUMENT
      ====================================================================== */}
      <article
        id="courtsync-proposal-doc"
        className="bg-white border border-slate-200 print:border-0 rounded-2xl print:rounded-none overflow-hidden shadow-xs print:shadow-none"
      >
        {/* Executive Letterhead */}
        <header className="bg-[#0F172A] text-white px-6 py-7 sm:px-10 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-display font-extrabold text-sm">
                  CS
                </span>
                <span className="font-display font-extrabold text-lg tracking-tight">
                  CourtSync <span className="text-emerald-400 font-semibold text-sm">(MainBareng)</span>
                </span>
              </div>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl tracking-tight leading-snug">
                PROPOSAL PENAWARAN KEMITRAAN &amp; SKEMA KERJASAMA VENUE OLAHRAGA
              </h2>
              <p className="text-xs text-slate-300">
                Ekosistem Booking Lapangan Real-Time, Split Bill QRIS, &amp; Komunitas Olahraga Bandung Raya
              </p>
            </div>
            <div className="text-left sm:text-right text-xs text-slate-300 shrink-0 space-y-1">
              <p className="font-mono font-semibold text-emerald-400">{docMeta.docNumber}</p>
              <p>Bandung, {docMeta.formattedDate}</p>
              <p className="text-slate-400">Sifat: Penawaran Resmi Kemitraan</p>
            </div>
          </div>

          {/* Addressed To Strip */}
          <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-slate-400">Kepada Yth.</p>
              <p className="font-display font-bold text-sm text-white mt-0.5">{targetVenueName}</p>
              <p className="text-slate-300">u.p. {targetPicName}</p>
            </div>
            <div>
              <p className="text-slate-400">Lokasi &amp; Kategori Venue</p>
              <p className="font-semibold text-white mt-0.5">{targetArea}</p>
              <p className="text-emerald-400 font-medium">
                {targetSport} · {courtCount} Lapangan
              </p>
            </div>
            <div>
              <p className="text-slate-400">Skema Kerjasama Diajukan</p>
              <p className="font-semibold text-amber-300 mt-0.5">{activeTier.name}</p>
              <p className="text-slate-300">{activeTier.onlineCommissionLabel}</p>
            </div>
          </div>
        </header>

        {/* Document Body */}
        <div className="p-6 sm:p-10 space-y-8 text-slate-800">
          {/* Section 1: Ringkasan Eksekutif & Solusi */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="font-display font-bold text-base text-slate-900">
                1. Ringkasan Eksekutif &amp; Solusi Operasional Mitra GOR
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              <strong>CourtSync (MainBareng)</strong> hadir untuk membantu <strong>{targetVenueName}</strong> meningkatkan okupansi lapangan—khususnya pada jam sepi (<em>off-peak</em>)—menghilangkan risiko bentrok jadwal antara pemesanan <em>online</em>, member rutin, dan tamu <em>walk-in</em>, serta mempercepat arus kas melalui pembayaran otomatis <strong>QRIS &amp; Virtual Account</strong> dengan pencairan <strong>H+1</strong>.
            </p>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <th className="px-4 py-2.5 font-bold w-5/12">Tantangan Operasional GOR</th>
                    <th className="px-4 py-2.5 font-bold w-7/12">Solusi Terintegrasi CourtSync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PROBLEM_SOLUTIONS.map((row) => (
                    <tr key={row.problem}>
                      <td className="px-4 py-2.5 font-medium text-slate-800 align-top">
                        {row.problem}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 align-top">{row.solution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 2: Bentuk & Perbandingan Skema Kerjasama */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <Handshake className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="font-display font-bold text-base text-slate-900">
                2. Bentuk Kerjasama &amp; Perbandingan Skema Kemitraan
              </h3>
            </div>

            {/* Highlighted Chosen Tier */}
            <div className="bg-emerald-50/70 border border-emerald-300 rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded">
                    Skema Rekomendasi Terpilih
                  </span>
                  <h4 className="font-display font-bold text-base text-slate-900 mt-1">
                    {activeTier.name}
                  </h4>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-mono font-extrabold text-sm text-emerald-800 tabular-nums">
                    {activeTier.onlineCommissionLabel}
                  </p>
                  <p className="text-[11px] text-slate-600">{activeTier.settlement}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {activeTier.highlights.map((item) => (
                  <p key={item} className="text-xs text-slate-700 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </p>
                ))}
              </div>
            </div>

            {/* Full 3-Tier Comparison Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <th className="px-3.5 py-2.5 font-bold">Komponen Kerjasama</th>
                    {PARTNERSHIP_TIERS.map((tier) => (
                      <th
                        key={tier.id}
                        className={`px-3.5 py-2.5 font-bold ${
                          tier.id === selectedTierId ? 'bg-emerald-50 text-emerald-900' : ''
                        }`}
                      >
                        {tier.name.split(':')[0]} ({tier.badge})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-3.5 py-2 font-semibold text-slate-700">Biaya Pendaftaran</td>
                    {PARTNERSHIP_TIERS.map((t) => (
                      <td key={t.id} className="px-3.5 py-2 font-mono tabular-nums">
                        {t.registrationFee}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-semibold text-slate-700">Biaya Langganan</td>
                    {PARTNERSHIP_TIERS.map((t) => (
                      <td key={t.id} className="px-3.5 py-2 font-mono tabular-nums">
                        {t.monthlyFee}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-semibold text-slate-700">Biaya Booking Online</td>
                    {PARTNERSHIP_TIERS.map((t) => (
                      <td key={t.id} className="px-3.5 py-2 font-semibold text-slate-900">
                        {t.onlineCommissionLabel}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-semibold text-slate-700">Walk-In &amp; Member Rutin</td>
                    {PARTNERSHIP_TIERS.map((t) => (
                      <td key={t.id} className="px-3.5 py-2 font-semibold text-emerald-700">
                        {t.walkInFee}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-semibold text-slate-700">Pencairan Dana</td>
                    {PARTNERSHIP_TIERS.map((t) => (
                      <td key={t.id} className="px-3.5 py-2 text-slate-600">
                        {t.settlement}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-semibold text-slate-700">Komitmen Durasi</td>
                    {PARTNERSHIP_TIERS.map((t) => (
                      <td key={t.id} className="px-3.5 py-2 text-slate-600">
                        {t.commitment}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Simulasi Proyeksi Pendapatan */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <Landmark className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="font-display font-bold text-base text-slate-900">
                3. Simulasi Potensi Tambahan Pendapatan — {targetVenueName}
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              Estimasi konservatif untuk <strong>{courtCount} lapangan {targetSport}</strong> dengan tarif rata-rata <strong>{formatIDR(avgRate)}/jam</strong> menggunakan <strong>{activeTier.name}</strong>:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-[11px] text-slate-500">Promo Off-Peak (-{offPeakDiscount}%)</p>
                <p className="font-mono font-bold text-sm text-slate-900 tabular-nums mt-1">
                  +{formatIDR(roi.offPeakMonthlyGross)}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {extraOffPeakSlotsPerDay} slot/hr × 22 hari kerja
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-[11px] text-slate-500">Konversi Open Play / Mabar</p>
                <p className="font-mono font-bold text-sm text-slate-900 tabular-nums mt-1">
                  +{formatIDR(roi.mabarMonthlyGross)}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {extraMabarSlotsPerWeek} slot/mgg × 4 minggu
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-[11px] text-amber-900">Biaya Layanan CourtSync</p>
                <p className="font-mono font-bold text-sm text-amber-900 tabular-nums mt-1">
                  -{formatIDR(roi.platformCost)}
                </p>
                <p className="text-[10px] text-amber-800/80 mt-0.5">{activeTier.onlineCommissionLabel}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#0F172A] text-white border border-slate-800">
                <p className="text-[11px] text-emerald-400 font-semibold">Tambahan Bersih / Bulan</p>
                <p className="font-mono font-extrabold text-base text-white tabular-nums mt-1">
                  +{formatIDR(roi.netMonthlyGain)}
                </p>
                <p className="text-[10px] text-slate-300 mt-0.5 tabular-nums">
                  ± {formatIDR(roi.annualNetGain)} / tahun
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Ringkasan Hak & Kewajiban (MoU) + Kebijakan Reschedule */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="font-display font-bold text-base text-slate-900">
                4. Pokok Kesepakatan Kerjasama (Ringkasan MoU)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <h4 className="font-display font-bold text-slate-900">
                  Hak &amp; Kewajiban Mitra GOR ({targetVenueName})
                </h4>
                <ul className="space-y-1.5 text-slate-600 list-disc pl-4 leading-relaxed">
                  <li>Menerima pencairan dana bersih (<em>net settlement</em>) transaksi online otomatis <strong>H+1 pukul 10:00 WIB</strong> tanpa biaya admin bank.</li>
                  <li>Memiliki kendali penuh atas tarif reguler, jadwal member bulanan, serta diskon jam sepi (<em>Dynamic Pricing</em>).</li>
                  <li>Menginput tamu <em>walk-in</em> / telepon di Dashboard Mitra GOR secara real-time untuk mencegah bentrok jadwal.</li>
                  <li>Menghormati E-Ticket QR yang telah terkonfirmasi lunas dari sistem CourtSync dan menjaga standar fasilitas venue.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <h4 className="font-display font-bold text-slate-900">
                  Hak &amp; Kewajiban CourtSync (MainBareng)
                </h4>
                <ul className="space-y-1.5 text-slate-600 list-disc pl-4 leading-relaxed">
                  <li>Menyediakan sistem booking real-time 24/7, proteksi anti-double-booking, pembayaran QRIS/VA, dan Dashboard Mitra GOR.</li>
                  <li>Memastikan transparansi laporan transaksi, ketepatan transfer settlement H+1, serta dukungan teknis &amp; layanan pelanggan.</li>
                  <li>Menampilkan profil venue, Peta GOR Bandung, Tur 3D Lapangan, dan ulasan terverifikasi pemain untuk promosi bersama.</li>
                  <li><strong>Kebijakan Reschedule:</strong> Pemesan dapat ubah jadwal maks. H-24 jam (non-refundable); pembatalan sepihak akibat <em>force majeure</em> venue wajib refund 100% atau ganti jadwal tanpa penalti.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 5: Tahapan Onboarding 3 Hari Kerja */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <CalendarClock className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="font-display font-bold text-base text-slate-900">
                5. Tahapan Aktivasi &amp; Onboarding Mitra (3 Hari Kerja)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {ONBOARDING_STEPS.map((step) => (
                <div
                  key={step.day}
                  className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5"
                >
                  <span className="inline-block font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    {step.day}
                  </span>
                  <h4 className="font-display font-bold text-xs sm:text-sm text-slate-900">
                    {step.title}
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Section 6: Signature / Approval Block */}
          <section className="pt-4 border-t border-slate-200 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <p>
                Demikian proposal penawaran kemitraan ini dibuat untuk ditindaklanjuti menjadi Perjanjian Kerjasama (PKS / MoU) resmi antara kedua belah pihak.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-4 text-xs">
              <div className="space-y-14">
                <div>
                  <p className="text-slate-500">Pihak Pertama,</p>
                  <p className="font-display font-bold text-slate-900">
                    CourtSync (MainBareng) Bandung
                  </p>
                </div>
                <div className="border-t border-slate-300 pt-2 max-w-[240px]">
                  <p className="font-semibold text-slate-900">{courtSyncPic}</p>
                  <p className="text-slate-500 font-mono">{courtSyncPhone} · widyactive@gmail.com</p>
                </div>
              </div>

              <div className="space-y-14">
                <div>
                  <p className="text-slate-500">Pihak Kedua (Menyetujui / Mengetahui),</p>
                  <p className="font-display font-bold text-slate-900">{targetVenueName}</p>
                </div>
                <div className="border-t border-slate-300 pt-2 max-w-[240px]">
                  <p className="font-semibold text-slate-900">{targetPicName}</p>
                  <p className="text-slate-500">{targetArea}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </article>

      {/* Bottom Quick CTA Strip (Hidden in Print) */}
      <div className="print:hidden bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-slate-900">
              Siap presentasi ke pemilik {targetVenueName}?
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Klik <strong>Cetak / Simpan PDF</strong> untuk mengunduh proposal rapi ukuran A4 tanpa tombol navigasi, atau salin langsung ke WhatsApp.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handlePrintPdf}
          className="px-5 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white font-display font-bold text-xs rounded-xl transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Printer className="w-4 h-4 text-emerald-400" />
          <span>Cetak / Simpan PDF Sekarang</span>
        </button>
      </div>
    </div>
  );
};
