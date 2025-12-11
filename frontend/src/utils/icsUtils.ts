import { createEvent, type EventAttributes } from 'ics';
import { parseISO, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { CalComBooking } from '../api';

/**
 * Generate and download ICS file for a booking
 */
export function generateICSFile(booking: CalComBooking): void {
  const startDate = parseISO(booking.start_time);
  const endDate = parseISO(booking.end_time);
  
  // Convert to user's timezone for display
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zonedStart = toZonedTime(startDate, userTz);
  const zonedEnd = toZonedTime(endDate, userTz);
  
  const event: EventAttributes = {
    start: [
      zonedStart.getFullYear(),
      zonedStart.getMonth() + 1,
      zonedStart.getDate(),
      zonedStart.getHours(),
      zonedStart.getMinutes()
    ],
    end: [
      zonedEnd.getFullYear(),
      zonedEnd.getMonth() + 1,
      zonedEnd.getDate(),
      zonedEnd.getHours(),
      zonedEnd.getMinutes()
    ],
    title: booking.event_type || 'Meeting with Reel48',
    description: booking.notes || `Meeting with Reel48 team${booking.notes ? `\n\nNotes: ${booking.notes}` : ''}`,
    location: booking.meeting_url || 'Online',
    url: booking.meeting_url || undefined,
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
    organizer: {
      name: 'Reel48',
      email: 'info@reel48.com'
    },
    attendees: [
      {
        name: booking.customer_name,
        email: booking.customer_email,
        rsvp: true,
        partstat: 'ACCEPTED',
        role: 'REQ-PARTICIPANT'
      }
    ]
  };
  
  createEvent(event, (error, value) => {
    if (error) {
      console.error('Error creating ICS file:', error);
      alert('Failed to generate calendar file. Please try again.');
      return;
    }
    
    if (value) {
      // Create blob and download
      const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reel48-meeting-${format(startDate, 'yyyy-MM-dd')}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  });
}

