import { useState, useEffect } from 'react';
import { addDays, format } from 'date-fns';
import { calcomAPI } from '../../api';
import type { CalComAvailabilitySlot } from '../../api';
import './TimeSlotSelector.css';

interface TimeSlotSelectorProps {
  selectedDate: Date | null;
  onTimeSlotSelect: (dateTime: string) => void;
  eventTypeId?: number;
}

export default function TimeSlotSelector({
  selectedDate,
  onTimeSlotSelect,
  eventTypeId
}: TimeSlotSelectorProps) {
  const [timeSlots, setTimeSlots] = useState<CalComAvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedDate) {
      loadTimeSlots();
    } else {
      setTimeSlots([]);
    }
  }, [selectedDate, eventTypeId]);

  const loadTimeSlots = async () => {
    if (!selectedDate) return;

    try {
      setLoading(true);
      // Fetch a 3-day window so we can correctly map UTC instants into the viewer's local day
      // (some slots near midnight in the schedule timezone can land on adjacent local dates)
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const dateFrom = format(addDays(selectedDate, -1), 'yyyy-MM-dd');
      const dateTo = format(addDays(selectedDate, 1), 'yyyy-MM-dd');
      
      const response = await calcomAPI.getAvailability({
        date_from: dateFrom,
        date_to: dateTo,
        event_type_id: eventTypeId
      });

      const slots = response.data?.slots || [];
      const slotsForSelectedDay = slots
        .filter((s) => format(new Date(s.start_time), 'yyyy-MM-dd') === dateStr)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));

      setTimeSlots(slotsForSelectedDay);
    } catch (error) {
      console.error('Failed to load time slots:', error);
      console.error('Error details:', error);
      setTimeSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeSlotClick = (slot: CalComAvailabilitySlot) => {
    onTimeSlotSelect(slot.start_time);
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
            const start = new Date(slot.start_time);
            const displayTime = new Intl.DateTimeFormat(undefined, {
              hour: 'numeric',
              minute: '2-digit'
            }).format(start);
            try {
              // no-op; keep try/catch to avoid UI crashing on unexpected values
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

