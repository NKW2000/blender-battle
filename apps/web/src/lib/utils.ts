import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges conditional classes and resolves Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * The locale every date, time and number is formatted in.
 *
 * Pinned rather than left to the device. Passing `undefined` hands formatting to
 * the operating system's language, so a phone set to Arabic rendered Arabic
 * month names and digits inside an interface written entirely in English —
 * half-translated, and in the date picker it changed the calendar's numerals
 * while the surrounding labels stayed put.
 *
 * This fixes the *language* only. Every value is still converted through the
 * device's own timezone, which is the part that has to stay local.
 */
export const UI_LOCALE = 'en-US';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(UI_LOCALE).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(UI_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}
