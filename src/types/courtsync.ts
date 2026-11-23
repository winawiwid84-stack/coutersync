export type SportCategory = 'Badminton' | 'Futsal' | 'Mini Soccer' | 'Padel';

export type SkillLevel = 'Pemula' | 'Menengah' | 'Mahir';

export type AppMode = 'B2C' | 'B2B';

export type UserRole = 'player' | 'mitra_gor';

export type AuthScreen = 'none' | 'login' | 'register';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  accountType: UserRole;
  verifiedMitra: boolean;
  favoriteSport?: string;
  skillLevel?: SkillLevel;
  venueName?: string;
  venueArea?: string;
}

export type B2CTab = 'explore' | 'mabar' | 'studio' | 'tickets';

export type B2BTab = 'calendar' | 'pricing' | 'reviews' | 'studio' | 'proposal' | 'revenue';

export type ContentPlatform =
  | 'Instagram Reels'
  | 'TikTok'
  | 'Instagram Feed'
  | 'WhatsApp Broadcast';

export type ContentTone =
  | 'Energik & Sporty'
  | 'Santai Khas Bandung'
  | 'Profesional Promo GOR'
  | 'Hype Kompetitif';

export interface AgentStepLog {
  id: string;
  phase: 'media' | 'tool' | 'reasoning' | 'synthesis' | 'done';
  title: string;
  detail: string;
  toolName?: string;
  timestamp: string;
}

export interface VideoScene {
  timecode: string;
  visual: string;
  voiceover: string;
  onScreenText: string;
}

export interface GeneratedContentPackage {
  title: string;
  platform: string;
  contentGoal: string;
  mediaAnalysis: string;
  hook: string;
  caption: string;
  videoScript: VideoScene[];
  whatsappBroadcast: string;
  cta: string;
  hashtags: string[];
  bestPostingTime: string;
  visualTips: string[];
}

export interface SavedContentDraft {
  id: string;
  roleMode: AppMode;
  venueId?: string;
  platform: string;
  tone: string;
  prompt: string;
  mediaType: 'none' | 'image' | 'video';
  mediaFileName?: string;
  content: GeneratedContentPackage;
  createdAtLabel: string;
  persistedToCloud?: boolean;
}

export type BookingSource = 'online' | 'member' | 'walkin';

export type PaymentMethod = 'QRIS' | 'VA_BCA' | 'VA_MANDIRI' | 'VA_BNI' | 'KASIR_TUNAI';

export interface Court {
  id: string;
  venueId: string;
  name: string;
  surface: string;
  indoor: boolean;
  basePricePerHour: number; // in IDR
  ownerUid?: string;
}

export interface Venue {
  id: string;
  name: string;
  sport: SportCategory;
  area: string; // e.g., Cikutra, Buah Batu, Dago Atas, Pasteur, Cihampelas
  address: string;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  openHour: number; // 8
  closeHour: number; // 22
  facilities: string[];
  courts: Court[];
  bankAccount: string;
  ownerUid?: string;
}

export interface SplitParticipant {
  id: string;
  name: string;
  amount: number;
  paid: boolean;
  paidAt?: string;
  isHost?: boolean;
}

export interface Booking {
  id: string;
  bookingCode: string;
  venueId: string;
  courtId: string;
  date: string; // YYYY-MM-DD
  hours: number[]; // e.g., [18, 19] meaning 18:00-20:00
  customerName: string;
  customerPhone: string;
  source: BookingSource;
  paymentMethod: PaymentMethod;
  totalPrice: number;
  discountApplied: number;
  paymentMode: 'full' | 'split';
  splitLink?: string;
  splitParticipants?: SplitParticipant[];
  status: 'confirmed' | 'pending_split' | 'cancelled';
  createdAt: string;
  isUserBooking?: boolean;
  openPlayId?: string;
  notes?: string;
  ownerUid?: string;
  venueOwnerUid?: string;
  checkedInAt?: string;
  persistedToCloud?: boolean;
}

export interface BookingSlotLock {
  id: string;
  venueId: string;
  courtId: string;
  date: string;
  hour: number;
  bookingId: string;
  source: BookingSource;
  ownerUid: string;
}

export interface OpenPlaySession {
  id: string;
  bookingId?: string;
  title: string;
  sport: SportCategory;
  venueId: string;
  courtId: string;
  date: string; // YYYY-MM-DD
  hours: number[];
  hostName: string;
  skillLevel: SkillLevel;
  maxPlayers: number;
  currentPlayers: number;
  costPerPerson: number;
  description: string;
  participants: string[];
  participantUids?: string[];
  status?: 'open' | 'full' | 'closed';
  joinedByCurrentUser: boolean;
}

export interface LobbyChatMessage {
  id: string;
  sessionId: string;
  sender: string;
  text: string;
  timestamp: string;
  isCurrentUser?: boolean;
  isSystem?: boolean;
}

export interface DynamicPricingRule {
  venueId: string;
  enabled: boolean;
  days: number[]; // 1 = Mon ... 5 = Fri, 6 = Sat, 0 = Sun
  startHour: number; // e.g., 9
  endHour: number; // e.g., 15 (inclusive of slot starting at 14, i.e., 09:00-15:00)
  discountPercent: number; // e.g., 25
  label: string;
}

export interface VenueReview {
  id: string;
  venueId: string;
  bookingId: string;
  bookingCode: string;
  courtName: string;
  reviewerName: string;
  rating: number; // 1 to 5
  comment: string;
  tags: string[];
  playedDate: string; // YYYY-MM-DD
  createdAtLabel: string;
  persistedToCloud?: boolean;
}

export interface ChatbotMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
}

