import { DynamicPricingRule } from '../types/courtsync';

export const OPERATING_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DAY_NAMES_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatIDR(amount: number): string {
  const rounded = Math.round(amount);
  return 'Rp ' + rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatHourRange(hours: number[]): string {
  if (!hours.length) return '-';
  const sorted = [...hours].sort((a, b) => a - b);
  const start = sorted[0];
  const end = sorted[sorted.length - 1] + 1;
  return `${String(start).padStart(2, '0')}:00 - ${String(end).padStart(2, '0')}:00`;
}

export function formatSingleHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function getNext7Days(): {
  iso: string;
  dayShort: string;
  dayFull: string;
  dateNum: string;
  monthShort: string;
  dayOfWeek: number;
  isToday: boolean;
}[] {
  const base = new Date();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push({
      iso: `${yyyy}-${mm}-${dd}`,
      dayShort: DAY_NAMES_SHORT[d.getDay()],
      dayFull: DAY_NAMES_FULL[d.getDay()],
      dateNum: String(d.getDate()),
      monthShort: MONTH_NAMES_SHORT[d.getMonth()],
      dayOfWeek: d.getDay(),
      isToday: i === 0,
    });
  }
  return days;
}

export function formatDateIndo(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return isoDate;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return `${DAY_NAMES_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function getDayOfWeekFromIso(isoDate: string): number {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return 1;
  return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
}

export function calculateSlotPrice(
  basePrice: number,
  isoDate: string,
  hour: number,
  rule?: DynamicPricingRule
): { finalPrice: number; isPromo: boolean; discountPercent: number; promoLabel?: string } {
  if (!rule || !rule.enabled || rule.discountPercent <= 0) {
    return { finalPrice: basePrice, isPromo: false, discountPercent: 0 };
  }
  const dayOfWeek = getDayOfWeekFromIso(isoDate);
  const inDays = rule.days.includes(dayOfWeek);
  const inHours = hour >= rule.startHour && hour < rule.endHour;

  if (inDays && inHours) {
    const discounted = Math.round((basePrice * (100 - rule.discountPercent)) / 100 / 1000) * 1000;
    return {
      finalPrice: discounted,
      isPromo: true,
      discountPercent: rule.discountPercent,
      promoLabel: rule.label,
    };
  }
  return { finalPrice: basePrice, isPromo: false, discountPercent: 0 };
}

export function generateBookingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CS-BDG-${suffix}`;
}

export function generateQrMatrix(seed: string, size = 21): boolean[][] {
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[r0 + r][c0 + c] = isBorder || isCenter;
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Deterministic hash from seed string
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const isReserved = (r: number, c: number) => {
    if (r < 8 && c < 8) return true;
    if (r < 8 && c >= size - 8) return true;
    if (r >= size - 8 && c < 8) return true;
    if (r === 6 || c === 6) return true;
    return false;
  };

  let state = hash >>> 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isReserved(r, c)) continue;
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      matrix[r][c] = ((state >>> 24) & 1) === 1 || ((r * 7 + c * 13 + seed.length) % 5 === 0);
    }
  }

  return matrix;
}
