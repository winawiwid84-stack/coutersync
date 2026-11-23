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
  BookingSlotLock,
  BookingSource,
  Court,
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
import { formatSingleHour, generateBookingCode } from './utils/format';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  cancelBookingInFirestore,
  checkInBookingInFirestore,
  createAtomicFirestoreBooking,
  createVenueReviewToFirestore,
  deleteAllVenuesInFirestore,
  deleteContentDraftFromFirestore,
  deleteVenueWithCourtsInFirestore,
  fetchUserContentDrafts,
  fetchUserProfile,
  joinOpenPlayInFirestore,
  persistLobbyMessage,
  persistVenueDynamicPricing,
  purgeSeededDemoVenues,
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
import { MitraProposalPage } from './components/MitraProposalPage';
import { AddVenueModal } from './components/AddVenueModal';

export default function App() {
  const [mode, setMode] = useState<AppMode>('B2C');
  const [b2cTab, setB2CTab] = useState<B2CTab>('explore');
  const [b2bTab, setB2BTab] = useState<B2BTab>('calendar');
  const [authScreen, setAuthScreen] = useState<AuthScreen>('none');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Real-time Cloud Firestore states
  const [cloudVenuesMap, setCloudVenuesMap] = useState<Record<string, Omit<Venue, 'courts'>>>({});
  const [cloudCourtsList, setCloudCourtsList] = useState<Court[]>([]);
  const [pricingRules, setPricingRules] = useState<Record<string, DynamicPricingRule>>({});
  const [publicSlotLocks, setPublicSlotLocks] = useState<BookingSlotLock[]>([]);
  const [userBookings, setUserBookings] = useState<Booking[]>([]);
  const [venueOwnerBookings, setVenueOwnerBookings] = useState<Booking[]>([]);
  const [participantsByBooking, setParticipantsByBooking] = useState<
    Record<string, SplitParticipant[]>
  >({});
  const [openPlays, setOpenPlays] = useState<OpenPlaySession[]>([]);
  const [chatMessages, setChatMessages] = useState<LobbyChatMessage[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<SavedContentDraft[]>([]);
  const [reviews, setReviews] = useState<VenueReview[]>([]);

  // Active modals / drawers
  const [pendingSlotSelection, setPendingSlotSelection] = useState<SelectedSlotPayload | null>(null);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ booking: Booking; venue: Venue } | null>(null);
  const [viewer3DSport, setViewer3DSport] = useState<SportCategory | null>(null);
  const [addVenueOpen, setAddVenueOpen] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  // Live Cloud Firestore venues & courts only (zero hardcoded/mock partners)
  const venues: Venue[] = useMemo(() => {
    const cloudVenueEntries = Object.values(cloudVenuesMap);
    if (cloudVenueEntries.length === 0) {
      return [];
    }

    const courtsByVenue: Record<string, Court[]> = {};
    for (const c of cloudCourtsList) {
      if (!courtsByVenue[c.venueId]) courtsByVenue[c.venueId] = [];
      courtsByVenue[c.venueId].push(c);
    }

    return cloudVenueEntries.map((cv) => ({
      ...cv,
      courts: courtsByVenue[cv.id] ?? [],
    }));
  }, [cloudVenuesMap, cloudCourtsList]);

  // Combine detailed authenticated bookings (customer + venue owner) with public PII-free slot locks
  const bookings: Booking[] = useMemo(() => {
    const byId = new Map<string, Booking>();

    for (const b of venueOwnerBookings) {
      byId.set(b.id, {
        ...b,
        splitParticipants: participantsByBooking[b.id] ?? b.splitParticipants,
      });
    }
    for (const b of userBookings) {
      byId.set(b.id, {
        ...b,
        isUserBooking: true,
        splitParticipants: participantsByBooking[b.id] ?? b.splitParticipants,
      });
    }

    // Group public slot locks for slots belonging to other users so the schedule grid stays 100% conflict-free
    const lockGroups = new Map<string, BookingSlotLock[]>();
    for (const lock of publicSlotLocks) {
      if (byId.has(lock.bookingId)) continue;
      const arr = lockGroups.get(lock.bookingId) ?? [];
      arr.push(lock);
      lockGroups.set(lock.bookingId, arr);
    }

    for (const [bookingId, locks] of lockGroups.entries()) {
      const first = locks[0];
      const sortedHours = Array.from(new Set(locks.map((l) => l.hour))).sort((a, b) => a - b);
      byId.set(bookingId, {
        id: bookingId,
        bookingCode: 'TERKUNCI',
        venueId: first.venueId,
        courtId: first.courtId,
        date: first.date,
        hours: sortedHours,
        customerName:
          first.source === 'member'
            ? 'Member Rutin'
            : first.source === 'walkin'
            ? 'Tamu Walk-In'
            : 'Pemain Terverifikasi',
        customerPhone: 'Terlindungi',
        source: first.source,
        paymentMethod: 'QRIS',
        totalPrice: 0,
        discountApplied: 0,
        paymentMode: 'full',
        status: 'confirmed',
        createdAt: 'Cloud Real-Time',
        isUserBooking: false,
        persistedToCloud: true,
      });
    }

    return Array.from(byId.values());
  }, [userBookings, venueOwnerBookings, participantsByBooking, publicSlotLocks]);

  // Listen for Google Maps Platform Demo Key quota exceeded events
  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Subscribe to Firebase Auth state & load Firestore UserProfile role + saved AI content drafts
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user) {
        if (user.emailVerified && user.email === 'winawiwid84@gmail.com') {
          purgeSeededDemoVenues().catch(() => {});
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
        setUserBookings([]);
        setVenueOwnerBookings([]);
        setParticipantsByBooking({});
        setSavedDrafts([]);
      }
    });
    return () => unsub();
  }, []);

  // Live PUBLIC Firestore subscriptions (Venues, Courts, Global Slot Locks, Open Plays, Reviews)
  useEffect(() => {
    const publicVenuesQuery = query(
      collection(db, 'venues'),
      where('isPublic', '==', true)
    );
    const unsubVenues = onSnapshot(
      publicVenuesQuery,
      (snap) => {
        const nextVenues: Record<string, Omit<Venue, 'courts'>> = {};
        const nextPricing: Record<string, DynamicPricingRule> = {};
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          nextVenues[docSnap.id] = {
            id: docSnap.id,
            name: String(d.name || ''),
            sport: (d.sport as SportCategory) || 'Badminton',
            area: String(d.area || 'Bandung'),
            address: String(d.address || ''),
            rating: Number(d.rating ?? 4.8),
            reviewCount: Number(d.reviewCount ?? 0),
            imageUrl: String(d.imageUrl || '/assets/courtsync/venue-badminton.jpg'),
            openHour: Number(d.openHour ?? 8),
            closeHour: Number(d.closeHour ?? 22),
            facilities: Array.isArray(d.facilities) ? d.facilities.map(String) : [],
            bankAccount: String(d.bankAccount || ''),
            ownerUid: d.ownerUid ? String(d.ownerUid) : undefined,
          };
          nextPricing[docSnap.id] = {
            venueId: docSnap.id,
            enabled: Boolean(d.pricingEnabled),
            days: Array.isArray(d.pricingDays) ? d.pricingDays.map(Number) : [1, 2, 3, 4, 5],
            startHour: Number(d.pricingStartHour ?? 9),
            endHour: Number(d.pricingEndHour ?? 15),
            discountPercent: Number(d.pricingDiscountPercent ?? 20),
            label: String(d.pricingLabel ?? 'Promo Off-Peak Siang'),
          };
        });
        setCloudVenuesMap(nextVenues);
        setPricingRules(nextPricing);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'venues');
      }
    );

    const publicCourtsQuery = query(
      collection(db, 'courts'),
      where('isPublic', '==', true)
    );
    const unsubCourts = onSnapshot(
      publicCourtsQuery,
      (snap) => {
        const list: Court[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            venueId: String(d.venueId || ''),
            name: String(d.name || 'Lapangan'),
            surface: String(d.surface || 'Standar'),
            indoor: Boolean(d.indoor),
            basePricePerHour: Number(d.basePricePerHour ?? 100000),
            ownerUid: d.ownerUid ? String(d.ownerUid) : undefined,
          };
        });
        setCloudCourtsList(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'courts');
      }
    );

    const publicSlotsQuery = query(
      collection(db, 'booking_slots'),
      where('hour', '>=', 8),
      where('hour', '<=', 21)
    );
    const unsubSlots = onSnapshot(
      publicSlotsQuery,
      (snap) => {
        const locks: BookingSlotLock[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            venueId: String(d.venueId || ''),
            courtId: String(d.courtId || ''),
            date: String(d.date || ''),
            hour: Number(d.hour ?? 8),
            bookingId: String(d.bookingId || ''),
            source: (d.source as BookingSource) || 'online',
            ownerUid: String(d.ownerUid || ''),
          };
        });
        setPublicSlotLocks(locks);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'booking_slots');
      }
    );

    const publicOpenPlaysQuery = query(
      collection(db, 'open_plays'),
      where('status', 'in', ['open', 'full'])
    );
    const unsubOpenPlays = onSnapshot(
      publicOpenPlaysQuery,
      (snap) => {
        const uid = auth.currentUser?.uid;
        const sessions: OpenPlaySession[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const participantUids = Array.isArray(d.participantUids)
            ? d.participantUids.map(String)
            : [];
          const participantNames = Array.isArray(d.participantNames)
            ? d.participantNames.map(String)
            : [];
          return {
            id: docSnap.id,
            bookingId: d.bookingId ? String(d.bookingId) : undefined,
            title: String(d.title || 'Sesi Mabar Bandung'),
            sport: (d.sport as SportCategory) || 'Badminton',
            venueId: String(d.venueId || ''),
            courtId: String(d.courtId || ''),
            date: String(d.date || ''),
            hours: Array.isArray(d.hours) ? d.hours.map(Number) : [],
            hostName: String(d.hostName || 'Host'),
            skillLevel: (d.skillLevel as SkillLevel) || 'Menengah',
            maxPlayers: Number(d.maxPlayers ?? 8),
            currentPlayers: Number(d.currentPlayers ?? participantNames.length),
            costPerPerson: Number(d.costPerPerson ?? 25000),
            description: String(d.description || ''),
            participants: participantNames,
            participantUids,
            status: (d.status as 'open' | 'full' | 'closed') || 'open',
            joinedByCurrentUser: Boolean(uid && participantUids.includes(uid)),
          };
        });
        setOpenPlays(sessions.reverse());
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'open_plays');
      }
    );

    const publicReviewsQuery = query(
      collection(db, 'reviews'),
      where('isPublic', '==', true)
    );
    const unsubReviews = onSnapshot(
      publicReviewsQuery,
      (snap) => {
        const list: VenueReview[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            venueId: String(d.venueId || ''),
            bookingId: String(d.bookingId || ''),
            bookingCode: String(d.bookingCode || ''),
            courtName: String(d.courtName || ''),
            reviewerName: String(d.reviewerName || 'Pemain Bandung'),
            rating: Math.min(5, Math.max(1, Number(d.rating || 5))),
            comment: String(d.comment || ''),
            tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
            playedDate: String(d.playedDate || ''),
            createdAtLabel: 'Tersimpan di Cloud',
            persistedToCloud: true,
          };
        });
        setReviews(list.reverse());
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'reviews');
      }
    );

    return () => {
      unsubVenues();
      unsubCourts();
      unsubSlots();
      unsubOpenPlays();
      unsubReviews();
    };
  }, [currentUser?.uid]);

  // Live AUTHENTICATED Firestore subscriptions (Own Bookings, Owned-Venue Bookings, Split Bill Participants)
  useEffect(() => {
    if (!authReady || !currentUser) return;

    const mapBookingDoc = (docSnap: { id: string; data: () => Record<string, unknown> }): Booking => {
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
        status: d.status as Booking['status'],
        createdAt: 'Tersinkronisasi Cloud',
        ownerUid: d.ownerUid ? String(d.ownerUid) : undefined,
        venueOwnerUid: d.venueOwnerUid ? String(d.venueOwnerUid) : undefined,
        checkedInAt: d.checkedInAt ? String(d.checkedInAt) : undefined,
        openPlayId: d.openPlayId ? String(d.openPlayId) : undefined,
        notes: d.notes ? String(d.notes) : undefined,
        persistedToCloud: true,
      };
    };

    const userBookingsQuery = query(
      collection(db, 'bookings'),
      where('ownerUid', '==', currentUser.uid)
    );
    const unsubUserBookings = onSnapshot(
      userBookingsQuery,
      (snap) => {
        setUserBookings(snap.docs.map(mapBookingDoc).reverse());
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      }
    );

    const venueBookingsQuery = query(
      collection(db, 'bookings'),
      where('venueOwnerUid', '==', currentUser.uid)
    );
    const unsubVenueBookings = onSnapshot(
      venueBookingsQuery,
      (snap) => {
        setVenueOwnerBookings(snap.docs.map(mapBookingDoc).reverse());
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      }
    );

    const participantsQuery = query(
      collection(db, 'booking_participants'),
      where('ownerUid', '==', currentUser.uid)
    );
    const unsubParticipants = onSnapshot(
      participantsQuery,
      (snap) => {
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
        setParticipantsByBooking(grouped);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'booking_participants');
      }
    );

    return () => {
      unsubUserBookings();
      unsubVenueBookings();
      unsubParticipants();
    };
  }, [authReady, currentUser]);

  // Live Firestore Lobby Chat stream for the active Open Play session
  useEffect(() => {
    if (!activeChatSessionId || !currentUser) {
      setChatMessages([]);
      return;
    }

    const msgQuery = query(
      collection(db, 'open_plays', activeChatSessionId, 'messages'),
      where('sessionId', '==', activeChatSessionId)
    );

    const unsubMessages = onSnapshot(
      msgQuery,
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            const ts = d.createdAt as { toDate?: () => Date } | undefined;
            const dateObj = ts?.toDate ? ts.toDate() : null;
            return {
              sortMs: dateObj ? dateObj.getTime() : Date.now(),
              msg: {
                id: docSnap.id,
                sessionId: String(d.sessionId || activeChatSessionId),
                sender: String(d.senderName || 'Pemain'),
                text: String(d.text || ''),
                timestamp: dateObj
                  ? dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                  : 'Baru saja',
                isCurrentUser: String(d.senderUid || '') === currentUser.uid && !d.isSystem,
                isSystem: Boolean(d.isSystem),
              } as LobbyChatMessage,
            };
          })
          .sort((a, b) => a.sortMs - b.sortMs)
          .map((x) => x.msg);

        setChatMessages(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `open_plays/${activeChatSessionId}/messages`);
      }
    );

    return () => unsubMessages();
  }, [activeChatSessionId, currentUser]);

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
      setUserBookings([]);
      setVenueOwnerBookings([]);
      setParticipantsByBooking({});
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
    setAuthScreen('login');
  };

  const handleDeleteContentDraft = (draftId: string) => {
    setSavedDrafts((prev) => prev.filter((d) => d.id !== draftId));
    deleteContentDraftFromFirestore(draftId).catch(() => {});
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
    if (!currentUser || !currentUser.emailVerified) {
      setAuthScreen('login');
      return;
    }
    await createVenueReviewToFirestore(payload);
  };

  const userTicketsCount = useMemo(
    () => userBookings.filter((b) => b.status !== 'cancelled').length,
    [userBookings]
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

  // Real Atomic Cloud Firestore Booking Confirmation
  const handleConfirmBooking = async (params: {
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
  }): Promise<{ ok: boolean; error?: string; booking?: Booking }> => {
    if (!currentUser || !currentUser.emailVerified) {
      return {
        ok: false,
        error: 'Masuk dengan akun Google terverifikasi terlebih dahulu agar booking tersimpan resmi di Cloud.',
      };
    }

    const conflict = findConflict(params.courtId, params.date, params.hours);
    if (conflict) {
      const clashHour = params.hours.find((h) => conflict.hours.includes(h)) ?? params.hours[0];
      return {
        ok: false,
        error: `Maaf, jam ${formatSingleHour(clashHour)} WIB sudah dikunci oleh pemesan lain. Pilih slot jam lain yang masih tersedia.`,
      };
    }

    const venue = venues.find((v) => v.id === params.venueId);
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
      createdAt: 'Tersinkronisasi Cloud',
      isUserBooking: true,
      ownerUid: currentUser.uid,
      venueOwnerUid: venue?.ownerUid,
      openPlayId: newOpenPlayId,
      persistedToCloud: true,
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
        participantUids: [currentUser.uid],
        status: 'open',
        joinedByCurrentUser: true,
      };
    }

    const txResult = await createAtomicFirestoreBooking(
      newBooking,
      createdOpenPlay,
      venue?.ownerUid
    );
    if (!txResult.ok) {
      return { ok: false, error: txResult.error };
    }

    // Notify Express REST API for real-time webhook/SSE tracking
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

  // Real Split Bill participant payment confirmation via webhook + Firestore
  const handleMarkParticipantPaid = (bookingId: string, participantId: string) => {
    const targetBooking = bookings.find((b) => b.id === bookingId);
    const participantIndex =
      targetBooking?.splitParticipants?.findIndex((p) => p.id === participantId) ?? 0;
    const participant = targetBooking?.splitParticipants?.[participantIndex];

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

  // Real Transactional Join Open Play (Mabar)
  const handleJoinOpenPlay = async (
    sessionId: string,
    playerName: string,
    paymentMethod: PaymentMethod
  ): Promise<{ ok: boolean; error?: string }> => {
    const target = openPlays.find((s) => s.id === sessionId);
    if (!target) return { ok: false, error: 'Sesi Open Play tidak ditemukan.' };
    return joinOpenPlayInFirestore(target, playerName, paymentMethod);
  };

  // Real Firestore Lobby Chat message (no fake bot replies)
  const handleSendChatMessage = (sessionId: string, text: string) => {
    if (!currentUser || !currentUser.emailVerified) {
      setAuthScreen('login');
      return;
    }
    const displayName = userProfile?.displayName || currentUser.displayName || 'Pemain';
    persistLobbyMessage(sessionId, displayName, text).catch(() => {});
  };

  // Real B2B Manual Walk-In / Member Booking persisted atomically to Firestore
  const handleAddManualBooking = async (params: {
    venueId: string;
    courtId: string;
    date: string;
    hours: number[];
    customerName: string;
    customerPhone: string;
    source: BookingSource;
    totalPrice: number;
    notes?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || !currentUser.emailVerified) {
      return {
        ok: false,
        error: 'Masuk dengan akun Mitra GOR terlebih dahulu untuk menyimpan jadwal ke Cloud.',
      };
    }

    const conflict = findConflict(params.courtId, params.date, params.hours);
    if (conflict) {
      return {
        ok: false,
        error: `Konflik jadwal terdeteksi dengan ${conflict.customerName} (${conflict.bookingCode}).`,
      };
    }

    const venue = venues.find((v) => v.id === params.venueId);
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
      ownerUid: currentUser.uid,
      venueOwnerUid: venue?.ownerUid ?? currentUser.uid,
      notes: params.notes,
      persistedToCloud: true,
    };

    const txResult = await createAtomicFirestoreBooking(
      newBooking,
      undefined,
      venue?.ownerUid
    );
    if (!txResult.ok) {
      return { ok: false, error: txResult.error };
    }

    fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBooking),
    }).catch(() => {});

    return { ok: true };
  };

  // Real Firestore cancellation + atomic slot lock release
  const handleCancelBooking = async (bookingId: string) => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return;
    await cancelBookingInFirestore(target);
  };

  // Real Firestore Cashier Check-In
  const handleCheckInBooking = async (bookingId: string) => {
    return checkInBookingInFirestore(bookingId);
  };

  const handleUpdatePricingRule = (venueId: string, nextRule: DynamicPricingRule) => {
    setPricingRules((prev) => ({
      ...prev,
      [venueId]: nextRule,
    }));
    const venue = venues.find((v) => v.id === venueId);
    if (venue) {
      persistVenueDynamicPricing(venue, nextRule).catch(() => {});
    }
  };

  const handleDeleteVenue = async (venueId: string) => {
    return deleteVenueWithCourtsInFirestore(venueId);
  };

  const handleClearAllVenues = async () => {
    return deleteAllVenuesInFirestore();
  };

  const activeChatSession = openPlays.find((s) => s.id === activeChatSessionId) ?? null;
  const activeChatVenue = activeChatSession
    ? venues.find((v) => v.id === activeChatSession.venueId) ?? null
    : null;

  const isVerifiedSignedIn = Boolean(currentUser && currentUser.emailVerified);
  const isAdmin = Boolean(isVerifiedSignedIn && currentUser?.email === 'winawiwid84@gmail.com');

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Mandatory Google Maps Platform Quota Banner */}
      {gmpQuotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs flex items-center justify-between gap-3 print:hidden"
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
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 sm:pt-8 print:max-w-none print:px-0 print:pt-0">
          {mode === 'B2C' ? (
            <>
              {b2cTab === 'explore' && (
                <B2CVenueExplorer
                  venues={venues}
                  bookings={bookings}
                  reviews={reviews}
                  pricingRules={pricingRules}
                  onProceedToBooking={(payload) => setPendingSlotSelection(payload)}
                  onJumpToMabar={() => setB2CTab('mabar')}
                  onOpen3DViewer={(sport) => setViewer3DSport(sport)}
                  onGoToTicketsForReview={() => setB2CTab('tickets')}
                  onOpenPartnerOnboarding={() => setAddVenueOpen(true)}
                  onOpenProposal={() => {
                    setMode('B2B');
                    setB2BTab('proposal');
                  }}
                  openPlayCount={openPlays.length}
                />
              )}

              {b2cTab === 'mabar' && (
                <OpenPlayFeed
                  sessions={openPlays}
                  venues={venues}
                  isSignedIn={isVerifiedSignedIn}
                  defaultPlayerName={userProfile?.displayName || currentUser?.displayName || undefined}
                  onPromptLogin={() => setAuthScreen('login')}
                  onJoinSession={handleJoinOpenPlay}
                  onOpenChat={(id) => {
                    if (!isVerifiedSignedIn) {
                      setAuthScreen('login');
                      return;
                    }
                    setActiveChatSessionId(id);
                  }}
                  onCreateFromExplore={() => setB2CTab('explore')}
                />
              )}

              {b2cTab === 'studio' && (
                <AIContentStudio
                  mode="B2C"
                  venues={venues}
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
                  venues={venues}
                  reviews={reviews}
                  isSignedIn={isVerifiedSignedIn}
                  onPromptLogin={() => setAuthScreen('login')}
                  onMarkParticipantPaid={handleMarkParticipantPaid}
                  onOpenMabarChat={(id) => setActiveChatSessionId(id)}
                  onOpenReview={(booking, venue) => setReviewTarget({ booking, venue })}
                  onCancelBooking={handleCancelBooking}
                  onExploreClick={() => setB2CTab('explore')}
                />
              )}
            </>
          ) : b2bTab === 'studio' ? (
            <AIContentStudio
              mode="B2B"
              venues={venues}
              savedDrafts={savedDrafts}
              isSignedIn={Boolean(currentUser)}
              onSaveDraft={handleSaveContentDraft}
              onDeleteDraft={handleDeleteContentDraft}
              onPromptLogin={() => setAuthScreen('login')}
            />
          ) : b2bTab === 'proposal' ? (
            <MitraProposalPage
              venues={venues}
              onRegisterMitra={() => setAuthScreen('register')}
              onGoToCalendar={() => setB2BTab('calendar')}
            />
          ) : (
            <B2BOwnerDashboard
              venues={venues}
              bookings={bookings}
              reviews={reviews}
              pricingRules={pricingRules}
              activeTab={b2bTab}
              onTabChange={setB2BTab}
              isSignedIn={isVerifiedSignedIn}
              currentUserUid={currentUser?.uid}
              isAdmin={isAdmin}
              onPromptLogin={() => setAuthScreen('login')}
              onOpenAddVenue={() => setAddVenueOpen(true)}
              onDeleteVenue={handleDeleteVenue}
              onClearAllVenues={handleClearAllVenues}
              onAddManualBooking={handleAddManualBooking}
              onCancelBooking={handleCancelBooking}
              onCheckInBooking={handleCheckInBooking}
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
      <footer className="border-t border-slate-200 bg-white mt-auto print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p className="font-medium text-slate-700">
            CourtSync (MainBareng) · Ekosistem Booking &amp; Komunitas Olahraga Bandung
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
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
            <button
              type="button"
              onClick={() => {
                setAuthScreen('none');
                setMode('B2B');
                setB2BTab('proposal');
              }}
              className="font-semibold text-amber-700 hover:text-amber-800 transition-colors"
            >
              Proposal Mitra GOR
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
          isSignedIn={isVerifiedSignedIn}
          defaultName={userProfile?.displayName || currentUser?.displayName || undefined}
          defaultPhone={userProfile?.phone || undefined}
          onPromptLogin={() => {
            setPendingSlotSelection(null);
            setAuthScreen('login');
          }}
          onClose={() => setPendingSlotSelection(null)}
          onConfirmBooking={handleConfirmBooking}
          onMarkParticipantPaid={handleMarkParticipantPaid}
          onOpenMabarChat={(id) => setActiveChatSessionId(id)}
          onGoToTickets={() => setB2CTab('tickets')}
        />
      )}

      {/* Mitra GOR Real Venue Onboarding Modal */}
      {addVenueOpen && (
        <AddVenueModal
          isSignedIn={isVerifiedSignedIn}
          onPromptLogin={() => {
            setAddVenueOpen(false);
            setAuthScreen('login');
          }}
          onClose={() => setAddVenueOpen(false)}
          onVenueCreated={() => {
            setMode('B2B');
            setB2BTab('calendar');
          }}
        />
      )}

      {/* Real-Time Cloud Lobby Chat Drawer */}
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
          isSignedIn={isVerifiedSignedIn}
          onClose={() => setReviewTarget(null)}
          onSubmitReview={handleSubmitVenueReview}
        />
      )}

      {/* Three.js 3D Interactive Venue Court Viewer */}
      {viewer3DSport && (
        <Venue3DViewerModal
          initialSport={viewer3DSport}
          venues={venues}
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
