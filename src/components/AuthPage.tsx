import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  Loader2,
  Map as MapIcon,
  MapPin,
  ShieldCheck,
  User,
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { fetchUserProfile, saveUserProfile } from '../services/courtsyncService';
import { SkillLevel, UserProfile, UserRole } from '../types/courtsync';
import { LocationMapPicker } from './LocationMapPicker';

interface AuthPageProps {
  initialTab: 'login' | 'register';
  onBack: () => void;
  onAuthComplete: (profile: UserProfile) => void;
}

const LEVELS: SkillLevel[] = ['Pemula', 'Menengah', 'Mahir'];

export const AuthPage: React.FC<AuthPageProps> = ({
  initialTab,
  onBack,
  onAuthComplete,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  const [role, setRole] = useState<UserRole>('player');

  // Registration fields
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [favoriteSport, setFavoriteSport] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('Menengah');
  const [venueName, setVenueName] = useState('');
  const [venueArea, setVenueArea] = useState('');
  const [showLocationMap, setShowLocationMap] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (tab === 'register') {
      if (displayName.trim().length < 2) {
        setErrorMsg('Masukkan nama lengkap minimal 2 karakter terlebih dahulu.');
        return;
      }
      if (role === 'mitra_gor' && venueName.trim().length < 3) {
        setErrorMsg('Masukkan nama GOR atau venue olahraga yang kamu kelola.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      const email = fbUser.email || '';

      if (tab === 'login') {
        const existingProfile = await fetchUserProfile(fbUser.uid);
        if (existingProfile) {
          // If user explicitly switched role card on Login screen, sync workspace role
          if (existingProfile.accountType !== role) {
            const updated = await saveUserProfile({
              uid: fbUser.uid,
              displayName: existingProfile.displayName,
              email,
              phone: existingProfile.phone,
              accountType: role,
              favoriteSport: existingProfile.favoriteSport,
              skillLevel: existingProfile.skillLevel,
              venueName: existingProfile.venueName,
              venueArea: existingProfile.venueArea,
            });
            onAuthComplete(updated);
            return;
          }
          onAuthComplete(existingProfile);
          return;
        }

        // First-time Google login via Login tab -> initialize profile cleanly with chosen role
        const created = await saveUserProfile({
          uid: fbUser.uid,
          displayName: fbUser.displayName || 'Pemain CourtSync',
          email,
          accountType: role,
          favoriteSport: role === 'player' ? 'Badminton' : undefined,
          skillLevel: role === 'player' ? 'Menengah' : undefined,
          venueName: undefined,
          venueArea: role === 'mitra_gor' ? 'Bandung' : undefined,
        });
        onAuthComplete(created);
        return;
      }

      // Register tab -> persist full role-specific profile in Firestore
      const registered = await saveUserProfile({
        uid: fbUser.uid,
        displayName: displayName.trim() || fbUser.displayName || 'Pengguna CourtSync',
        email,
        phone: phone.trim() || undefined,
        accountType: role,
        favoriteSport: role === 'player' ? favoriteSport.trim() || undefined : undefined,
        skillLevel: role === 'player' ? skillLevel : undefined,
        venueName: role === 'mitra_gor' ? venueName.trim() : undefined,
        venueArea: role === 'mitra_gor' ? venueArea.trim() || undefined : undefined,
      });
      onAuthComplete(registered);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup-closed-by-user')) {
        setErrorMsg('Popup login Google ditutup sebelum selesai. Silakan coba lagi.');
      } else if (msg.includes('popup-blocked')) {
        setErrorMsg('Popup browser diblokir. Izinkan popup untuk melanjutkan login Google.');
      } else {
        setErrorMsg('Gagal memproses autentikasi. Pastikan koneksi stabil lalu coba lagi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid grid-cols-1 lg:grid-cols-12 items-stretch bg-[#F8FAFC]">
      {/* Left Athletic Editorial Panel */}
      <aside className="lg:col-span-5 relative bg-[#0F172A] text-white overflow-hidden flex flex-col justify-between p-8 sm:p-10">
        <img
          src="/src/assets/images/venue_padel_dago_1795093073795.jpg"
          alt="Lapangan Padel Club Dago Bandung"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/85 to-[#0F172A]/60" />

        <div className="relative z-10 space-y-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Jelajah Lapangan
          </button>

          <div className="space-y-3 pt-4">
            <p className="text-xs font-semibold text-emerald-400">
              Akses Terpadu · Pemain &amp; Mitra GOR Bandung
            </p>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tight leading-tight text-balance">
              Satu ekosistem untuk main bareng dan kelola lapangan.
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed max-w-md">
              Pilih peran yang sesuai kebutuhanmu. Akun tersinkronisasi otomatis ke Firestore untuk kunci slot anti-bentrok, pelacakan Split Bill, hingga kontrol jadwal GOR.
            </p>
          </div>
        </div>

        {/* Role Comparison Matrix */}
        <div className="relative z-10 mt-10 pt-6 border-t border-slate-700/70 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Role Pemain (B2C)
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              Booking slot real-time 08:00–22:00 · Patungan Split Bill QRIS · Gabung Open Play Mabar · E-Ticket QR &amp; Lobby Chat.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Role Mitra GOR (B2B)
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              Kalender jadwal lapangan terpusat · Input tamu Walk-In anti-bentrok · Atur diskon jam sepi (Dynamic Pricing) · Laporan saldo H+1.
            </p>
          </div>
        </div>
      </aside>

      {/* Right Interactive Login / Register Form */}
      <section className="lg:col-span-7 flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          {/* Segmented Auth Mode Tabs */}
          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex p-1 bg-slate-100 rounded-xl w-full">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setErrorMsg(null);
                }}
                className={`flex-1 py-2.5 text-sm font-display font-bold rounded-lg transition-colors ${
                  tab === 'login'
                    ? 'bg-[#0F172A] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setErrorMsg(null);
                }}
                className={`flex-1 py-2.5 text-sm font-display font-bold rounded-lg transition-colors ${
                  tab === 'register'
                    ? 'bg-[#0F172A] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daftar Akun
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight">
              {tab === 'login' ? 'Masuk ke Akun CourtSync' : 'Buat Akun Baru CourtSync'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              {tab === 'login'
                ? 'Pilih peran workspace tujuanmu, lalu masuk instan menggunakan akun Google.'
                : 'Tentukan peran kamu sebagai Pemain atau Mitra GOR, lengkapi profil singkat, lalu verifikasi dengan Google.'}
            </p>
          </div>

          {/* Role Selection Cards */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-slate-700">
              Pilih Role Akun
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('player')}
                className={`p-4 rounded-xl border text-left transition-all relative ${
                  role === 'player'
                    ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      role === 'player'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <User className="w-4 h-4" />
                  </span>
                  {role === 'player' && <Check className="w-4 h-4 text-emerald-600" />}
                </div>
                <p className="font-display font-bold text-sm text-slate-900 mt-3">
                  Pemain (B2C)
                </p>
                <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                  Cari lapangan, Split Bill patungan, gabung Mabar &amp; simpan E-Ticket.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRole('mitra_gor')}
                className={`p-4 rounded-xl border text-left transition-all relative ${
                  role === 'mitra_gor'
                    ? 'border-[#0F172A] bg-slate-900 text-white ring-2 ring-slate-900/15'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      role === 'mitra_gor'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                  </span>
                  {role === 'mitra_gor' && <Check className="w-4 h-4 text-amber-400" />}
                </div>
                <p
                  className={`font-display font-bold text-sm mt-3 ${
                    role === 'mitra_gor' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Mitra GOR (B2B)
                </p>
                <p
                  className={`text-xs mt-0.5 leading-snug ${
                    role === 'mitra_gor' ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  Kelola kalender GOR, input Walk-In, Dynamic Pricing &amp; saldo H+1.
                </p>
              </button>
            </div>
          </div>

          <form onSubmit={handleGoogleAuth} className="space-y-4">
            {/* Registration-Only Role-Specific Fields */}
            {tab === 'register' && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Lengkap
                    </label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={role === 'player' ? 'Contoh: Raka Pratama' : 'Contoh: Hendra Wijaya'}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      No. WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0812-xxxx-xxxx"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {role === 'player' ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Olahraga Favorit
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={favoriteSport}
                        onChange={(e) => setFavoriteSport(e.target.value)}
                        placeholder="Isi manual (contoh: Badminton, Futsal, Padel, Tenis...)"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Level Permainan (untuk rekomendasi Mabar)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {LEVELS.map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setSkillLevel(lvl)}
                            className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                              skillLevel === lvl
                                ? 'bg-amber-400 text-slate-950 border-amber-500'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Nama GOR / Venue
                        </label>
                        <input
                          type="text"
                          required
                          value={venueName}
                          onChange={(e) => setVenueName(e.target.value)}
                          placeholder="Contoh: GOR Antapani Sport Center"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="block text-xs font-semibold text-slate-700">
                            Lokasi GOR
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowLocationMap((prev) => !prev)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                          >
                            <MapIcon className="w-3.5 h-3.5" />
                            <span>{showLocationMap ? 'Tutup Maps' : 'Pilih di Maps'}</span>
                          </button>
                        </div>
                        <div className="relative">
                          <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            required
                            maxLength={80}
                            value={venueArea}
                            onChange={(e) => setVenueArea(e.target.value)}
                            placeholder="Isi manual (mis. Antapani, Bandung) atau pilih Maps"
                            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>

                    {showLocationMap && (
                      <LocationMapPicker
                        value={venueArea}
                        onSelectLocation={(label) => setVenueArea(label)}
                        onClose={() => setShowLocationMap(false)}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {errorMsg && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Primary Google Sign-In / Register Submit */}
            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3.5 px-5 rounded-xl font-display font-bold text-sm transition-colors inline-flex items-center justify-center gap-2.5 ${
                role === 'mitra_gor'
                  ? 'bg-[#0F172A] hover:bg-slate-800 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'
              } disabled:opacity-60`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menghubungkan ke Akun Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.3v3.09A12 12 0 0 0 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6V6.61H1.3a12 12 0 0 0 0 10.78l3.99-3.09z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.61l3.99 3.09c.94-2.84 3.59-4.95 6.71-4.95z"
                    />
                  </svg>
                  <span>
                    {tab === 'login'
                      ? `Masuk sebagai ${role === 'player' ? 'Pemain' : 'Mitra GOR'} dengan Google`
                      : `Daftar sebagai ${role === 'player' ? 'Pemain' : 'Mitra GOR'} dengan Google`}
                  </span>
                </>
              )}
            </button>

            <div className="pt-2 flex items-start gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Autentikasi aman menggunakan Firebase Google Sign-In. Data peran tersimpan terenkripsi di profil Firestore dan langsung mengarahkanmu ke dashboard{' '}
                <strong className="text-slate-700">
                  {role === 'player' ? 'Mode Pemain' : 'Mitra GOR (B2B)'}
                </strong>
                .
              </span>
            </div>
          </form>

          {/* Bottom Switch Prompt */}
          <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-600">
            {tab === 'login' ? (
              <>
                Belum punya akun CourtSync?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setTab('register');
                    setErrorMsg(null);
                  }}
                  className="font-bold text-emerald-700 hover:underline"
                >
                  Daftar sekarang
                </button>
              </>
            ) : (
              <>
                Sudah punya akun?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setErrorMsg(null);
                  }}
                  className="font-bold text-emerald-700 hover:underline"
                >
                  Masuk di sini
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
