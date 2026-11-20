import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AppMode,
  Booking,
  DynamicPricingRule,
  GeneratedContentPackage,
  OpenPlaySession,
  SavedContentDraft,
  SkillLevel,
  SplitParticipant,
  SportCategory,
  UserProfile,
  UserRole,
  Venue,
  VenueReview,
  VideoScene,
} from '../types/courtsync';
import { BANDUNG_VENUES, INITIAL_DYNAMIC_PRICING } from '../data/mockBandungData';

const ADMIN_EMAIL = 'winawiwid84@gmail.com';

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: String(d.uid),
      displayName: String(d.displayName),
      email: String(d.email),
      phone: d.phone ? String(d.phone) : undefined,
      accountType: d.accountType === 'mitra_gor' ? 'mitra_gor' : 'player',
      verifiedMitra: Boolean(d.verifiedMitra),
      favoriteSport: d.favoriteSport as SportCategory | undefined,
      skillLevel: d.skillLevel as SkillLevel | undefined,
      venueName: d.venueName ? String(d.venueName) : undefined,
      venueArea: d.venueArea ? String(d.venueArea) : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
}

export async function saveUserProfile(params: {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  accountType: UserRole;
  favoriteSport?: SportCategory;
  skillLevel?: SkillLevel;
  venueName?: string;
  venueArea?: string;
}): Promise<UserProfile> {
  const userRef = doc(db, 'users', params.uid);
  const existing = await getDoc(userRef);
  const isBootstrappedAdmin = params.email === ADMIN_EMAIL;

  const cleanName = params.displayName.trim().slice(0, 100) || 'Pengguna CourtSync';
  const cleanPhone = params.phone?.trim().slice(0, 30);
  const cleanVenueName = params.venueName?.trim().slice(0, 120);
  const cleanVenueArea = params.venueArea?.trim().slice(0, 80);

  try {
    if (!existing.exists()) {
      const payload: Record<string, unknown> = {
        uid: params.uid,
        displayName: cleanName.length >= 2 ? cleanName : 'Pemain CourtSync',
        email: params.email.slice(0, 120),
        accountType: params.accountType,
        verifiedMitra: isBootstrappedAdmin && params.accountType === 'mitra_gor',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanPhone) payload.phone = cleanPhone;
      if (params.favoriteSport) payload.favoriteSport = params.favoriteSport;
      if (params.skillLevel) payload.skillLevel = params.skillLevel;
      if (cleanVenueName) payload.venueName = cleanVenueName;
      if (cleanVenueArea) payload.venueArea = cleanVenueArea;

      await setDoc(userRef, payload);
      return {
        uid: params.uid,
        displayName: String(payload.displayName),
        email: params.email,
        phone: cleanPhone,
        accountType: params.accountType,
        verifiedMitra: Boolean(payload.verifiedMitra),
        favoriteSport: params.favoriteSport,
        skillLevel: params.skillLevel,
        venueName: cleanVenueName,
        venueArea: cleanVenueArea,
      };
    } else {
      const existingData = existing.data();
      const updatePayload: Record<string, unknown> = {
        displayName: cleanName.length >= 2 ? cleanName : String(existingData.displayName),
        accountType: params.accountType,
        updatedAt: serverTimestamp(),
      };
      if (cleanPhone) updatePayload.phone = cleanPhone;
      if (params.favoriteSport) updatePayload.favoriteSport = params.favoriteSport;
      if (params.skillLevel) updatePayload.skillLevel = params.skillLevel;
      if (cleanVenueName) updatePayload.venueName = cleanVenueName;
      if (cleanVenueArea) updatePayload.venueArea = cleanVenueArea;

      await updateDoc(userRef, updatePayload);
      return {
        uid: params.uid,
        displayName: String(updatePayload.displayName),
        email: String(existingData.email),
        phone: cleanPhone ?? (existingData.phone ? String(existingData.phone) : undefined),
        accountType: params.accountType,
        verifiedMitra: Boolean(existingData.verifiedMitra),
        favoriteSport: params.favoriteSport ?? (existingData.favoriteSport as SportCategory | undefined),
        skillLevel: params.skillLevel ?? (existingData.skillLevel as SkillLevel | undefined),
        venueName: cleanVenueName ?? (existingData.venueName ? String(existingData.venueName) : undefined),
        venueArea: cleanVenueArea ?? (existingData.venueArea ? String(existingData.venueArea) : undefined),
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${params.uid}`);
  }
}

/**
 * Seeds the 4 Bandung flagship venues & courts into Firestore if empty (admin only).
 */
export async function ensureVenuesSeeded(): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  try {
    const snap = await getDocs(
      query(collection(db, 'venues'), where('isPublic', '==', true))
    );
    if (!snap.empty) return;

    const batch = writeBatch(db);
    for (const venue of BANDUNG_VENUES) {
      const rule = INITIAL_DYNAMIC_PRICING[venue.id];
      batch.set(doc(db, 'venues', venue.id), {
        name: venue.name,
        sport: venue.sport,
        area: venue.area,
        address: venue.address,
        rating: venue.rating,
        reviewCount: venue.reviewCount,
        imageUrl: venue.imageUrl,
        openHour: venue.openHour,
        closeHour: venue.closeHour,
        facilities: venue.facilities.slice(0, 12),
        bankAccount: venue.bankAccount,
        pricingEnabled: rule?.enabled ?? true,
        pricingDays: rule?.days ?? [1, 2, 3, 4, 5],
        pricingStartHour: rule?.startHour ?? 9,
        pricingEndHour: rule?.endHour ?? 15,
        pricingDiscountPercent: rule?.discountPercent ?? 20,
        pricingLabel: rule?.label ?? 'Promo Off-Peak Siang',
        isPublic: true,
        updatedAt: serverTimestamp(),
      });

      for (const court of venue.courts) {
        batch.set(doc(db, 'courts', court.id), {
          venueId: venue.id,
          name: court.name,
          surface: court.surface,
          indoor: court.indoor,
          basePricePerHour: court.basePricePerHour,
          isPublic: true,
        });
      }
    }
    await batch.commit();
  } catch (error) {
    // Non-admins simply read public venues; swallow expected permission denied on seed attempt
    if (error instanceof Error && error.message.includes('permission')) {
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, 'venues');
  }
}

/**
 * Persists a booking atomically into Firestore using a transaction on `booking_slots/{courtId}_{date}_{hour}`
 * to mathematically prevent concurrent double-booking.
 */
export async function createAtomicFirestoreBooking(
  booking: Booking,
  openPlay?: OpenPlaySession
): Promise<{ ok: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { ok: true };
  }

  try {
    await runTransaction(db, async (tx) => {
      // 1. Verify every requested slot lock does not already exist
      for (const hour of booking.hours) {
        const slotId = `${booking.courtId}_${booking.date}_${hour}`;
        const slotRef = doc(db, 'booking_slots', slotId);
        const existingSlot = await tx.get(slotRef);
        if (existingSlot.exists()) {
          throw new Error(`CONFLICT:${hour}`);
        }
      }

      // 2. Write parent booking document
      const bookingRef = doc(db, 'bookings', booking.id);
      const bookingPayload: Record<string, unknown> = {
        bookingCode: booking.bookingCode,
        venueId: booking.venueId,
        courtId: booking.courtId,
        date: booking.date,
        hours: booking.hours.slice(0, 6),
        customerName: booking.customerName.slice(0, 100),
        customerPhone: booking.customerPhone.slice(0, 30),
        source: booking.source,
        paymentMethod: booking.paymentMethod,
        totalPrice: Math.round(booking.totalPrice),
        discountApplied: Math.round(booking.discountApplied),
        paymentMode: booking.paymentMode,
        status: booking.status,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (booking.splitLink) bookingPayload.splitLink = booking.splitLink.slice(0, 200);
      if (booking.openPlayId) bookingPayload.openPlayId = booking.openPlayId.slice(0, 128);
      if (booking.notes) bookingPayload.notes = booking.notes.slice(0, 300);

      tx.set(bookingRef, bookingPayload);

      // 3. Write atomic lock docs in booking_slots
      for (const hour of booking.hours) {
        const slotId = `${booking.courtId}_${booking.date}_${hour}`;
        tx.set(doc(db, 'booking_slots', slotId), {
          venueId: booking.venueId,
          courtId: booking.courtId,
          date: booking.date,
          hour,
          bookingId: booking.id,
          source: booking.source,
          ownerUid: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      // 4. Write Split Bill participant rows if applicable
      if (booking.paymentMode === 'split' && booking.splitParticipants) {
        booking.splitParticipants.forEach((p: SplitParticipant, idx: number) => {
          const participantDocId = `${booking.id}_${p.id || `p${idx}`}`;
          const partPayload: Record<string, unknown> = {
            bookingId: booking.id,
            ownerUid: user.uid,
            name: p.name.slice(0, 100),
            amount: Math.round(p.amount),
            paid: Boolean(p.paid),
            isHost: Boolean(p.isHost),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (p.paidAt) partPayload.paidAt = p.paidAt.slice(0, 64);
          tx.set(doc(db, 'booking_participants', participantDocId), partPayload);
        });
      }

      // 5. Publish Open Play room if toggled
      if (openPlay) {
        tx.set(doc(db, 'open_plays', openPlay.id), {
          bookingId: booking.id,
          title: openPlay.title.slice(0, 140),
          sport: openPlay.sport,
          venueId: openPlay.venueId,
          courtId: openPlay.courtId,
          date: openPlay.date,
          hours: openPlay.hours.slice(0, 6),
          hostName: openPlay.hostName.slice(0, 80),
          ownerUid: user.uid,
          skillLevel: openPlay.skillLevel,
          maxPlayers: openPlay.maxPlayers,
          currentPlayers: 1,
          costPerPerson: Math.round(openPlay.costPerPerson),
          description: openPlay.description.slice(0, 400),
          participantUids: [user.uid],
          participantNames: [openPlay.hostName.slice(0, 80)],
          status: 'open',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('CONFLICT:')) {
      const hour = error.message.split(':')[1];
      return {
        ok: false,
        error: `Konflik jadwal terdeteksi di jam ${String(hour).padStart(2, '0')}:00 WIB — sudah terkunci di database.`,
      };
    }
    handleFirestoreError(error, OperationType.WRITE, `bookings/${booking.id}`);
  }
}

/**
 * Fires the Express Midtrans/Xendit payment webhook endpoint AND updates the participant record in Firestore.
 */
export async function triggerSplitBillPaymentWebhook(params: {
  bookingId: string;
  bookingCode: string;
  participantId: string;
  participantIndex: number;
  amount: number;
  gateway?: 'midtrans' | 'xendit';
}): Promise<void> {
  const gatewayOrderId = `${params.bookingCode}-P${params.participantIndex + 1}`;
  const gateway = params.gateway ?? 'midtrans';

  // 1. Trigger real Express POST /api/webhooks/payment endpoint
  try {
    const body =
      gateway === 'xendit'
        ? {
            id: `xnd_${Date.now()}`,
            external_id: gatewayOrderId,
            status: 'PAID',
            amount: params.amount,
          }
        : {
            order_id: gatewayOrderId,
            status_code: '200',
            gross_amount: `${params.amount}.00`,
            transaction_status: 'settlement',
            transaction_id: `mdt_${Date.now()}`,
          };

    await fetch('/api/webhooks/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Keep client UX resilient even if webhook route is offline
  }

  // 2. Persist real-time Split Bill status to Firestore when signed in
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docId = `${params.bookingId}_${params.participantId}`;
  const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  try {
    await updateDoc(doc(db, 'booking_participants', docId), {
      paid: true,
      paidAt: nowTime,
      paymentRef: `${gateway.toUpperCase()}-${gatewayOrderId}`,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // If participant belongs to an initial local seed booking not yet in Firestore, ignore safely
    if (error instanceof Error && error.message.includes('No document to update')) {
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, `booking_participants/${docId}`);
  }
}

/**
 * Updates Dynamic Pricing rules in Firestore (Mitra GOR admin only).
 */
export async function persistVenueDynamicPricing(
  venue: Venue,
  rule: DynamicPricingRule
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  try {
    await updateDoc(doc(db, 'venues', venue.id), {
      pricingEnabled: rule.enabled,
      pricingDays: rule.days.slice(0, 7),
      pricingStartHour: rule.startHour,
      pricingEndHour: rule.endHour,
      pricingDiscountPercent: rule.discountPercent,
      pricingLabel: rule.label.slice(0, 80),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Allow non-admin preview testing without interrupting B2B dashboard simulation
  }
}

/**
 * Sends a Lobby Chat message to Firestore subcollection when signed in.
 */
export async function persistLobbyMessage(
  sessionId: string,
  senderName: string,
  text: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const messageId = `msg-${Date.now()}`;
  try {
    await setDoc(doc(db, 'open_plays', sessionId, 'messages', messageId), {
      sessionId,
      senderUid: user.uid,
      senderName: senderName.slice(0, 80),
      text: text.slice(0, 500),
      isSystem: false,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Local mock rooms not yet created in Firestore remain functional in preview
  }
}

/**
 * Persists an AI Content Agent output draft (text & storyboard metadata only) to Firestore.
 */
export async function saveContentDraftToFirestore(params: {
  roleMode: AppMode;
  venueId?: string;
  platform: string;
  tone: string;
  prompt: string;
  mediaType: 'none' | 'image' | 'video';
  mediaFileName?: string;
  content: GeneratedContentPackage;
}): Promise<SavedContentDraft | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;

  const draftId = `draft-${Date.now()}`;
  const videoScriptJson = JSON.stringify(params.content.videoScript || []).slice(0, 8000);
  const hashtags = (params.content.hashtags || [])
    .filter((h) => typeof h === 'string' && h.trim().length > 0)
    .slice(0, 20);
  const visualTips = (params.content.visualTips || [])
    .filter((t) => typeof t === 'string' && t.trim().length > 0)
    .slice(0, 10);

  const payload: Record<string, unknown> = {
    ownerUid: user.uid,
    roleMode: params.roleMode,
    platform: params.platform.slice(0, 60) || 'Instagram Reels',
    tone: params.tone.slice(0, 60) || 'Energik & Sporty',
    prompt: (params.prompt.trim() || 'Konten dari media unggahan').slice(0, 1000),
    mediaType: params.mediaType,
    title: (params.content.title || 'Konten CourtSync').slice(0, 200),
    hook: (params.content.hook || 'Yuk main bareng!').slice(0, 500),
    caption: (params.content.caption || 'Caption konten olahraga Bandung').slice(0, 3500),
    hashtags,
    createdAt: serverTimestamp(),
  };

  if (params.venueId) payload.venueId = params.venueId.slice(0, 128);
  if (params.mediaFileName) payload.mediaFileName = params.mediaFileName.slice(0, 180);
  if (params.content.whatsappBroadcast) {
    payload.whatsappBroadcast = params.content.whatsappBroadcast.slice(0, 2000);
  }
  if (params.content.cta) payload.cta = params.content.cta.slice(0, 400);
  if (params.content.mediaAnalysis) {
    payload.mediaAnalysis = params.content.mediaAnalysis.slice(0, 1500);
  }
  if (params.content.bestPostingTime) {
    payload.bestPostingTime = params.content.bestPostingTime.slice(0, 300);
  }
  if (visualTips.length > 0) payload.visualTips = visualTips;
  if (videoScriptJson.length > 2) payload.videoScriptJson = videoScriptJson;

  try {
    await setDoc(doc(db, 'content_drafts', draftId), payload);
    return {
      id: draftId,
      roleMode: params.roleMode,
      venueId: params.venueId,
      platform: String(payload.platform),
      tone: String(payload.tone),
      prompt: String(payload.prompt),
      mediaType: params.mediaType,
      mediaFileName: params.mediaFileName,
      content: params.content,
      createdAtLabel: 'Baru saja (Cloud)',
      persistedToCloud: true,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `content_drafts/${draftId}`);
  }
}

export async function fetchUserContentDrafts(uid: string): Promise<SavedContentDraft[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'content_drafts'), where('ownerUid', '==', uid))
    );
    return snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        let parsedScript: VideoScene[] = [];
        if (typeof d.videoScriptJson === 'string') {
          try {
            parsedScript = JSON.parse(d.videoScriptJson) as VideoScene[];
          } catch {
            parsedScript = [];
          }
        }
        return {
          id: docSnap.id,
          roleMode: (d.roleMode === 'B2B' ? 'B2B' : 'B2C') as AppMode,
          venueId: d.venueId ? String(d.venueId) : undefined,
          platform: String(d.platform || 'Instagram Reels'),
          tone: String(d.tone || 'Energik & Sporty'),
          prompt: String(d.prompt || ''),
          mediaType: (d.mediaType === 'image' || d.mediaType === 'video' ? d.mediaType : 'none') as
            | 'none'
            | 'image'
            | 'video',
          mediaFileName: d.mediaFileName ? String(d.mediaFileName) : undefined,
          content: {
            title: String(d.title || ''),
            platform: String(d.platform || 'Instagram Reels'),
            contentGoal: d.roleMode === 'B2B' ? 'Promosi Mitra GOR' : 'Konten Komunitas Mabar',
            mediaAnalysis: String(d.mediaAnalysis || ''),
            hook: String(d.hook || ''),
            caption: String(d.caption || ''),
            videoScript: parsedScript,
            whatsappBroadcast: String(d.whatsappBroadcast || ''),
            cta: String(d.cta || ''),
            hashtags: Array.isArray(d.hashtags) ? d.hashtags.map(String) : [],
            bestPostingTime: String(d.bestPostingTime || ''),
            visualTips: Array.isArray(d.visualTips) ? d.visualTips.map(String) : [],
          },
          createdAtLabel: 'Tersimpan di Cloud',
          persistedToCloud: true,
        };
      })
      .reverse();
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'content_drafts');
  }
}

export async function deleteContentDraftFromFirestore(draftId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  try {
    await deleteDoc(doc(db, 'content_drafts', draftId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `content_drafts/${draftId}`);
  }
}

/**
 * Persists a post-booking player review & 1-5 star rating to Firestore `/reviews/{reviewId}`.
 */
export async function createVenueReviewToFirestore(params: {
  venueId: string;
  bookingId: string;
  bookingCode: string;
  courtName: string;
  reviewerName: string;
  rating: number;
  comment: string;
  tags: string[];
  playedDate: string;
}): Promise<VenueReview | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;

  const cleanRating = Math.min(5, Math.max(1, Math.round(params.rating)));
  const cleanTags = params.tags
    .filter((t) => typeof t === 'string' && t.trim().length > 0)
    .slice(0, 8);
  const reviewId = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const payload = {
    venueId: params.venueId.slice(0, 128),
    bookingId: params.bookingId.slice(0, 128),
    bookingCode: params.bookingCode.slice(0, 32),
    courtName: params.courtName.slice(0, 100),
    ownerUid: user.uid,
    reviewerName: (params.reviewerName.trim() || 'Pemain CourtSync').slice(0, 100),
    rating: cleanRating,
    comment: params.comment.trim().slice(0, 600),
    tags: cleanTags,
    playedDate: params.playedDate.slice(0, 10),
    isPublic: true,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'reviews', reviewId), payload);
    return {
      id: reviewId,
      venueId: payload.venueId,
      bookingId: payload.bookingId,
      bookingCode: payload.bookingCode,
      courtName: payload.courtName,
      reviewerName: payload.reviewerName,
      rating: cleanRating,
      comment: payload.comment,
      tags: cleanTags,
      playedDate: payload.playedDate,
      createdAtLabel: 'Baru saja (Cloud)',
      persistedToCloud: true,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reviews/${reviewId}`);
  }
}

/**
 * Loads public Bandung venue reviews from Firestore `/reviews`.
 */
export async function fetchPublicVenueReviews(): Promise<VenueReview[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'reviews'), where('isPublic', '==', true))
    );
    return snap.docs
      .map((docSnap) => {
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
      })
      .reverse();
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reviews');
  }
}

