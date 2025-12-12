import { format, formatDistanceToNow, isToday, isTomorrow, isPast, differenceInMinutes, differenceInHours, differenceInDays, addDays, startOfDay, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * Get user's timezone from browser
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Format date to human-readable relative time
 * Examples: "In 2 hours", "Tomorrow at 2 PM", "In 3 days"
 */
export function formatRelativeTime(dateTime: string, timezone?: string): string {
  const date = parseISO(dateTime);
  const now = new Date();
  
  // If timezone provided, convert to user's timezone
  const userTz = timezone || getUserTimezone();
  const zonedDate = toZonedTime(date, userTz);
  const zonedNow = toZonedTime(now, userTz);
  
  if (isPast(zonedDate)) {
    return formatDistanceToNow(zonedDate, { addSuffix: true });
  }
  
  const hoursUntil = differenceInHours(zonedDate, zonedNow);
  const daysUntil = differenceInDays(zonedDate, zonedNow);
  
  if (isToday(zonedDate)) {
    if (hoursUntil < 1) {
      const minutesUntil = differenceInMinutes(zonedDate, zonedNow);
      return `In ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}`;
    }
    return `Today at ${format(zonedDate, 'h:mm a')}`;
  }
  
  if (isTomorrow(zonedDate)) {
    return `Tomorrow at ${format(zonedDate, 'h:mm a')}`;
  }
  
  if (daysUntil <= 7) {
    return format(zonedDate, 'EEEE \'at\' h:mm a');
  }
  
  return format(zonedDate, 'MMM d \'at\' h:mm a');
}

/**
 * Format date to full readable format with timezone
 */
export function formatDateTimeWithTimezone(dateTime: string, timezone?: string): string {
  const date = parseISO(dateTime);
  const userTz = timezone || getUserTimezone();
  const zonedDate = toZonedTime(date, userTz);
  
  return format(zonedDate, 'EEEE, MMMM d, yyyy \'at\' h:mm a zzz');
}

/**
 * Format date to short format
 */
export function formatShortDate(dateTime: string, timezone?: string): string {
  const date = parseISO(dateTime);
  const userTz = timezone || getUserTimezone();
  const zonedDate = toZonedTime(date, userTz);
  
  if (isToday(zonedDate)) {
    return 'Today';
  }
  if (isTomorrow(zonedDate)) {
    return 'Tomorrow';
  }
  return format(zonedDate, 'MMM d, yyyy');
}

/**
 * Format time only
 */
export function formatTime(dateTime: string, timezone?: string): string {
  const date = parseISO(dateTime);
  const userTz = timezone || getUserTimezone();
  const zonedDate = toZonedTime(date, userTz);
  return format(zonedDate, 'h:mm a');
}

/**
 * Calculate countdown timer values (days, hours, minutes)
 */
export function getCountdown(dateTime: string, timezone?: string): {
  days: number;
  hours: number;
  minutes: number;
  totalSeconds: number;
  isPast: boolean;
} {
  const date = parseISO(dateTime);
  const userTz = timezone || getUserTimezone();
  const zonedDate = toZonedTime(date, userTz);
  const now = new Date();
  const zonedNow = toZonedTime(now, userTz);
  
  const totalSeconds = Math.floor((zonedDate.getTime() - zonedNow.getTime()) / 1000);
  const isPast = totalSeconds < 0;
  
  const absSeconds = Math.abs(totalSeconds);
  const days = Math.floor(absSeconds / 86400);
  const hours = Math.floor((absSeconds % 86400) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  
  return {
    days,
    hours,
    minutes,
    totalSeconds,
    isPast
  };
}

/**
 * Get quick book suggestions (Tomorrow 2 PM, Next Monday 10 AM, etc.)
 */
export function getQuickBookSuggestions(timezone?: string): Array<{ label: string; date: Date; time: string }> {
  const userTz = timezone || getUserTimezone();
  const now = new Date();
  const zonedNow = toZonedTime(now, userTz);
  
  const suggestions = [];
  
  // Tomorrow at 2 PM
  const tomorrow = addDays(zonedNow, 1);
  tomorrow.setHours(14, 0, 0, 0);
  suggestions.push({
    label: 'Tomorrow at 2 PM',
    date: tomorrow,
    time: '14:00'
  });
  
  // Next Monday at 10 AM
  const nextMonday = addDays(zonedNow, (8 - zonedNow.getDay()) % 7 || 7);
  nextMonday.setHours(10, 0, 0, 0);
  suggestions.push({
    label: `Next ${format(nextMonday, 'EEEE')} at 10 AM`,
    date: nextMonday,
    time: '10:00'
  });
  
  // Next Monday at 2 PM
  const nextMonday2PM = new Date(nextMonday);
  nextMonday2PM.setHours(14, 0, 0, 0);
  suggestions.push({
    label: `Next ${format(nextMonday, 'EEEE')} at 2 PM`,
    date: nextMonday2PM,
    time: '14:00'
  });
  
  return suggestions;
}

/**
 * Convert date to ISO string in UTC
 */
export function toUTCISOString(date: Date, timezone?: string): string {
  const userTz = timezone || getUserTimezone();
  const zonedDate = toZonedTime(date, userTz);
  return zonedDate.toISOString();
}

/**
 * Get date range for calendar view
 */
export function getCalendarDateRange(selectedDate: Date): { start: Date; end: Date } {
  const start = startOfDay(selectedDate);
  const end = addDays(start, 30); // Show next 30 days
  return { start, end };
}

/**
 * Format timezone abbreviation
 */
export function getTimezoneAbbreviation(timezone?: string): string {
  const userTz = timezone || getUserTimezone();
  const date = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: userTz,
    timeZoneName: 'short'
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find(part => part.type === 'timeZoneName');
  return tzPart?.value || userTz;
}

