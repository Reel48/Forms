import { useRef, useState, useEffect } from 'react';
import type { CalComBooking } from '../../api';
import EnhancedBookingCard from './EnhancedBookingCard';
import './SwipeableBookingCard.css';

interface SwipeableBookingCardProps {
  booking: CalComBooking;
  showActions?: boolean;
  onCancel?: (bookingId: string) => void;
  onReschedule?: (bookingId: string) => void;
  onJoinMeeting?: (meetingUrl: string) => void;
  timezone?: string;
  isMobile?: boolean;
}

export default function SwipeableBookingCard({
  booking,
  showActions = true,
  onCancel,
  onReschedule,
  onJoinMeeting,
  timezone,
  isMobile = false
}: SwipeableBookingCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const currentX = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || !showActions) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    currentX.current = touch.clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !showActions || startX.current === null) return;
    
    const touch = e.touches[0];
    currentX.current = touch.clientX;
    const deltaX = currentX.current - startX.current;
    
    // Only allow left swipe (negative delta)
    if (deltaX < 0) {
      const maxSwipe = -120; // Maximum swipe distance
      const offset = Math.max(deltaX, maxSwipe);
      setSwipeOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (!isMobile || !showActions || startX.current === null) return;

    const threshold = -60; // Minimum swipe to reveal actions
    
    if (swipeOffset < threshold) {
      // Reveal actions
      setSwipeOffset(-120);
    } else {
      // Snap back
      setSwipeOffset(0);
    }

    startX.current = null;
    currentX.current = null;
  };

  const handleResetSwipe = () => {
    setSwipeOffset(0);
  };

  // Reset swipe on window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSwipeOffset(0);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isMobile) {
    return (
      <EnhancedBookingCard
        booking={booking}
        showActions={showActions}
        onCancel={onCancel}
        onReschedule={onReschedule}
        onJoinMeeting={onJoinMeeting}
        timezone={timezone}
      />
    );
  }

  return (
    <div className="swipeable-card-container">
      <div
        ref={cardRef}
        className="swipeable-card"
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <EnhancedBookingCard
          booking={booking}
          showActions={false}
          onJoinMeeting={onJoinMeeting}
          timezone={timezone}
        />
      </div>
      {showActions && (
        <div className="swipeable-actions">
          {onReschedule && (
            <button
              className="swipe-action-btn swipe-action-reschedule"
              onClick={() => {
                handleResetSwipe();
                onReschedule(booking.booking_id);
              }}
            >
              Reschedule
            </button>
          )}
          {onCancel && (
            <button
              className="swipe-action-btn swipe-action-cancel"
              onClick={() => {
                handleResetSwipe();
                onCancel(booking.booking_id);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

