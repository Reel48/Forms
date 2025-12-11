import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { calcomAPI } from '../api';
import type { CalComBooking, CalComEventType } from '../api';
import './CustomerSchedulingPage.css';

function CustomerSchedulingPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [bookings, setBookings] = useState<CalComBooking[]>([]);
  const [eventTypes, setEventTypes] = useState<CalComEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history' | 'book'>('upcoming');
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null);
  const [reschedulingBooking, setReschedulingBooking] = useState<string | null>(null);
  const [newBookingDate, setNewBookingDate] = useState('');
  const [newBookingTime, setNewBookingTime] = useState('');

  useEffect(() => {
    if (role === 'customer') {
      loadData();
    } else {
      navigate('/');
    }
  }, [role, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [bookingsResponse, eventTypesResponse] = await Promise.all([
        calcomAPI.getBookings(),
        calcomAPI.getEventTypes()
      ]);
      setBookings(bookingsResponse.data.bookings || []);
      setEventTypes(eventTypesResponse.data.event_types || []);
    } catch (error: any) {
      console.error('Failed to load scheduling data:', error);
      alert('Failed to load scheduling data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
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

    setCancellingBooking(bookingId);
    try {
      await calcomAPI.cancelBooking(bookingId);
      await loadData();
      alert('Meeting cancelled successfully.');
    } catch (error: any) {
      console.error('Failed to cancel booking:', error);
      alert('Failed to cancel meeting. Please try again.');
    } finally {
      setCancellingBooking(null);
    }
  };

  const handleRescheduleBooking = async (bookingId: string) => {
    if (!newBookingDate || !newBookingTime) {
      alert('Please select both date and time for rescheduling.');
      return;
    }

    const newStartTime = `${newBookingDate}T${newBookingTime}:00`;
    
    setReschedulingBooking(bookingId);
    try {
      await calcomAPI.rescheduleBooking(bookingId, { start_time: newStartTime });
      await loadData();
      setReschedulingBooking(null);
      setNewBookingDate('');
      setNewBookingTime('');
      alert('Meeting rescheduled successfully.');
    } catch (error: any) {
      console.error('Failed to reschedule booking:', error);
      alert('Failed to reschedule meeting. Please try again.');
    } finally {
      setReschedulingBooking(null);
    }
  };

  const openMeetingLink = (meetingUrl: string | null) => {
    if (meetingUrl) {
      window.open(meetingUrl, '_blank');
    } else {
      alert('Meeting link not available.');
    }
  };

  const renderBookingCard = (booking: CalComBooking, showActions: boolean = true) => {
    const statusColors: Record<string, string> = {
      confirmed: '#10b981',
      cancelled: '#ef4444',
      rescheduled: '#f59e0b'
    };

    return (
      <div key={booking.id} className="booking-card">
        <div className="booking-header">
          <div>
            <h3>{booking.event_type || 'Meeting'}</h3>
            <p className="booking-date">{formatDateTime(booking.start_time)}</p>
          </div>
          <span 
            className="booking-status"
            style={{ backgroundColor: statusColors[booking.status] || '#6b7280' }}
          >
            {booking.status}
          </span>
        </div>
        
        {booking.notes && (
          <p className="booking-notes">{booking.notes}</p>
        )}

        {booking.meeting_url && (
          <button
            className="btn-primary btn-sm"
            onClick={() => openMeetingLink(booking.meeting_url)}
            style={{ marginTop: '0.5rem' }}
          >
            Join Google Meet
          </button>
        )}

        {showActions && isUpcoming(booking) && (
          <div className="booking-actions">
            <button
              className="btn-outline btn-sm"
              onClick={() => {
                setReschedulingBooking(booking.booking_id);
                const date = new Date(booking.start_time);
                setNewBookingDate(date.toISOString().split('T')[0]);
                setNewBookingTime(date.toTimeString().slice(0, 5));
              }}
              disabled={cancellingBooking === booking.booking_id}
            >
              Reschedule
            </button>
            <button
              className="btn-danger btn-sm"
              onClick={() => handleCancelBooking(booking.booking_id)}
              disabled={cancellingBooking === booking.booking_id}
            >
              {cancellingBooking === booking.booking_id ? 'Cancelling...' : 'Cancel'}
            </button>
          </div>
        )}

        {reschedulingBooking === booking.booking_id && (
          <div className="reschedule-form">
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                type="date"
                value={newBookingDate}
                onChange={(e) => setNewBookingDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <input
                type="time"
                value={newBookingTime}
                onChange={(e) => setNewBookingTime(e.target.value)}
              />
              <button
                className="btn-primary btn-sm"
                onClick={() => handleRescheduleBooking(booking.booking_id)}
                disabled={reschedulingBooking === booking.booking_id}
              >
                Confirm
              </button>
              <button
                className="btn-outline btn-sm"
                onClick={() => {
                  setReschedulingBooking(null);
                  setNewBookingDate('');
                  setNewBookingTime('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="scheduling-page">
        <div className="page-header">
          <h1>Schedule a Meeting</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Loading...</p>
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
              <div className="empty-state">
                <p>No upcoming meetings scheduled.</p>
                <button
                  className="btn-primary"
                  onClick={() => setActiveTab('book')}
                >
                  Schedule a Meeting
                </button>
              </div>
            ) : (
              <div className="bookings-grid">
                {upcomingBookings.map(booking => renderBookingCard(booking))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {pastBookings.length === 0 ? (
              <div className="empty-state">
                <p>No past meetings.</p>
              </div>
            ) : (
              <div className="bookings-grid">
                {pastBookings.map(booking => renderBookingCard(booking, false))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'book' && (
          <div className="booking-widget-container">
            <h2>Book a Meeting</h2>
            <p>Select an available time slot below or use the calendar widget to schedule your meeting.</p>
            
            {/* Cal.com Embed Widget */}
            <div className="calcom-widget">
              <iframe
                src={`https://cal.com/reel48`}
                style={{
                  width: '100%',
                  height: '700px',
                  border: 'none',
                  borderRadius: '8px'
                }}
                title="Cal.com Booking Widget"
              />
            </div>

            {eventTypes.length > 0 && (
              <div className="event-types">
                <h3>Available Meeting Types</h3>
                <ul>
                  {eventTypes.map(eventType => (
                    <li key={eventType.id}>
                      <strong>{eventType.title}</strong>
                      {eventType.description && <p>{eventType.description}</p>}
                      <span className="event-duration">{eventType.length} minutes</span>
                    </li>
                  ))}
                </ul>
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

