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
    loadTimeSlots();
  }, [selectedDate, eventTypeId]);

  const loadTimeSlots = async () => {
    try {
      setLoading(true);
      
      // Use selected date or today's date if no date is selected
      const dateToUse = selectedDate || new Date();
      const dateStr = format(dateToUse, 'yyyy-MM-dd');
      const dateFrom = format(addDays(dateToUse, -1), 'yyyy-MM-dd');
      const dateTo = format(addDays(dateToUse, 1), 'yyyy-MM-dd');
      
      const response = await calcomAPI.getAvailability({
        date_from: dateFrom,
        date_to: dateTo,
        event_type_id: eventTypeId
      });

      const slots = response.data?.slots || [];
      
      // Filter to the specific date (selected date or today)
      const slotsForDay = slots
        .filter((s) => format(new Date(s.start_time), 'yyyy-MM-dd') === dateStr)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));

      setTimeSlots(slotsForDay);
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

  // Use selected date or today's date for display
  const displayDate = selectedDate || new Date();

  return (
    <div className={`time-slots-layout ${timeSlots.length === 0 ? 'is-empty' : ''}`}>
      <div className="time-slot-header">
        <h4>Available Times for {format(displayDate, 'EEEE, MMMM d')}</h4>
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

