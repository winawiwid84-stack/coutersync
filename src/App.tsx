/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  AppMode,
  AuthScreen,
  B2BTab,
  B2CTab,
  Booking,
  BookingSource,
  DynamicPricingRule,
  GeneratedContentPackage,
  LobbyChatMessage,
  OpenPlaySession,
  PaymentMethod,
  SavedContentDraft,
  SkillLevel,
  SplitParticipant,
  SportCategory,
  UserProfile,
  Venue,
  VenueReview,
} from './types/courtsync';
import {
  BANDUNG_VENUES,
  INITIAL_DYNAMIC_PRICING,
  INITIAL_VENUE_REVIEWS,
  createInitialData,
} from './data/mockBandungData';
import { formatSingleHour, generateBookingCode } from './utils/format';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  createAtomicFirestoreBooking,
  createVenueReviewToFirestore,
  deleteContentDraftFromFirestore,
  ensureVenuesSeeded,
  fetchPublicVenueReviews,
  fetchUserContentDrafts,
  fetchUserProfile,
  persistLobbyMessage,
  persistVenueDynamicPricing,
  saveContentDraftToFirestore,
  triggerSplitBillPaymentWebhook,
} from './services/courtsyncService';
import { Navbar } from './components/Navbar';
import { AuthPage } from './components/AuthPage';
import { AIContentStudio } from './components/AIContentStudio';
import { B2CVenueExplorer, SelectedSlotPayload } from './components/B2CVenueExplorer';
import { BookingModal } from './components/BookingModal';
import { OpenPlayFeed } from './components/OpenPlayFeed';
import { MyTicketsView } from './components/MyTicketsView';
import { B2BOwnerDashboard } from './components/B2BOwnerDashboard';
import { LobbyChatDrawer } from './components/LobbyChatDrawer';
import { ReviewModal } from './components/ReviewModal';
import { Venue3DViewerModal } from './components/Venue3DViewerModal';
import { GeminiChatbotDrawer } from './components/GeminiChatbotDrawer';

const SIMULATED_REPLIES = [
  'Siap bro, gas ketemu di lapangan nanti!',
  'Mantap, saya juga bawa cadangan bola / shuttlecock ya.',
  'Oke noted! Hati-hati di jalan, Bandung sore agak macet dikit.',
  'Sip banget, nanti pemanasan bareng 10 menit sebelum mulai.',
];

export default function App() {
  const initial = useMemo(() => createInitialData(), []);

  const [mode, setMode] = useState<AppMode>('B2C');
  const [b2cTab, setB2CTab] = useState<B2CTab>('explore');
  const [b2bTab, setB2BTab] = useState<B2BTab>('calendar');
  const [authScreen, setAuthScreen] = useState<AuthScreen>('none');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [bookings, setBookings] = useState<Booking[]>(() =>
    initial.bookings.map((b) => (b.id === 'bk-101' ? { ...b, isUserBooking: true } : b))
  );
  const [openPlays, setOpenPlays] = useState<OpenPlaySession[]>(initial.openPlays);
  const [chatMessages, setChatMessages] = useState<LobbyChatMessage[]>(initial.chatMessages);
  const [pricingRules, setPricingRules] = useState<Record<string, DynamicPricingRule>>(
    INITIAL_DYNAMIC_PRICING
  );
  const [savedDrafts, setSavedDrafts] = useState<SavedContentDraft[]>([]);
  const [reviews, setReviews] = useState<VenueReview[]>(INITIAL_VENUE_REVIEWS);

  // Active modals / drawers
  const [pendingSlotSelection, setPendingSlotSelection] = useState<SelectedSlotPayload | null>(null);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ booking: Booking; venue: Venue } | null>(null);
  const [viewer3DSport, setViewer3DSport] = useState<SportCategory | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  // Listen for Google Maps Platform Demo Key quota exceeded events (Case A Defense)
  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Load public player reviews from Firestore on startup
  useEffect(() => {
    fetchPublicVenueReviews()
      .then((cloudReviews) => {
        if (cloudReviews.length === 0) return;
        setReviews((prev) => {
          const cloudIds = new Set(cloudReviews.map((r) => r.id));
          return [...cloudReviews, ...prev.filter((r) => !cloudIds.has(r.id))];
        });
      })
      .catch(() => {});
  }, []);

  // Subscribe to Firebase Auth state & load Firestore UserProfile role + saved AI content drafts
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user) {
        if (user.emailVerified) {
          ensureVenuesSeeded().catch(() => {});
        }
        fetchUserProfile(user.uid)
          .then((profile) => {
            if (profile) {
              setUserProfile(profile);
              setMode(profile.accountType === 'mitra_gor' ? 'B2B' : 'B2C');
            }
          })
          .catch(() => {});
        fetchUserContentDrafts(user.uid)
          .then((drafts) => setSavedDrafts(drafts))
          .catch(() => {});
      } else {
        setUserProfile(null);
      }
    });
    return () => unsub();
  }, []);

  // Live Firestore real-time synchronization for authenticated users
  useEffect(() => {
    if (!authReady || !currentUser) return;

    // 1. Live Dynamic Pricing synced from Firestore `venues`
    const publicVenuesQuery = query(
      collection(db, 'venues'),
      where('isPublic', '==', true)
    );
    const unsubVenues = onSnapshot(
      publicVenuesQuery,
      (snap) => {
        if (snap.empty) return;
        setPricingRules((prev) => {
          const next = { ...prev };
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            next[docSnap.id] = {
              venueId: docSnap.id,
              enabled: Boolean(d.pricingEnabled),
              days: Array.isArray(d.pricingDays) ? d.pricingDays : [1, 2, 3, 4, 5],
              startHour: Number(d.pricingStartHour ?? 9),
              endHour: Number(d.pricingEndHour ?? 15),
              discountPercent: Number(d.pricingDiscountPercent ?? 20),
              label: String(d.pricingLabel ?? 'Promo Off-Peak Siang'),
            };
          });
          return next;
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'venues');
      }
    );

    // 2. Live user bookings synced from Firestore `bookings` (owner-scoped query matching security rules)
    const userBookingsQuery = query(
      collection(db, 'bookings'),
      where('ownerUid', '==', currentUser.uid)
    );
    const unsubBookings = onSnapshot(
      userBookingsQuery,
      (snap) => {
        if (snap.empty) return;
        const remoteBookings: Booking[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            bookingCode: String(d.bookingCode),
            venueId: String(d.venueId),
            courtId: String(d.courtId),
            date: String(d.date),
            hours: Array.isArray(d.hours) ? d.hours.map(Number) : [],
            customerName: String(d.customerName),
            customerPhone: String(d.customerPhone),
            source: d.source as BookingSource,
            paymentMethod: d.paymentMethod as PaymentMethod,
            totalPrice: Number(d.totalPrice),
            discountApplied: Number(d.discountApplied ?? 0),
            paymentMode: d.paymentMode === 'split' ? 'split' : 'full',
            splitLink: d.splitLink ? String(d.splitLink) : undefined,
            status: d.status,
            createdAt: 'Tersinkronisasi Cloud',
            isUserBooking: true,
            openPlayId: d.openPlayId ? String(d.openPlayId) : undefined,
            notes: d.notes ? String(d.notes) : undefined,
          };
        });

        setBookings((prev) => {
          const remoteIds = new Set(remoteBookings.map((r) => r.id));
          const preserved = prev.filter((b) => !remoteIds.has(b.id));
          // Merge splitParticipants from local state if already populated
          const mergedRemote = remoteBookings.map((rb) => {
            const existing = prev.find((p) => p.id === rb.id);
            return existing?.splitParticipants
              ? { ...rb, splitParticipants: existing.splitParticipants }
              : rb;
          });
          return [...mergedRemote, ...preserved];
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      }
    );

    // 3. Live Split Bill participant updates from Firestore `booking_participants`
    const participantsQuery = query(
      collection(db, 'booking_participants'),
      where('ownerUid', '==', currentUser.uid)
    );
    const unsubParticipants = onSnapshot(
      participantsQuery,
      (snap) => {
        if (snap.empty) return;
        const grouped: Record<string, SplitParticipant[]> = {};
        snap.docs.forEach((docSnap) => {
          const d = docSnap.data();
          const bId = String(d.bookingId);
          if (!grouped[bId]) grouped[bId] = [];
          grouped[bId].push({
            id: docSnap.id.replace(`${bId}_`, ''),
            name: String(d.name),
            amount: Number(d.amount),
            paid: Boolean(d.paid),
            paidAt: d.paidAt ? String(d.paidAt) : undefined,
            isHost: Boolean(d.isHost),
          });
        });

        setBookings((prev) =>
          prev.map((b) => (grouped[b.id] ? { ...b, splitParticipants: grouped[b.id] } : b))
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'booking_participants');
      }
    );

    return () => {
      unsubVenues();
      unsubBookings();
      unsubParticipants();
    };
  }, [authReady, currentUser]);

  const handleAuthComplete = (profile: UserProfile) => {
    setUserProfile(profile);
    if (profile.accountType === 'mitra_gor') {
      setMode('B2B');
      setB2BTab('calendar');
    } else {
      setMode('B2C');
      setB2CTab('explore');
    }
    setAuthScreen('none');
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      setSavedDrafts([]);
      setAuthScreen('none');
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const handleSaveContentDraft = async (params: {
    roleMode: AppMode;
    venueId?: string;
    platform: string;
    tone: string;
    prompt: string;
    mediaType: 'none' | 'image' | 'video';
    mediaFileName?: string;
    content: GeneratedContentPackage;
  }) => {
    if (currentUser && currentUser.emailVerified) {
      const saved = await saveContentDraftToFirestore(params);
      if (saved) {
        setSavedDrafts((prev) => [saved, ...prev]);
        return;
      }
    }
    const localDraft: SavedContentDraft = {
      id: `local-draft-${Date.now()}`,
      roleMode: params.roleMode,
      venueId: params.venueId,
      platform: params.platform,
      tone: params.tone,
      prompt: params.prompt,
      mediaType: params.mediaType,
      mediaFileName: params.mediaFileName,
      content: params.content,
      createdAtLabel: 'Sesi lokal',
      persistedToCloud: false,
    };
    setSavedDrafts((prev) => [localDraft, ...prev]);
  };

  const handleDeleteContentDraft = (draftId: string) => {
    setSavedDrafts((prev) => prev.filter((d) => d.id !== draftId));
    if (!draftId.startsWith('local-draft-')) {
      deleteContentDraftFromFirestore(draftId).catch(() => {});
    }
  };

  const handleSubmitVenueReview = async (payload: {
    venueId: string;
    bookingId: string;
    bookingCode: string;
    courtName: string;
    reviewerName: string;
    rating: number;
    comment: string;
    tags: string[];
    playedDate: string;
  }) => {
    if (currentUser && currentUser.emailVerified) {
      const saved = await createVenueReviewToFirestore(payload);
      if (saved) {
        setReviews((prev) => [saved, ...prev]);
        return;
      }
    }
    const localReview: VenueReview = {
      id: `local-rev-${Date.now()}`,
      venueId: payload.venueId,
      bookingId: payload.bookingId,
      bookingCode: payload.bookingCode,
      courtName: payload.courtName,
      reviewerName: payload.reviewerName,
      rating: payload.rating,
      comment: payload.comment,
      tags: payload.tags,
      playedDate: payload.playedDate,
      createdAtLabel: 'Baru saja',
      persistedToCloud: false,
    };
    setReviews((prev) => [localReview, ...prev]);
  };

  const userTicketsCount = useMemo(
    () => bookings.filter((b) => b.isUserBooking && b.status !== 'cancelled').length,
    [bookings]
  );

  // Unified Anti-Double-Booking conflict check
  const findConflict = (courtId: string, date: string, hours: number[]): Booking | undefined => {
    return bookings.find(
      (b) =>
        b.courtId === courtId &&
        b.date === date &&
        b.status !== 'cancelled' &&
        b.hours.some((h) => hours.includes(h))
    );
  };

  // B2C Booking confirmation handler (syncs atomically to Firestore + Express /api/bookings)
  const handleConfirmBooking = (params: {
    bookingCode: string;
    venueId: string;
    courtId: string;
    date: string;
    hours: number[];
    customerName: string;
    customerPhone: string;
    paymentMethod: PaymentMethod;
    totalPrice: number;
    discountApplied: number;
    paymentMode: 'full' | 'split';
    splitLink?: string;
    splitParticipants?: SplitParticipant[];
    publishOpenPlay: boolean;
    openPlayConfig?: {
      title: string;
      maxPlayers: number;
      skillLevel: SkillLevel;
      description: string;
    };
  }): { ok: boolean; error?: string; booking?: Booking } => {
    const conflict = findConflict(params.courtId, params.date, params.hours);
    if (conflict) {
      const clashHour = params.hours.find((h) => conflict.hours.includes(h)) ?? params.hours[0];
      return {
        ok: false,
        error: `Maaf, jam ${formatSingleHour(clashHour)} WIB baru saja dikunci oleh pemesan lain (${conflict.bookingCode}). Pilih slot jam lain yang masih tersedia.`,
      };
    }

    const venue = BANDUNG_VENUES.find((v) => v.id === params.venueId);
    const newBookingId = `bk-${Date.now()}`;
    const newOpenPlayId = params.publishOpenPlay ? `op-${Date.now()}` : undefined;

    const newBooking: Booking = {
      id: newBookingId,
      bookingCode: params.bookingCode,
      venueId: params.venueId,
      courtId: params.courtId,
      date: params.date,
      hours: params.hours,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      source: 'online',
      paymentMethod: params.paymentMethod,
      totalPrice: params.totalPrice,
      discountApplied: params.discountApplied,
      paymentMode: params.paymentMode,
      splitLink: params.splitLink,
      splitParticipants: params.splitParticipants,
      status: 'confirmed',
      createdAt: 'Baru saja',
      isUserBooking: true,
      openPlayId: newOpenPlayId,
    };

    let createdOpenPlay: OpenPlaySession | undefined;
    if (params.publishOpenPlay && params.openPlayConfig && newOpenPlayId && venue) {
      const costPerPerson =
        Math.ceil(params.totalPrice / params.openPlayConfig.maxPlayers / 1000) * 1000;
      createdOpenPlay = {
        id: newOpenPlayId,
        bookingId: newBookingId,
        title: params.openPlayConfig.title,
        sport: venue.sport,
        venueId: params.venueId,
        courtId: params.courtId,
        date: params.date,
        hours: params.hours,
        hostName: params.customerName,
        skillLevel: params.openPlayConfig.skillLevel,
        maxPlayers: params.openPlayConfig.maxPlayers,
        currentPlayers: 1,
        costPerPerson,
        description: params.openPlayConfig.description,
        participants: [params.customerName],
        joinedByCurrentUser: true,
      };
      setOpenPlays((prev) => [createdOpenPlay!, ...prev]);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          sessionId: newOpenPlayId,
          sender: 'Sistem CourtSync',
          text: `Sesi Open Play "${createdOpenPlay!.title}" berhasil dipublikasikan! Lapangan sudah dikunci dan siap menerima pemain Bandung lainnya.`,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          isSystem: true,
        },
      ]);
    }

    setBookings((prev) => [newBooking, ...prev]);

    // Persist atomically to Firestore when authenticated + notify Express POST /api/bookings
    createAtomicFirestoreBooking(newBooking, createdOpenPlay).catch((err) =>
      console.error('Atomic booking sync error:', err)
    );
    fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId: newBooking.venueId,
        courtId: newBooking.courtId,
        date: newBooking.date,
        hours: newBooking.hours,
        customerName: newBooking.customerName,
        customerPhone: newBooking.customerPhone,
        source: newBooking.source,
        paymentMethod: newBooking.paymentMethod,
        paymentMode: newBooking.paymentMode,
        totalPrice: newBooking.totalPrice,
        discountApplied: newBooking.discountApplied,
        splitParticipants: newBooking.splitParticipants,
      }),
    }).catch(() => {});

    return { ok: true, booking: newBooking };
  };

  // Mark Split Bill participant paid via Express Midtrans/Xendit webhook + Firestore sync
  const handleSimulateParticipantPay = (bookingId: string, participantId: string) => {
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const targetBooking = bookings.find((b) => b.id === bookingId);
    const participantIndex =
      targetBooking?.splitParticipants?.findIndex((p) => p.id === participantId) ?? 0;
    const participant = targetBooking?.splitParticipants?.[participantIndex];

    setBookings((prev) =>
      prev.map((b) => {
        if (b.id !== bookingId || !b.splitParticipants) return b;
        return {
          ...b,
          splitParticipants: b.splitParticipants.map((p) =>
            p.id === participantId ? { ...p, paid: true, paidAt: nowTime } : p
          ),
        };
      })
    );

    if (targetBooking && participant) {
      triggerSplitBillPaymentWebhook({
        bookingId: targetBooking.id,
        bookingCode: targetBooking.bookingCode,
        participantId,
        participantIndex,
        amount: participant.amount,
        gateway: 'midtrans',
      }).catch(() => {});
    }
  };

  // Join an Open Play (Mabar) session
  const handleJoinOpenPlay = (
    sessionId: string,
    playerName: string,
    paymentMethod: PaymentMethod
  ) => {
    const target = openPlays.find((s) => s.id === sessionId);
    if (!target || target.joinedByCurrentUser || target.currentPlayers >= target.maxPlayers) return;

    setOpenPlays((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          currentPlayers: s.currentPlayers + 1,
          participants: [...s.participants, playerName],
          joinedByCurrentUser: true,
        };
      })
    );

    const ticketBooking: Booking = {
      id: `bk-mabar-${Date.now()}`,
      bookingCode: generateBookingCode(),
      venueId: target.venueId,
      courtId: target.courtId,
      date: target.date,
      hours: target.hours,
      customerName: `${playerName} (Peserta Mabar)`,
      customerPhone: '0812-2345-6789',
      source: 'online',
      paymentMethod,
      totalPrice: target.costPerPerson,
      discountApplied: 0,
      paymentMode: 'full',
      status: 'confirmed',
      createdAt: 'Baru saja',
      isUserBooking: true,
      openPlayId: sessionId,
    };

    setBookings((prev) => {
      if (target.bookingId) {
        const hasMainBooking = prev.some((b) => b.id === target.bookingId);
        if (hasMainBooking) {
          return prev.map((b) =>
            b.id === target.bookingId ? { ...b, isUserBooking: true } : b
          );
        }
      }
      return [ticketBooking, ...prev];
    });

    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    setChatMessages((prev) => [
      ...prev,
      {
        id: `msg-join-${Date.now()}`,
        sessionId,
        sender: 'Sistem CourtSync',
        text: `${playerName} resmi bergabung & mengunci 1 slot lewat ${paymentMethod}.`,
        timestamp: nowTime,
        isSystem: true,
      },
    ]);
  };

  // Send Lobby Chat message + persist to Firestore + simulated teammate reply
  const handleSendChatMessage = (sessionId: string, text: string) => {
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const session = openPlays.find((s) => s.id === sessionId);
    const displayName = userProfile?.displayName || currentUser?.displayName || 'Kamu';

    setChatMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        sessionId,
        sender: displayName,
        text,
        timestamp: nowTime,
        isCurrentUser: true,
      },
    ]);

    persistLobbyMessage(sessionId, displayName, text).catch(() => {});

    if (session) {
      const responder =
        session.participants.find((p) => p !== displayName && p !== 'Andi Saputra') ??
        session.hostName;
      const replyText =
        SIMULATED_REPLIES[Math.floor(Math.random() * SIMULATED_REPLIES.length)];
      setTimeout(() => {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg-rep-${Date.now()}`,
            sessionId,
            sender: responder,
            text: replyText,
            timestamp: new Date().toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ]);
      }, 950);
    }
  };

  // B2B Manual Walk-In / Member Booking
  const handleAddManualBooking = (params: {
    venueId: string;
    courtId: string;
    date: string;
    hours: number[];
    customerName: string;
    customerPhone: string;
    source: BookingSource;
    totalPrice: number;
    notes?: string;
  }): { ok: boolean; error?: string } => {
    const conflict = findConflict(params.courtId, params.date, params.hours);
    if (conflict) {
      return {
        ok: false,
        error: `Konflik jadwal terdeteksi dengan ${conflict.customerName} (${conflict.bookingCode}).`,
      };
    }

    const newBooking: Booking = {
      id: `bk-b2b-${Date.now()}`,
      bookingCode: generateBookingCode(),
      venueId: params.venueId,
      courtId: params.courtId,
      date: params.date,
      hours: params.hours,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      source: params.source,
      paymentMethod: params.source === 'member' ? 'VA_BCA' : 'KASIR_TUNAI',
      totalPrice: params.totalPrice,
      discountApplied: 0,
      paymentMode: 'full',
      status: 'confirmed',
      createdAt: 'Input Kasir GOR',
      notes: params.notes,
    };

    setBookings((prev) => [newBooking, ...prev]);

    createAtomicFirestoreBooking(newBooking).catch(() => {});
    fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBooking),
    }).catch(() => {});

    return { ok: true };
  };

  const handleCancelBooking = (bookingId: string) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' } : b))
    );
  };

  const handleUpdatePricingRule = (venueId: string, nextRule: DynamicPricingRule) => {
    setPricingRules((prev) => ({
      ...prev,
      [venueId]: nextRule,
    }));
    const venue = BANDUNG_VENUES.find((v) => v.id === venueId);
    if (venue) {
      persistVenueDynamicPricing(venue, nextRule).catch(() => {});
    }
  };

  const activeChatSession = openPlays.find((s) => s.id === activeChatSessionId) ?? null;
  const activeChatVenue = activeChatSession
    ? BANDUNG_VENUES.find((v) => v.id === activeChatSession.venueId) ?? null
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Mandatory Google Maps Platform Demo Key Quota Banner */}
      {gmpQuotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs flex items-center justify-between gap-3"
        >
          <p className="font-medium">
            Google Maps API quota exceeded — switch to your own Google Cloud API key to continue:{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              Quota Troubleshooting Guide
            </a>
          </p>
          <button
            type="button"
            onClick={() => setGmpQuotaExceeded(false)}
            className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 transition-colors shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      <Navbar
        mode={mode}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          setAuthScreen('none');
        }}
        b2cTab={b2cTab}
        onB2CTabChange={(tab) => {
          setB2CTab(tab);
          setAuthScreen('none');
        }}
        b2bTab={b2bTab}
        onB2BTabChange={(tab) => {
          setB2BTab(tab);
          setAuthScreen('none');
        }}
        userTicketsCount={userTicketsCount}
        openPlayCount={openPlays.length}
        currentUser={currentUser}
        userProfile={userProfile}
        authScreen={authScreen}
        onOpenAuth={(screen) => setAuthScreen(screen)}
        onSignOut={handleSignOut}
      />

      {authScreen !== 'none' ? (
        <main className="flex-1 w-full">
          <AuthPage
            key={authScreen}
            initialTab={authScreen}
            onBack={() => setAuthScreen('none')}
            onAuthComplete={handleAuthComplete}
          />
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
          {mode === 'B2C' ? (
            <>
              {b2cTab === 'explore' && (
                <B2CVenueExplorer
                  venues={BANDUNG_VENUES}
                  bookings={bookings}
                  reviews={reviews}
                  pricingRules={pricingRules}
                  onProceedToBooking={(payload) => setPendingSlotSelection(payload)}
                  onJumpToMabar={() => setB2CTab('mabar')}
                  onOpen3DViewer={(sport) => setViewer3DSport(sport)}
                  onGoToTicketsForReview={() => setB2CTab('tickets')}
                  openPlayCount={openPlays.length}
                />
              )}

              {b2cTab === 'mabar' && (
                <OpenPlayFeed
                  sessions={openPlays}
                  venues={BANDUNG_VENUES}
                  onJoinSession={handleJoinOpenPlay}
                  onOpenChat={(id) => setActiveChatSessionId(id)}
                  onCreateFromExplore={() => setB2CTab('explore')}
                />
              )}

              {b2cTab === 'studio' && (
                <AIContentStudio
                  mode="B2C"
                  venues={BANDUNG_VENUES}
                  savedDrafts={savedDrafts}
                  isSignedIn={Boolean(currentUser)}
                  onSaveDraft={handleSaveContentDraft}
                  onDeleteDraft={handleDeleteContentDraft}
                  onPromptLogin={() => setAuthScreen('login')}
                />
              )}

              {b2cTab === 'tickets' && (
                <MyTicketsView
                  bookings={bookings}
                  venues={BANDUNG_VENUES}
                  reviews={reviews}
                  onSimulateParticipantPay={handleSimulateParticipantPay}
                  onOpenMabarChat={(id) => setActiveChatSessionId(id)}
                  onOpenReview={(booking, venue) => setReviewTarget({ booking, venue })}
                  onExploreClick={() => setB2CTab('explore')}
                />
              )}
            </>
          ) : b2bTab === 'studio' ? (
            <AIContentStudio
              mode="B2B"
              venues={BANDUNG_VENUES}
              savedDrafts={savedDrafts}
              isSignedIn={Boolean(currentUser)}
              onSaveDraft={handleSaveContentDraft}
              onDeleteDraft={handleDeleteContentDraft}
              onPromptLogin={() => setAuthScreen('login')}
            />
          ) : (
            <B2BOwnerDashboard
              venues={BANDUNG_VENUES}
              bookings={bookings}
              reviews={reviews}
              pricingRules={pricingRules}
              activeTab={b2bTab}
              onTabChange={setB2BTab}
              onAddManualBooking={handleAddManualBooking}
              onCancelBooking={handleCancelBooking}
              onUpdatePricingRule={handleUpdatePricingRule}
              onPreviewInB2C={() => {
                setMode('B2C');
                setB2CTab('explore');
              }}
            />
          )}
        </main>
      )}

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p className="font-medium text-slate-700">
            CourtSync (MainBareng) · Ekosistem Booking &amp; Komunitas Olahraga Bandung
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setAuthScreen('none');
                setMode('B2C');
                setB2CTab('explore');
              }}
              className="hover:text-slate-900 transition-colors"
            >
              Jelajah &amp; Booking
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthScreen('none');
                setMode('B2C');
                setB2CTab('mabar');
              }}
              className="hover:text-slate-900 transition-colors"
            >
              Cari Mabar
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthScreen('none');
                setMode('B2B');
                setB2BTab('calendar');
              }}
              className="hover:text-slate-900 transition-colors"
            >
              Portal Mitra GOR
            </button>
            {!currentUser && (
              <button
                type="button"
                onClick={() => setAuthScreen('register')}
                className="font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
              >
                Daftar Akun
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Interactive Booking & Split Bill Modal */}
      {pendingSlotSelection && (
        <BookingModal
          selection={pendingSlotSelection}
          onClose={() => setPendingSlotSelection(null)}
          onConfirmBooking={handleConfirmBooking}
          onSimulateParticipantPay={handleSimulateParticipantPay}
          onOpenMabarChat={(id) => setActiveChatSessionId(id)}
          onGoToTickets={() => setB2CTab('tickets')}
        />
      )}

      {/* Temporary Lobby Chat Drawer */}
      <LobbyChatDrawer
        session={activeChatSession}
        venue={activeChatVenue}
        messages={chatMessages}
        onClose={() => setActiveChatSessionId(null)}
        onSendMessage={handleSendChatMessage}
      />

      {/* Post-Booking Venue Review & 1-5 Star Rating Modal */}
      {reviewTarget && (
        <ReviewModal
          booking={reviewTarget.booking}
          venue={reviewTarget.venue}
          defaultReviewerName={userProfile?.displayName || currentUser?.displayName || ''}
          isSignedIn={Boolean(currentUser && currentUser.emailVerified)}
          onClose={() => setReviewTarget(null)}
          onSubmitReview={handleSubmitVenueReview}
        />
      )}

      {/* Three.js 3D Interactive Venue Court Viewer */}
      {viewer3DSport && (
        <Venue3DViewerModal
          initialSport={viewer3DSport}
          venues={BANDUNG_VENUES}
          onClose={() => setViewer3DSport(null)}
          onBookVenue={() => {
            setAuthScreen('none');
            setMode('B2C');
            setB2CTab('explore');
          }}
        />
      )}

      {/* Multi-Turn Gemini Chatbot Concierge & Sports Coach */}
      {!viewer3DSport && (
        <GeminiChatbotDrawer
          mode={mode}
          userDisplayName={userProfile?.displayName || currentUser?.displayName || undefined}
        />
      )}
    </div>
  );
}
