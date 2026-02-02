// lib/utils.ts

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Kid } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a short session ID (6 characters, URL-safe)
 */
export function generateSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a long edit key (32 characters, URL-safe)
 */
export function generateEditKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate session name from kid names
 * Examples:
 * - [] -> "Playdate"
 * - ["Emma"] -> "Emma"
 * - ["Emma", "Liam"] -> "Emma & Liam"
 * - ["Emma", "Liam", "Sofia"] -> "Emma, Liam & Sofia"
 */
export function generateSessionName(kids: Kid[]): string {
  if (kids.length === 0) return "Playdate";
  if (kids.length === 1) return kids[0].name;
  if (kids.length === 2) return `${kids[0].name} & ${kids[1].name}`;
  
  const allButLast = kids.slice(0, -1).map(k => k.name).join(', ');
  const last = kids[kids.length - 1].name;
  return `${allButLast} & ${last}`;
}

/**
 * Format time in 12-hour format
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Calculate start time from duration
 */
export function calculateStartTime(minutes: number): Date {
  const now = new Date();
  return new Date(now.getTime() - minutes * 60 * 1000);
}

/**
 * Generate time options in 10-minute intervals
 */
export function generateTimeOptions(hoursBack: number = 8): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  
  // Add "Now" option
  options.push({
    value: now.toISOString(),
    label: `Now (${formatTime(now)})`,
  });
  
  // Generate past times in 10-minute intervals
  for (let i = 1; i <= hoursBack * 6; i++) {
    const time = new Date(now.getTime() - i * 10 * 60 * 1000);
    options.push({
      value: time.toISOString(),
      label: formatTime(time),
    });
  }
  
  return options;
}

/**
 * Round time to nearest 10 minutes
 */
export function roundToNearest10Minutes(date: Date): Date {
  const minutes = date.getMinutes();
  const rounded = Math.round(minutes / 10) * 10;
  const result = new Date(date);
  result.setMinutes(rounded);
  result.setSeconds(0);
  result.setMilliseconds(0);
  return result;
}

/**
 * Calculate elapsed time from start
 */
export function calculateElapsedMinutes(startedAt: string): number {
  const start = new Date(startedAt);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (60 * 1000));
}

/**
 * Format elapsed time for display
 */
export function formatElapsedTime(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `${hours}h ${mins}m ago`;
}
