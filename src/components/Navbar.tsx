import React from 'react';
import { Building2, FileSignature, LogIn, LogOut, Sparkles, User, UserPlus } from 'lucide-react';
import { AppMode, AuthScreen, B2BTab, B2CTab, UserProfile } from '../types/courtsync';

interface NavbarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  b2cTab: B2CTab;
  onB2CTabChange: (tab: B2CTab) => void;
  b2bTab: B2BTab;
  onB2BTabChange: (tab: B2BTab) => void;
  userTicketsCount: number;
  openPlayCount: number;
  currentUser: { displayName: string | null; email: string | null } | null;
  userProfile: UserProfile | null;
  authScreen: AuthScreen;
  onOpenAuth: (screen: 'login' | 'register') => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  mode,
  onModeChange,
  b2cTab,
  onB2CTabChange,
  b2bTab,
  onB2BTabChange,
  userTicketsCount,
  openPlayCount,
  currentUser,
  userProfile,
  authScreen,
  onOpenAuth,
  onSignOut,
}) => {
  const isAuthOpen = authScreen !== 'none';
  const activeRoleLabel =
    userProfile?.accountType === 'mitra_gor' ? 'Mitra GOR' : 'Pemain';
  const displayFirstName =
    (userProfile?.displayName || currentUser?.displayName || 'Akun').split(' ')[0];

  return (
    <header className="sticky top-0 z-40 bg-[#0F172A] text-white border-b border-slate-800 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 lg:gap-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            onModeChange('B2C');
            onB2CTabChange('explore');
          }}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-md"
        >
          <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <line x1="12" y1="5" x2="12" y2="19" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </span>
          <span className="font-display font-extrabold text-lg tracking-tight text-white">
            CourtSync
          </span>
        </button>

        {/* Zone 2: Clean Single-Line Navigation Links (Desktop) */}
        <nav aria-label="Navigasi Utama" className="hidden lg:flex items-center gap-5 text-sm font-medium">
          {mode === 'B2C' ? (
            <>
              <button
                type="button"
                onClick={() => onB2CTabChange('explore')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  !isAuthOpen && b2cTab === 'explore'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                Jelajah &amp; Booking
              </button>
              <button
                type="button"
                onClick={() => onB2CTabChange('mabar')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5 ${
                  !isAuthOpen && b2cTab === 'mabar'
                    ? 'text-white border-amber-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                <span>Cari Mabar</span>
                <span className="font-mono text-xs text-amber-400 tabular-nums">({openPlayCount})</span>
              </button>
              <button
                type="button"
                onClick={() => onB2CTabChange('studio')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5 ${
                  !isAuthOpen && b2cTab === 'studio'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Studio AI</span>
              </button>
              <button
                type="button"
                onClick={() => onB2CTabChange('tickets')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5 ${
                  !isAuthOpen && b2cTab === 'tickets'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                <span>Tiket Saya</span>
                {userTicketsCount > 0 && (
                  <span className="font-mono text-xs text-emerald-400 tabular-nums">({userTicketsCount})</span>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onB2BTabChange('calendar')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  !isAuthOpen && b2bTab === 'calendar'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                Kalender GOR
              </button>
              <button
                type="button"
                onClick={() => onB2BTabChange('pricing')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  !isAuthOpen && b2bTab === 'pricing'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                Dynamic Pricing
              </button>
              <button
                type="button"
                onClick={() => onB2BTabChange('studio')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5 ${
                  !isAuthOpen && b2bTab === 'studio'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Studio AI</span>
              </button>
              <button
                type="button"
                onClick={() => onB2BTabChange('proposal')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5 ${
                  !isAuthOpen && b2bTab === 'proposal'
                    ? 'text-white border-amber-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                <FileSignature className="w-3.5 h-3.5 text-amber-400" />
                <span>Proposal &amp; MoU</span>
              </button>
              <button
                type="button"
                onClick={() => onB2BTabChange('revenue')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  !isAuthOpen && b2bTab === 'revenue'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                Saldo H+1
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: Mode Switch & Role-Aware Auth Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Pilih Mode Aplikasi"
            className="inline-flex items-center p-1 bg-slate-800/90 border border-slate-700 rounded-lg shrink-0"
          >
            <button
              type="button"
              onClick={() => onModeChange('B2C')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                !isAuthOpen && mode === 'B2C'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Pemain</span>
            </button>
            <button
              type="button"
              onClick={() => onModeChange('B2B')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                !isAuthOpen && mode === 'B2B'
                  ? 'bg-white text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Mitra GOR</span>
            </button>
          </div>

          {currentUser ? (
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-700/80">
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                title={`Ubah peran atau profil (${currentUser.email ?? displayFirstName})`}
                className="flex flex-col items-end text-right leading-tight hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                <span className="text-xs font-semibold text-white max-w-[96px] truncate">
                  {displayFirstName}
                </span>
                <span
                  className={`text-[10px] font-semibold ${
                    userProfile?.accountType === 'mitra_gor'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {activeRoleLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={onSignOut}
                title="Keluar dari akun"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-700/80">
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 border ${
                  authScreen === 'login'
                    ? 'bg-slate-700 text-white border-slate-500'
                    : 'text-slate-200 hover:text-white border-slate-700 hover:border-slate-500'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                <span>Masuk</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  authScreen === 'register'
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Daftar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Compact Mobile & Tablet Navigation Row */}
      <div className="lg:hidden border-t border-slate-800 bg-[#0F172A] px-4 py-2 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar text-xs font-medium">
        <div className="flex items-center gap-5 shrink-0">
          {mode === 'B2C' ? (
            <>
              <button
                type="button"
                onClick={() => onB2CTabChange('explore')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  !isAuthOpen && b2cTab === 'explore'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-400 border-transparent'
                }`}
              >
                Jelajah &amp; Booking
              </button>
              <button
                type="button"
                onClick={() => onB2CTabChange('mabar')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  !isAuthOpen && b2cTab === 'mabar'
                    ? 'text-white border-amber-400'
                    : 'text-slate-400 border-transparent'
                }`}
              >
                Cari Mabar ({openPlayCount})
              </button>
              <button
                type="button"
                onClick={() => onB2CTabChange('studio')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 inline-flex items-center gap-1 ${
                  !isAuthOpen && b2cTab === 'studio'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-400 border-transparent'
                }`}
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Studio AI
              </button>
              <button
                type="button"
                onClick={() => onB2CTabChange('tickets')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  !isAuthOpen && b2cTab === 'tickets'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-400 border-transparent'
                }`}
              >
                Tiket Saya {userTicketsCount > 0 ? `(${userTicketsCount})` : ''}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onB2BTabChange('calendar')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  !isAuthOpen && b2bTab === 'calendar'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-400 border-transparent'
                }`}
              >
                Kalender GOR
              </button>
              <button
                type="button"
                onClick={() => onB2BTabChange('pricing')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  !isAuthOpen && b2bTab === 'pricing'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-400 border-transparent'
                }`}
              >
                Dynamic Pricing
              </button>
              <button
                type="button"
                onClick={() => onB2BTabChange('studio')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 inline-flex items-center gap-1 ${
                  !isAuthOpen && b2bTab === 'studio'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-400 border-transparent'
                }`}
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Studio AI
              </button>
              <button
                type="button"
                onClick={() => onB2BTabChange('proposal')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 inline-flex items-center gap-1 ${
                  !isAuthOpen && b2bTab === 'proposal'
                    ? 'text-white border-amber-400'
                    : 'text-slate-400 border-transparent'
                }`}
              >
                <FileSignature className="w-3 h-3 text-amber-400" />
                Proposal &amp; MoU
              </button>
              <button
                type="button"
                onClick={() => onB2BTabChange('revenue')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  !isAuthOpen && b2bTab === 'revenue'
                    ? 'text-white border-emerald-400'
                    : 'text-slate-400 border-transparent'
                }`}
              >
                Saldo H+1
              </button>
            </>
          )}
        </div>

        {/* Mobile Auth Actions */}
        <div className="sm:hidden flex items-center gap-2 shrink-0 pl-3 border-l border-slate-800">
          {currentUser ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1 text-slate-300 hover:text-white whitespace-nowrap shrink-0"
            >
              <span className={userProfile?.accountType === 'mitra_gor' ? 'text-amber-400' : 'text-emerald-400'}>
                {displayFirstName} ({activeRoleLabel})
              </span>
              <LogOut className="w-3.5 h-3.5 ml-1" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className={`whitespace-nowrap shrink-0 py-1 ${
                  authScreen === 'login' ? 'text-white font-semibold' : 'text-slate-300'
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="whitespace-nowrap shrink-0 px-2.5 py-1 rounded-md bg-emerald-500 text-slate-950 font-semibold"
              >
                Daftar
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
