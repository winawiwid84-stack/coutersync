import React, { useState } from 'react';
import { Building2, CheckCircle2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { SportCategory, Venue } from '../types/courtsync';
import { createVenueWithCourtsInFirestore } from '../services/courtsyncService';

interface AddVenueModalProps {
  isSignedIn: boolean;
  onPromptLogin: () => void;
  onClose: () => void;
  onVenueCreated: (venue: Venue) => void;
}

interface DraftCourt {
  name: string;
  surface: string;
  indoor: boolean;
  basePricePerHour: number;
}

const FACILITY_PRESETS = [
  'Parkir Luas',
  'Mushola',
  'Kantin & Minuman',
  'Toilet & Ruang Ganti',
  'Wi-Fi',
  'Lampu LED Standar Turnamen',
  'Tribun Penonton',
  'Sewa Raket / Bola',
];

export const AddVenueModal: React.FC<AddVenueModalProps> = ({
  isSignedIn,
  onPromptLogin,
  onClose,
  onVenueCreated,
}) => {
  const [name, setName] = useState('');
  const [sport, setSport] = useState<SportCategory>('Badminton');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([
    'Parkir Luas',
    'Toilet & Ruang Ganti',
    'Kantin & Minuman',
  ]);
  const [courts, setCourts] = useState<DraftCourt[]>([
    { name: 'Lapangan 1', surface: 'Karpet Vinyl BWF', indoor: true, basePricePerHour: 95000 },
    { name: 'Lapangan 2', surface: 'Karpet Vinyl BWF', indoor: true, basePricePerHour: 95000 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleFacility = (fac: string) => {
    setSelectedFacilities((prev) =>
      prev.includes(fac) ? prev.filter((x) => x !== fac) : [...prev, fac]
    );
  };

  const addCourtRow = () => {
    if (courts.length >= 8) return;
    const defaultSurface =
      sport === 'Badminton'
        ? 'Karpet Vinyl BWF'
        : sport === 'Futsal'
        ? 'Interlock Pro'
        : sport === 'Mini Soccer'
        ? 'Rumput Sintetis FIFA'
        : 'Panoramic Turf Pro';
    const defaultPrice =
      sport === 'Badminton'
        ? 95000
        : sport === 'Futsal'
        ? 185000
        : sport === 'Mini Soccer'
        ? 550000
        : 320000;
    setCourts((prev) => [
      ...prev,
      {
        name: `Lapangan ${prev.length + 1}`,
        surface: defaultSurface,
        indoor: sport !== 'Mini Soccer',
        basePricePerHour: defaultPrice,
      },
    ]);
  };

  const removeCourtRow = (idx: number) => {
    if (courts.length <= 1) return;
    setCourts((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCourt = (idx: number, patch: Partial<DraftCourt>) => {
    setCourts((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) {
      onPromptLogin();
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const res = await createVenueWithCourtsInFirestore({
        name,
        sport,
        area,
        address,
        openHour: 8,
        closeHour: 22,
        facilities: selectedFacilities,
        bankAccount,
        courts,
      });
      if (!res.ok || !res.venue) {
        setErrorMsg(res.error || 'Gagal mendaftarkan GOR ke database.');
        return;
      }
      onVenueCreated(res.venue);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Daftarkan GOR Baru ke CourtSync"
        className="w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="bg-[#0F172A] text-white px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-emerald-400 font-medium">Pendaftaran Venue Resmi Mitra GOR</p>
              <h2 className="font-display font-bold text-base sm:text-lg">
                Publikasikan GOR &amp; Lapangan Anda
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form pendaftaran GOR"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 thin-scrollbar">
          {!isSignedIn && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950">
              <span>Masuk dengan akun Google Mitra GOR untuk menyimpan GOR baru langsung ke Cloud Firestore.</span>
              <button
                type="button"
                onClick={onPromptLogin}
                className="px-3 py-1.5 bg-[#0F172A] text-white font-semibold rounded-lg"
              >
                Masuk Sekarang
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama GOR / Venue *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="GOR Antapani Sport Center"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cabang Olahraga *
              </label>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value as SportCategory)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Badminton">Badminton</option>
                <option value="Futsal">Futsal</option>
                <option value="Mini Soccer">Mini Soccer</option>
                <option value="Padel">Padel</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kecamatan / Area Bandung *
              </label>
              <input
                type="text"
                required
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Antapani, Bandung"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rekening Pencairan Dana H+1 *
              </label>
              <input
                type="text"
                required
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="BCA 7770-1234-56 a.n. GOR Antapani"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Alamat Lengkap GOR *
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Jl. Terusan Jakarta No. 120, Antapani, Kota Bandung"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Facilities */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">Fasilitas Venue</label>
            <div className="flex flex-wrap gap-2">
              {FACILITY_PRESETS.map((fac) => {
                const active = selectedFacilities.includes(fac);
                return (
                  <button
                    key={fac}
                    type="button"
                    onClick={() => toggleFacility(fac)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {fac}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Courts List */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-900">Daftar Lapangan ({courts.length})</p>
                <p className="text-[11px] text-slate-500">
                  Setiap lapangan langsung tersedia untuk booking 08:00–22:00 WIB.
                </p>
              </div>
              <button
                type="button"
                onClick={addCourtRow}
                disabled={courts.length >= 8}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-lg inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Lapangan
              </button>
            </div>

            <div className="space-y-2.5">
              {courts.map((c, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                >
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Nama Lapangan
                    </label>
                    <input
                      type="text"
                      required
                      value={c.name}
                      onChange={(e) => updateCourt(idx, { name: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Jenis Lantai / Permukaan
                    </label>
                    <input
                      type="text"
                      required
                      value={c.surface}
                      onChange={(e) => updateCourt(idx, { surface: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tarif / Jam (Rp)
                    </label>
                    <input
                      type="number"
                      required
                      min={20000}
                      step={5000}
                      value={c.basePricePerHour}
                      onChange={(e) =>
                        updateCourt(idx, { basePricePerHour: Math.max(20000, Number(e.target.value) || 0) })
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white tabular-nums"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      disabled={courts.length <= 1}
                      onClick={() => removeCourtRow(idx)}
                      aria-label="Hapus lapangan"
                      className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-slate-950 font-display font-bold text-xs sm:text-sm rounded-xl inline-flex items-center gap-2 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan ke Cloud...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Publikasikan GOR Sekarang
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
