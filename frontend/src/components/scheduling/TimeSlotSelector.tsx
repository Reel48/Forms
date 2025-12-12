import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { calcomAPI } from '../../api';
import type { CalComAvailability } from '../../api';
import { getQuickBookSuggestions, getUserTimezone } from '../../utils/dateUtils';
import './TimeSlotSelector.css';

interface TimeSlotSelectorProps {
  selectedDate: Date | null;
  onTimeSlotSelect: (dateTime: string) => void;
  eventTypeId?: number;
  timezone?: string;
  onQuickBook?: (date: Date, time: string) => void;
}

export default function TimeSlotSelector({
  selectedDate,
  onTimeSlotSelect,
  eventTypeId,
  timezone,
  onQuickBook
}: TimeSlotSelectorProps) {
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [quickBookSuggestions, setQuickBookSuggestions] = useState<Array<{ label: string; date: Date; time: string }>>([]);

  useEffect(() => {
    if (selectedDate) {
      loadTimeSlots();
    } else {
      setTimeSlots([]);
    }
  }, [selectedDate, eventTypeId, timezone]);

  useEffect(() => {
    setQuickBookSuggestions(getQuickBookSuggestions(timezone));
  }, [timezone]);

  const loadTimeSlots = async () => {
    if (!selectedDate) return;

    try {
      setLoading(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const response = await calcomAPI.getAvailability({
        date_from: dateStr,
        date_to: dateStr,
        event_type_id: eventTypeId
      });
      
      // Backend returns: {availability: [{date: "YYYY-MM-DD", slots: ["HH:MM", ...]}], timezone: "America/Chicago"}
      const availability = response.data?.availability || [];
      const calcomTimezone = response.data?.timezone || 'America/Chicago';
      
      const dayAvailability = availability.find((a: CalComAvailability) => a.date === dateStr);
      const slots = dayAvailability?.slots || [];
      
      // Get user's timezone
      const userTz = timezone || getUserTimezone();
      
      // If timezones match, no conversion needed - display times as-is
      if (calcomTimezone === userTz) {
        setTimeSlots(slots);
      } else {
        // Only convert if timezones differ
        const convertedSlots = slots.map((slot: string) => {
          try {
            // Parse the time slot (HH:MM) in Cal.com timezone
            const [hours, minutes] = slot.split(':');
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            
            // Create a date string representing this time in Cal.com timezone
            const dateTimeStr = `${dateStr}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`;
            
            // Create a date object (this will be interpreted as local time, but we'll fix that)
            const dateInCalcomTz = new Date(dateTimeStr);
            
            // Use date-fns-tz to properly convert:
            // 1. Treat the date as if it's in Cal.com timezone (fromZonedTime)
            // 2. Convert to user's timezone (toZonedTime)
            const utcDate = fromZonedTime(dateInCalcomTz, calcomTimezone);
            const userZonedDate = toZonedTime(utcDate, userTz);
            
            // Format as HH:mm in user's timezone
            return format(userZonedDate, 'HH:mm');
          } catch (e) {
            console.error('Error converting timezone:', e, slot);
            return slot; // Fallback to original
          }
        });
        
        setTimeSlots(convertedSlots);
      }
    } catch (error) {
      console.error('Failed to load time slots:', error);
      console.error('Error details:', error);
      setTimeSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeSlotClick = (slot: string) => {
    if (selectedDate) {
      // Combine selected date with time slot
      const [hours, minutes] = slot.split(':');
      const dateTime = new Date(selectedDate);
      dateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      onTimeSlotSelect(dateTime.toISOString());
    }
  };

  const handleQuickBook = (suggestion: { date: Date; time: string }) => {
    if (onQuickBook) {
      onQuickBook(suggestion.date, suggestion.time);
    } else {
      const [hours, minutes] = suggestion.time.split(':');
      const dateTime = new Date(suggestion.date);
      dateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      onTimeSlotSelect(dateTime.toISOString());
    }
  };

  if (!selectedDate) {
    return (
      <div className="time-slots-layout is-empty">
        <div className="time-slot-empty">
          <p>Select a date to see available time slots</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`time-slots-layout ${timeSlots.length === 0 ? 'is-empty' : ''}`}>
      <div className="time-slot-header">
        <h4>Available Times for {format(selectedDate, 'EEEE, MMMM d')}</h4>
      </div>

      {quickBookSuggestions.length > 0 && timeSlots.length > 0 && (
        <div className="quick-book-section">
          <p className="quick-book-label">Quick Book:</p>
          <div className="quick-book-container">
            {quickBookSuggestions.map((suggestion, index) => (
              <button
                key={index}
                className="quick-book-btn"
                onClick={() => handleQuickBook(suggestion)}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="time-slot-loading">
          <span>Loading available times...</span>
        </div>
      ) : timeSlots.length === 0 ? (
        <div className="time-slot-empty">
          <p>No available time slots for this date.</p>
          <p className="time-slot-empty-hint">Try selecting a different date.</p>
        </div>
      ) : (
        <div className="time-slots-grid">
          {timeSlots.map((slot, index) => {
            // Slots are already in the correct timezone (user's timezone or Cal.com timezone if they match)
            // Just format "HH:MM" to "h:mm a" (e.g., "09:00" -> "9:00 AM")
            let displayTime = slot;
            try {
              if (slot.includes('T')) {
                // ISO string (shouldn't happen, but handle it)
                const date = new Date(slot);
                displayTime = format(date, 'h:mm a');
              } else {
                // Time string like "09:00" or "14:00"
                const [hours, minutes] = slot.split(':');
                const hour24 = parseInt(hours);
                const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
                const ampm = hour24 >= 12 ? 'PM' : 'AM';
                displayTime = `${hour12}:${minutes} ${ampm}`;
              }
            } catch (e) {
              // Fallback to original slot
            }

            return (
              <button
                key={index}
                className="time-slot-btn"
                onClick={() => handleTimeSlotClick(slot)}
              >
                {displayTime}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

