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
      
      let dateToUse: Date;
      let dateStr: string;
      let dateFrom: string;
      let dateTo: string;
      
      if (selectedDate) {
        // If a date is selected, show slots for that date
        dateToUse = selectedDate;
        dateStr = format(selectedDate, 'yyyy-MM-dd');
        dateFrom = format(addDays(selectedDate, -1), 'yyyy-MM-dd');
        dateTo = format(addDays(selectedDate, 1), 'yyyy-MM-dd');
      } else {
        // If no date is selected, show slots for today and the next 7 days
        dateToUse = new Date();
        dateStr = format(dateToUse, 'yyyy-MM-dd');
        dateFrom = format(dateToUse, 'yyyy-MM-dd');
        dateTo = format(addDays(dateToUse, 7), 'yyyy-MM-dd');
      }
      
      const response = await calcomAPI.getAvailability({
        date_from: dateFrom,
        date_to: dateTo,
        event_type_id: eventTypeId
      });

      const slots = response.data?.slots || [];
      
      if (selectedDate) {
        // Filter to selected date only
        const slotsForSelectedDay = slots
          .filter((s) => format(new Date(s.start_time), 'yyyy-MM-dd') === dateStr)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        setTimeSlots(slotsForSelectedDay);
      } else {
        // Show all upcoming slots, sorted by time
        const upcomingSlots = slots
          .filter((s) => new Date(s.start_time) >= new Date())
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        setTimeSlots(upcomingSlots);
      }
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

  // Group slots by date if no date is selected
  const groupedSlots = selectedDate ? null : timeSlots.reduce((acc, slot) => {
    const slotDate = format(new Date(slot.start_time), 'yyyy-MM-dd');
    if (!acc[slotDate]) {
      acc[slotDate] = [];
    }
    acc[slotDate].push(slot);
    return acc;
  }, {} as Record<string, CalComAvailabilitySlot[]>);

  return (
    <div className={`time-slots-layout ${timeSlots.length === 0 ? 'is-empty' : ''}`}>
      <div className="time-slot-header">
        {selectedDate ? (
          <h4>Available Times for {format(selectedDate, 'EEEE, MMMM d')}</h4>
        ) : (
          <h4>Available Times</h4>
        )}
      </div>

      {loading ? (
        <div className="time-slot-loading">
          <span>Loading available times...</span>
        </div>
      ) : timeSlots.length === 0 ? (
        <div className="time-slot-empty">
          <p>No available time slots{selectedDate ? ' for this date' : ''}.</p>
          {selectedDate && (
            <p className="time-slot-empty-hint">Try selecting a different date.</p>
          )}
        </div>
      ) : selectedDate ? (
        // Show slots for selected date
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
      ) : (
        // Show slots grouped by date when no date is selected
        <div className="time-slots-grouped">
          {Object.entries(groupedSlots || {}).map(([dateStr, slots]) => {
            const date = new Date(dateStr);
            return (
              <div key={dateStr} className="time-slot-date-group">
                <h5 className="time-slot-date-header">
                  {format(date, 'EEEE, MMMM d')}
                </h5>
                <div className="time-slots-grid">
                  {slots.map((slot, index) => {
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

