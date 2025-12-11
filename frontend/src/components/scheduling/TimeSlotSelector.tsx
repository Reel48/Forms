import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { calcomAPI } from '../../api';
import type { CalComAvailability } from '../../api';
import { getQuickBookSuggestions, formatTime } from '../../utils/dateUtils';
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
      
      // Extract time slots from availability response
      // Backend now returns: {availability: [{date: "YYYY-MM-DD", slots: ["HH:MM", ...]}]}
      const availability = response.data?.availability || [];
      console.log('Availability response:', response.data);
      console.log('Availability array:', availability);
      console.log('Looking for date:', dateStr);
      
      const dayAvailability = availability.find((a: CalComAvailability) => a.date === dateStr);
      console.log('Day availability found:', dayAvailability);
      
      const slots = dayAvailability?.slots || [];
      console.log('Time slots:', slots);
      setTimeSlots(slots);
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
            // Parse slot time (format: "HH:MM" or ISO string)
            let displayTime = slot;
            try {
              if (slot.includes('T')) {
                // ISO string
                displayTime = formatTime(slot, timezone);
              } else {
                // Time string like "14:00"
                const [hours, minutes] = slot.split(':');
                const dateTime = new Date(selectedDate);
                dateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                displayTime = formatTime(dateTime.toISOString(), timezone);
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

