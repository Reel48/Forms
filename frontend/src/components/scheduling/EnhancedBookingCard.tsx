import { useState, useEffect } from 'react';
import { differenceInMinutes, parseISO } from 'date-fns';
import type { CalComBooking } from '../../api';
import { formatRelativeTime, formatDateTimeWithTimezone, getCountdown, getTimezoneAbbreviation } from '../../utils/dateUtils';
import { generateICSFile } from '../../utils/icsUtils';
import './EnhancedBookingCard.css';

interface EnhancedBookingCardProps {
  booking: CalComBooking;
  showActions?: boolean;
  onCancel?: (bookingId: string) => void;
  onReschedule?: (bookingId: string) => void;
  onJoinMeeting?: (meetingUrl: string) => void;
  timezone?: string;
}

export default function EnhancedBookingCard({
  booking,
  showActions = true,
  onCancel,
  onReschedule,
  onJoinMeeting,
  timezone
}: EnhancedBookingCardProps) {
  const [countdown, setCountdown] = useState(getCountdown(booking.start_time, timezone));
  const [isUpcoming, setIsUpcoming] = useState(new Date(booking.start_time) > new Date() && booking.status === 'confirmed');

  useEffect(() => {
    if (!isUpcoming) return;

    const interval = setInterval(() => {
      const newCountdown = getCountdown(booking.start_time, timezone);
      setCountdown(newCountdown);
      if (newCountdown.isPast || newCountdown.totalSeconds <= 0) {
        setIsUpcoming(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [booking.start_time, timezone, isUpcoming]);

  const handleExportICS = () => {
    generateICSFile(booking);
  };

  const handleJoinMeeting = () => {
    if (booking.meeting_url && onJoinMeeting) {
      onJoinMeeting(booking.meeting_url);
    } else if (booking.meeting_url) {
      window.open(booking.meeting_url, '_blank');
    }
  };

  const getDuration = () => {
    const start = parseISO(booking.start_time);
    const end = parseISO(booking.end_time);
    const minutes = differenceInMinutes(end, start);
    if (minutes < 60) {
      return `${minutes} minutes`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `${hours}h ${remainingMinutes}m`;
  };

  const statusColors: Record<string, string> = {
    confirmed: '#10b981',
    cancelled: '#ef4444',
    rescheduled: '#f59e0b'
  };

  const tzAbbr = getTimezoneAbbreviation(timezone);

  return (
    <div className="enhanced-booking-card">
      <div className="booking-card-header">
        <div className="booking-title-section">
          <h3 className="booking-title">{booking.event_type || 'Meeting'}</h3>
          <p className="booking-relative-time">
            {isUpcoming ? formatRelativeTime(booking.start_time, timezone) : formatRelativeTime(booking.start_time, timezone)}
          </p>
        </div>
        <span 
          className="booking-status-badge"
          style={{ backgroundColor: statusColors[booking.status] || '#6b7280' }}
        >
          {booking.status}
        </span>
      </div>

      {isUpcoming && countdown.totalSeconds > 0 && !countdown.isPast && (
        <div className="booking-countdown">
          <div className="countdown-label">Meeting starts in:</div>
          <div className="countdown-timer">
            {countdown.hours > 0 && (
              <span className="countdown-unit">
                <span className="countdown-value">{countdown.hours}</span>
                <span className="countdown-label-small">h</span>
              </span>
            )}
            <span className="countdown-unit">
              <span className="countdown-value">{countdown.minutes}</span>
              <span className="countdown-label-small">m</span>
            </span>
            <span className="countdown-unit">
              <span className="countdown-value">{countdown.seconds}</span>
              <span className="countdown-label-small">s</span>
            </span>
          </div>
        </div>
      )}

      <div className="booking-details">
        <div className="booking-detail-item">
          <span className="detail-label">Date & Time:</span>
          <span className="detail-value">{formatDateTimeWithTimezone(booking.start_time, timezone)}</span>
        </div>
        <div className="booking-detail-item">
          <span className="detail-label">Duration:</span>
          <span className="detail-value">{getDuration()}</span>
        </div>
        <div className="booking-detail-item">
          <span className="detail-label">Timezone:</span>
          <span className="detail-value">{tzAbbr}</span>
        </div>
        {booking.notes && (
          <div className="booking-detail-item">
            <span className="detail-label">Notes:</span>
            <span className="detail-value notes-text">{booking.notes}</span>
          </div>
        )}
      </div>

      <div className="booking-actions-row">
        {booking.meeting_url && (
          <button
            className="btn-primary btn-sm"
            onClick={handleJoinMeeting}
          >
            Join Google Meet
          </button>
        )}
        <button
          className="btn-outline btn-sm"
          onClick={handleExportICS}
          title="Add to calendar"
        >
          📅 Add to Calendar
        </button>
      </div>

      {showActions && isUpcoming && (
        <div className="booking-actions">
          {onReschedule && (
            <button
              className="btn-outline btn-sm"
              onClick={() => onReschedule(booking.booking_id)}
            >
              Reschedule
            </button>
          )}
          {onCancel && (
            <button
              className="btn-danger btn-sm"
              onClick={() => onCancel(booking.booking_id)}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {booking.status === 'cancelled' && booking.cancellation_reason && (
        <div className="booking-cancellation-info">
          <span className="cancellation-label">Cancellation reason:</span>
          <span className="cancellation-reason">{booking.cancellation_reason}</span>
        </div>
      )}
    </div>
  );
}

