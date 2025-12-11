import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { calcomAPI } from '../api';
import type { CalComBooking } from '../api';
import './AdminCalendarView.css';

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  html_link?: string;
  start: string;
  end: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  organizer?: string;
  status: string;
  source: string;
}

type CalendarEvent = 
  | (CalComBooking & { type: 'calcom' })
  | (GoogleCalendarEvent & { type: 'google' });

function AdminCalendarView() {
  const { role } = useAuth();
  const [bookings, setBookings] = useState<CalComBooking[]>([]);
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [selectedBooking, setSelectedBooking] = useState<CalComBooking | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<GoogleCalendarEvent | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'admin') {
      loadCalendarData();
    }
  }, [role, selectedDate, viewMode]);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      const dateFrom = getDateRange().start.toISOString().split('T')[0];
      const dateTo = getDateRange().end.toISOString().split('T')[0];
      
      const response = await calcomAPI.getAdminCalendar({ date_from: dateFrom, date_to: dateTo });
      setBookings(response.data.bookings || []);
      setGoogleCalendarEvents(response.data.google_calendar_events || []);
    } catch (error: any) {
      console.error('Failed to load calendar data:', error);
      alert('Failed to load calendar data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = () => {
    const start = new Date(selectedDate);
    const end = new Date(selectedDate);

    if (viewMode === 'month') {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    } else if (viewMode === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      end.setDate(start.getDate() + 6);
    }
    // For day view, start and end are the same

    return { start, end };
  };

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this meeting?')) {
      return;
    }

    setCancellingBooking(bookingId);
    try {
      await calcomAPI.cancelBooking(bookingId);
      await loadCalendarData();
      alert('Meeting cancelled successfully.');
    } catch (error: any) {
      console.error('Failed to cancel booking:', error);
      alert('Failed to cancel meeting. Please try again.');
    } finally {
      setCancellingBooking(null);
    }
  };

  const openMeetingLink = (meetingUrl: string | null) => {
    if (meetingUrl) {
      window.open(meetingUrl, '_blank');
    } else {
      alert('Meeting link not available.');
    }
  };

  const getBookingsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const calcomBookingsForDate = bookings.filter(booking => {
      const bookingDate = new Date(booking.start_time).toISOString().split('T')[0];
      return bookingDate === dateStr;
    });
    
    const googleEventsForDate = googleCalendarEvents.filter(event => {
      const eventDate = new Date(event.start).toISOString().split('T')[0];
      return eventDate === dateStr;
    });
    
    return { calcom: calcomBookingsForDate, google: googleEventsForDate };
  };

  const renderMonthView = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return (
      <div className="calendar-month">
        <div className="calendar-weekdays">
          {weekDays.map(day => (
            <div key={day} className="calendar-weekday">{day}</div>
          ))}
        </div>
        <div className="calendar-days">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="calendar-day empty" />;
            }

            const dayBookings = getBookingsForDate(date);
            const totalBookings = dayBookings.calcom.length + dayBookings.google.length;
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <div
                key={date.toISOString()}
                className={`calendar-day ${isToday ? 'today' : ''}`}
                onClick={() => {
                  if (dayBookings.calcom.length > 0) {
                    setSelectedBooking(dayBookings.calcom[0]);
                  } else if (dayBookings.google.length > 0) {
                    setSelectedEvent(dayBookings.google[0]);
                  }
                }}
              >
                <div className="calendar-day-number">{date.getDate()}</div>
                {totalBookings > 0 && (
                  <div className="calendar-day-bookings">
                    {dayBookings.calcom.slice(0, 2).map(booking => (
                      <div
                        key={booking.id}
                        className="calendar-booking-dot"
                        style={{
                          backgroundColor: booking.status === 'confirmed' ? '#10b981' : '#ef4444'
                        }}
                        title={`${formatTime(booking.start_time)} - ${booking.customer_name}`}
                      />
                    ))}
                    {dayBookings.google.slice(0, 2).map(event => (
                      <div
                        key={event.id}
                        className="calendar-booking-dot"
                        style={{
                          backgroundColor: '#3b82f6'
                        }}
                        title={`${formatTime(event.start)} - ${event.summary}`}
                      />
                    ))}
                    {totalBookings > 4 && (
                      <div className="calendar-booking-more">+{totalBookings - 4}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderListView = () => {
    // Combine Cal.com bookings and Google Calendar events
    const allEvents: CalendarEvent[] = [
      ...bookings.map(b => ({ ...b, type: 'calcom' as const })),
      ...googleCalendarEvents.map(e => ({ ...e, type: 'google' as const }))
    ];
    
    const sortedEvents = allEvents.sort((a, b) => {
      const aTime = a.type === 'calcom' ? new Date(a.start_time).getTime() : new Date(a.start).getTime();
      const bTime = b.type === 'calcom' ? new Date(b.start_time).getTime() : new Date(b.start).getTime();
      return aTime - bTime;
    });

    return (
      <div className="calendar-list">
        {sortedEvents.length === 0 ? (
          <div className="empty-state">
            <p>No meetings scheduled for this period.</p>
          </div>
        ) : (
          sortedEvents.map((item) => {
            if (item.type === 'calcom') {
              const booking = item;
              return (
                <div key={booking.id} className="calendar-list-item">
                  <div className="list-item-time">
                    <strong>{formatTime(booking.start_time)}</strong>
                    <span>{formatDateTime(booking.start_time).split(',')[0]}</span>
                  </div>
                  <div className="list-item-details">
                    <h4>{booking.event_type || 'Meeting'} <span className="event-source-badge">Cal.com</span></h4>
                    <p>
                      <strong>Customer:</strong> {booking.customer_name} ({booking.customer_email})
                    </p>
                    {booking.notes && <p className="booking-notes">{booking.notes}</p>}
                    <div className="list-item-status">
                      <span className={`status-badge status-${booking.status}`}>
                        {booking.status}
                      </span>
                    </div>
                  </div>
                  <div className="list-item-actions">
                    {booking.meeting_url && (
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => openMeetingLink(booking.meeting_url)}
                      >
                        Join Meeting
                      </button>
                    )}
                    {booking.status === 'confirmed' && (
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => handleCancelBooking(booking.booking_id)}
                        disabled={cancellingBooking === booking.booking_id}
                      >
                        {cancellingBooking === booking.booking_id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
              );
            } else {
              const event = item;
              return (
                <div key={event.id} className="calendar-list-item">
                  <div className="list-item-time">
                    <strong>{formatTime(event.start)}</strong>
                    <span>{formatDateTime(event.start).split(',')[0]}</span>
                  </div>
                  <div className="list-item-details">
                    <h4>{event.summary} <span className="event-source-badge">Google Calendar</span></h4>
                    {event.description && <p className="booking-notes">{event.description}</p>}
                    {event.location && <p><strong>Location:</strong> {event.location}</p>}
                    {event.attendees && event.attendees.length > 0 && (
                      <p><strong>Attendees:</strong> {event.attendees.map(a => a.email || a.displayName).join(', ')}</p>
                    )}
                  </div>
                  <div className="list-item-actions">
                    {event.html_link && (
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => window.open(event.html_link, '_blank')}
                      >
                        View in Calendar
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          })
        )}
      </div>
    );
  };

  if (role !== 'admin') {
    return (
      <div className="admin-calendar-page">
        <p>Access denied. Admin access required.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-calendar-page">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Loading calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-calendar-page">
      <div className="calendar-header">
        <h1>Calendar</h1>
        <div className="calendar-controls">
          <button
            className={`view-mode-btn ${viewMode === 'month' ? 'active' : ''}`}
            onClick={() => setViewMode('month')}
          >
            Month
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'week' ? 'active' : ''}`}
            onClick={() => setViewMode('week')}
          >
            Week
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'day' ? 'active' : ''}`}
            onClick={() => setViewMode('day')}
          >
            Day
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              const newDate = new Date(selectedDate);
              if (viewMode === 'month') {
                newDate.setMonth(newDate.getMonth() - 1);
              } else if (viewMode === 'week') {
                newDate.setDate(newDate.getDate() - 7);
              } else {
                newDate.setDate(newDate.getDate() - 1);
              }
              setSelectedDate(newDate);
            }}
          >
            ← Previous
          </button>
          <button
            className="nav-btn"
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              const newDate = new Date(selectedDate);
              if (viewMode === 'month') {
                newDate.setMonth(newDate.getMonth() + 1);
              } else if (viewMode === 'week') {
                newDate.setDate(newDate.getDate() + 7);
              } else {
                newDate.setDate(newDate.getDate() + 1);
              }
              setSelectedDate(newDate);
            }}
          >
            Next →
          </button>
        </div>
      </div>

      <div className="calendar-content">
        {viewMode === 'month' ? renderMonthView() : renderListView()}
      </div>

      {selectedBooking && (
        <div className="booking-modal" onClick={() => setSelectedBooking(null)}>
          <div className="booking-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedBooking.event_type || 'Meeting'} <span className="event-source-badge">Cal.com</span></h2>
              <button className="modal-close" onClick={() => setSelectedBooking(null)}>×</button>
            </div>
            <div className="modal-body">
              <p><strong>Date & Time:</strong> {formatDateTime(selectedBooking.start_time)}</p>
              <p><strong>Customer:</strong> {selectedBooking.customer_name}</p>
              <p><strong>Email:</strong> {selectedBooking.customer_email}</p>
              <p><strong>Status:</strong> <span className={`status-badge status-${selectedBooking.status}`}>{selectedBooking.status}</span></p>
              {selectedBooking.notes && (
                <p><strong>Notes:</strong> {selectedBooking.notes}</p>
              )}
              {selectedBooking.meeting_url && (
                <button
                  className="btn-primary"
                  onClick={() => openMeetingLink(selectedBooking.meeting_url)}
                >
                  Join Google Meet
                </button>
              )}
              {selectedBooking.status === 'confirmed' && (
                <button
                  className="btn-danger"
                  onClick={() => {
                    handleCancelBooking(selectedBooking.booking_id);
                    setSelectedBooking(null);
                  }}
                  disabled={cancellingBooking === selectedBooking.booking_id}
                >
                  Cancel Meeting
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="booking-modal" onClick={() => setSelectedEvent(null)}>
          <div className="booking-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedEvent.summary} <span className="event-source-badge">Google Calendar</span></h2>
              <button className="modal-close" onClick={() => setSelectedEvent(null)}>×</button>
            </div>
            <div className="modal-body">
              <p><strong>Date & Time:</strong> {formatDateTime(selectedEvent.start)}</p>
              {selectedEvent.description && (
                <p><strong>Description:</strong> {selectedEvent.description}</p>
              )}
              {selectedEvent.location && (
                <p><strong>Location:</strong> {selectedEvent.location}</p>
              )}
              {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                <p><strong>Attendees:</strong> {selectedEvent.attendees.map(a => a.email || a.displayName).join(', ')}</p>
              )}
              {selectedEvent.organizer && (
                <p><strong>Organizer:</strong> {selectedEvent.organizer}</p>
              )}
              {selectedEvent.html_link && (
                <button
                  className="btn-primary"
                  onClick={() => window.open(selectedEvent.html_link, '_blank')}
                >
                  View in Google Calendar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminCalendarView;

