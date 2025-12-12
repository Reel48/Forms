import { useMemo, useState, useEffect } from 'react';
import { addDays, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, isToday, isPast } from 'date-fns';
import { calcomAPI } from '../../api';
import type { CalComAvailabilitySlot } from '../../api';
import './CalendarPicker.css';

interface CalendarPickerProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  eventTypeId?: number;
  disabledDates?: Date[];
}

export default function CalendarPicker({
  selectedDate,
  onDateSelect,
  eventTypeId,
  disabledDates = []
}: CalendarPickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [slots, setSlots] = useState<CalComAvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAvailability();
  }, [currentMonth, eventTypeId]);

  const loadAvailability = async () => {
    try {
      setLoading(true);
      const startDate = startOfMonth(currentMonth);
      const endDate = endOfMonth(currentMonth);
      const dateFrom = format(addDays(startDate, -1), 'yyyy-MM-dd');
      const dateTo = format(addDays(endDate, 1), 'yyyy-MM-dd');
      
      const response = await calcomAPI.getAvailability({
        date_from: dateFrom,
        date_to: dateTo,
        event_type_id: eventTypeId
      });
      
      const apiSlots = response.data?.slots || [];
      setSlots(apiSlots);
    } catch (error) {
      console.error('Failed to load availability:', error);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Get first day of week for the month
  const firstDayOfWeek = getDay(monthStart);
  
  // Create calendar grid
  const calendarDays: (Date | null)[] = [];
  
  // Add empty cells for days before month starts
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add all days in month
  daysInMonth.forEach(day => {
    calendarDays.push(day);
  });

  const slotCountByLocalDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of slots) {
      const d = format(new Date(s.start_time), 'yyyy-MM-dd');
      map.set(d, (map.get(d) || 0) + 1);
    }
    return map;
  }, [slots]);

  const isDateAvailable = (date: Date): boolean => {
    if (isPast(date) && !isToday(date)) return false;
    if (disabledDates.some(d => isSameDay(d, date))) return false;
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const count = slotCountByLocalDate.get(dateStr);
    return typeof count === 'number' ? count > 0 : true; // Default to available if no data
  };

  const getDateAvailabilityStatus = (date: Date): 'available' | 'unavailable' | 'past' | 'unknown' => {
    if (isPast(date) && !isToday(date)) return 'past';
    if (disabledDates.some(d => isSameDay(d, date))) return 'unavailable';
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const count = slotCountByLocalDate.get(dateStr);
    
    if (typeof count !== 'number') return 'unknown';
    return count > 0 ? 'available' : 'unavailable';
  };

  const handleDateClick = (date: Date) => {
    if (isDateAvailable(date)) {
      onDateSelect(date);
    }
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="calendar-picker">
      <div className="calendar-header">
        <button 
          className="calendar-nav-btn" 
          onClick={goToPreviousMonth}
          aria-label="Previous month"
        >
          ←
        </button>
        <h3 className="calendar-month-title">
          {format(currentMonth, 'MMMM yyyy')}
        </h3>
        <button 
          className="calendar-nav-btn" 
          onClick={goToNextMonth}
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="calendar-weekdays">
        {weekDays.map(day => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {calendarDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="calendar-day empty" />;
          }

          const isSelected = selectedDate && isSameDay(date, selectedDate);
          const isCurrentDay = isToday(date);
          const availabilityStatus = getDateAvailabilityStatus(date);
          const isClickable = isDateAvailable(date);

          return (
            <button
              key={date.toISOString()}
              className={`calendar-day ${isSelected ? 'selected' : ''} ${isCurrentDay ? 'today' : ''} ${availabilityStatus} ${isClickable ? 'clickable' : ''}`}
              onClick={() => handleDateClick(date)}
              disabled={!isClickable}
              aria-label={format(date, 'MMMM d, yyyy')}
            >
              <span className="calendar-day-number">{format(date, 'd')}</span>
              {availabilityStatus === 'available' && (
                <span className="availability-indicator" title="Available slots" />
              )}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="calendar-loading">
          <span>Loading availability...</span>
        </div>
      )}

      <div className="calendar-legend">
        <div className="legend-item">
          <span className="legend-dot available" />
          <span>Available</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot unavailable" />
          <span>Unavailable</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot past" />
          <span>Past</span>
        </div>
      </div>
    </div>
  );
}

