import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { calcomAPI } from '../api';
import type { CalComBooking, CalComEventType } from '../api';
import CalendarPicker from '../components/scheduling/CalendarPicker';
import TimeSlotSelector from '../components/scheduling/TimeSlotSelector';
import SwipeableBookingCard from '../components/scheduling/SwipeableBookingCard';
import BottomSheet from '../components/scheduling/BottomSheet';
import { getUserTimezone } from '../utils/dateUtils';
import './CustomerSchedulingPage.css';

function CustomerSchedulingPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [bookings, setBookings] = useState<CalComBooking[]>([]);
  const [eventTypes, setEventTypes] = useState<CalComEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history' | 'book'>('upcoming');
  const [reschedulingBooking, setReschedulingBooking] = useState<string | null>(null);
  
  // Booking state
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<CalComEventType | null>(null);
  const [bookingNotes, setBookingNotes] = useState('');
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false);

  useEffect(() => {
    if (role === 'customer') {
      loadData();
    } else {
      navigate('/');
    }
  }, [role, navigate]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [bookingsResponse, eventTypesResponse] = await Promise.all([
        calcomAPI.getBookings(),
        calcomAPI.getEventTypes()
      ]);
      setBookings(bookingsResponse.data.bookings || []);
      setEventTypes(eventTypesResponse.data.event_types || []);
      if (eventTypesResponse.data.event_types?.length > 0) {
        setSelectedEventType(eventTypesResponse.data.event_types[0]);
      }
    } catch (error: any) {
      console.error('Failed to load scheduling data:', error);
      alert('Failed to load scheduling data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isUpcoming = (booking: CalComBooking) => {
    return new Date(booking.start_time) > new Date() && booking.status === 'confirmed';
  };

  const upcomingBookings = bookings.filter(isUpcoming);
  const pastBookings = bookings.filter(b => !isUpcoming(b));

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this meeting?')) {
      return;
    }

    try {
      await calcomAPI.cancelBooking(bookingId);
      await loadData();
      alert('Meeting cancelled successfully.');
    } catch (error: any) {
      console.error('Failed to cancel booking:', error);
      alert('Failed to cancel meeting. Please try again.');
    }
  };

  const handleRescheduleBooking = async (bookingId: string, newStartTime: string) => {
    setReschedulingBooking(bookingId);
    try {
      await calcomAPI.rescheduleBooking(bookingId, { start_time: newStartTime, timezone: getUserTimezone() });
      await loadData();
      setReschedulingBooking(null);
      setSelectedDate(null);
      alert('Meeting rescheduled successfully.');
    } catch (error: any) {
      console.error('Failed to reschedule booking:', error);
      alert('Failed to reschedule meeting. Please try again.');
    } finally {
      setReschedulingBooking(null);
    }
  };

  const handleTimeSlotSelect = async (dateTime: string) => {
    if (!selectedEventType) {
      alert('Please select a meeting type first.');
      return;
    }

    setCreatingBooking(true);
    try {
      await calcomAPI.createBooking({
        event_type_id: selectedEventType.id,
        start_time: dateTime,
        timezone: getUserTimezone(),
        notes: bookingNotes || undefined
      });
      await loadData();
      setSelectedDate(null);
      setBookingNotes('');
      setActiveTab('upcoming');
      alert('Meeting scheduled successfully!');
    } catch (error: any) {
      console.error('Failed to create booking:', error);
      const detail = error?.response?.data?.detail;
      if (detail) {
        // Backend returns {"detail": {...}}; show concise info without leaking anything sensitive
        const msg =
          typeof detail === 'string'
            ? detail
            : JSON.stringify(detail, null, 2);
        alert(`Failed to schedule meeting:\n\n${msg}`);
      } else {
        alert('Failed to schedule meeting. Please try again.');
      }
    } finally {
      setCreatingBooking(false);
    }
  };

  const handleJoinMeeting = (meetingUrl: string) => {
    window.open(meetingUrl, '_blank');
  };

  // Calculate analytics
  const totalMeetings = bookings.length;
  const confirmedMeetings = bookings.filter(b => b.status === 'confirmed').length;
  const eventTypeCounts = bookings.reduce((acc, booking) => {
    const type = booking.event_type || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const mostCommonType = Object.entries(eventTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  if (loading) {
    return (
      <div className="container">
        <div className="scheduling-page">
          <div className="page-header">
            <h1>Schedule a Meeting</h1>
          </div>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="scheduling-page">
        <div className="page-header">
          <h1>Schedule a Meeting</h1>
          <p>Book a time to meet with the Reel48 team</p>
        </div>

        <div className="tabs">
          <button
            className={activeTab === 'upcoming' ? 'tab-active' : 'tab'}
            onClick={() => setActiveTab('upcoming')}
          >
            Upcoming ({upcomingBookings.length})
          </button>
          <button
            className={activeTab === 'history' ? 'tab-active' : 'tab'}
            onClick={() => setActiveTab('history')}
          >
            History ({pastBookings.length})
          </button>
          <button
            className={activeTab === 'book' ? 'tab-active' : 'tab'}
            onClick={() => setActiveTab('book')}
          >
            Book New Meeting
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'upcoming' && (
            <div>
              {upcomingBookings.length === 0 ? (
                <div className="empty-state-enhanced">
                  <h3>No upcoming meetings</h3>
                  <p>Schedule your first meeting with the Reel48 team to discuss your project needs.</p>
                  <div className="empty-state-benefits">
                    <div className="benefit-item">
                      <span className="benefit-bullet" aria-hidden="true" />
                      <span>Get personalized recommendations</span>
                    </div>
                    <div className="benefit-item">
                      <span className="benefit-bullet" aria-hidden="true" />
                      <span>Discuss custom solutions</span>
                    </div>
                    <div className="benefit-item">
                      <span className="benefit-bullet" aria-hidden="true" />
                      <span>Get answers to your questions</span>
                    </div>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => setActiveTab('book')}
                  >
                    Schedule a Meeting
                  </button>
                </div>
              ) : (
                <div className="bookings-grid">
                  {upcomingBookings.map(booking => (
                    <SwipeableBookingCard
                      key={booking.id}
                      booking={booking}
                      showActions={true}
                      onCancel={handleCancelBooking}
                      onReschedule={(bookingId) => {
                        setReschedulingBooking(bookingId);
                        setShowRescheduleSheet(true);
                        const booking = upcomingBookings.find(b => b.booking_id === bookingId);
                        if (booking) {
                          setSelectedDate(new Date(booking.start_time));
                        }
                      }}
                      onJoinMeeting={handleJoinMeeting}
                      isMobile={isMobile}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {pastBookings.length === 0 ? (
                <div className="empty-state-enhanced">
                  <h3>No past meetings</h3>
                  <p>Your meeting history will appear here once you've had meetings with the Reel48 team.</p>
                </div>
              ) : (
                <>
                  <div className="analytics-section">
                    <h3>Meeting Statistics</h3>
                    <div className="analytics-grid">
                      <div className="analytics-card">
                        <div className="analytics-value">{totalMeetings}</div>
                        <div className="analytics-label">Total Meetings</div>
                      </div>
                      <div className="analytics-card">
                        <div className="analytics-value">{confirmedMeetings}</div>
                        <div className="analytics-label">Completed</div>
                      </div>
                      <div className="analytics-card">
                        <div className="analytics-value">{mostCommonType}</div>
                        <div className="analytics-label">Most Common Type</div>
                      </div>
                    </div>
                  </div>
                  <div className="bookings-grid">
                    {pastBookings.map(booking => (
                      <SwipeableBookingCard
                        key={booking.id}
                        booking={booking}
                        showActions={false}
                        onJoinMeeting={handleJoinMeeting}
                        isMobile={isMobile}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'book' && (
            <div className="booking-widget-container">
              <h2>Book a Meeting</h2>
              <p>Select an available time slot below to schedule your meeting.</p>

              {eventTypes.length > 0 && (
                <div className="event-type-selector">
                  <label htmlFor="event-type-select">Meeting Type:</label>
                  <select
                    id="event-type-select"
                    value={selectedEventType?.id || ''}
                    onChange={(e) => {
                      const type = eventTypes.find(et => et.id === parseInt(e.target.value));
                      setSelectedEventType(type || null);
                    }}
                    className="event-type-select"
                  >
                    {eventTypes.map(eventType => (
                      <option key={eventType.id} value={eventType.id}>
                        {eventType.title} ({eventType.length} min)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="scheduler-wrapper">
                <CalendarPicker
                  selectedDate={selectedDate}
                  onDateSelect={setSelectedDate}
                  eventTypeId={selectedEventType?.id}
                />
                {selectedDate && (
                  <TimeSlotSelector
                    selectedDate={selectedDate}
                    onTimeSlotSelect={handleTimeSlotSelect}
                    eventTypeId={selectedEventType?.id}
                  />
                )}
              </div>

              {selectedDate && (
                <div className="booking-notes-section">
                  <label htmlFor="booking-notes">Additional Notes (Optional):</label>
                  <textarea
                    id="booking-notes"
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    placeholder="Any questions or topics you'd like to discuss..."
                    rows={3}
                    className="booking-notes-input"
                  />
                </div>
              )}

              {reschedulingBooking && (
                <>
                  {isMobile ? (
                    <BottomSheet
                      isOpen={showRescheduleSheet}
                      onClose={() => {
                        setShowRescheduleSheet(false);
                        setReschedulingBooking(null);
                        setSelectedDate(null);
                      }}
                      title="Reschedule Meeting"
                    >
                      <p style={{ marginBottom: '1.5rem', color: 'var(--color-text-muted, #6b7280)' }}>
                        Select a new date and time for your meeting.
                      </p>
                      <CalendarPicker
                        selectedDate={selectedDate}
                        onDateSelect={setSelectedDate}
                        eventTypeId={selectedEventType?.id}
                      />
                      {selectedDate && (
                        <div style={{ marginTop: '1.5rem' }}>
                          <TimeSlotSelector
                            selectedDate={selectedDate}
                            onTimeSlotSelect={(dateTime) => {
                              handleRescheduleBooking(reschedulingBooking, dateTime);
                              setShowRescheduleSheet(false);
                            }}
                            eventTypeId={selectedEventType?.id}
                          />
                        </div>
                      )}
                    </BottomSheet>
                  ) : (
                    <div className="reschedule-modal">
                      <div className="reschedule-modal-content">
                        <h3>Reschedule Meeting</h3>
                        <p>Select a new date and time for your meeting.</p>
                        <CalendarPicker
                          selectedDate={selectedDate}
                          onDateSelect={setSelectedDate}
                          eventTypeId={selectedEventType?.id}
                        />
                        {selectedDate && (
                          <TimeSlotSelector
                            selectedDate={selectedDate}
                            onTimeSlotSelect={(dateTime) => {
                              handleRescheduleBooking(reschedulingBooking, dateTime);
                            }}
                            eventTypeId={selectedEventType?.id}
                          />
                        )}
                        <div className="reschedule-modal-actions">
                          <button
                            className="btn-outline"
                            onClick={() => {
                              setReschedulingBooking(null);
                              setSelectedDate(null);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {creatingBooking && (
                <div className="booking-loading-overlay">
                  <div className="booking-loading-content">
                    <p>Creating your booking...</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerSchedulingPage;
