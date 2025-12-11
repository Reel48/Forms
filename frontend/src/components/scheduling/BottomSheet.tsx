import { useEffect, useRef } from 'react';
import './BottomSheet.css';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export default function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const currentY = useRef<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!sheetRef.current) return;
    const touch = e.touches[0];
    startY.current = touch.clientY;
    currentY.current = touch.clientY;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current || startY.current === null) return;
    
    const touch = e.touches[0];
    currentY.current = touch.clientY;
    const deltaY = currentY.current - startY.current;
    
    // Only allow downward swipes
    if (deltaY > 0) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current || !sheetRef.current || startY.current === null || currentY.current === null) {
      isDragging.current = false;
      return;
    }

    const deltaY = currentY.current - startY.current;
    const threshold = 100; // Minimum swipe distance to close

    if (deltaY > threshold) {
      onClose();
    } else {
      // Snap back
      sheetRef.current.style.transform = 'translateY(0)';
    }

    isDragging.current = false;
    startY.current = null;
    currentY.current = null;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="bottom-sheet-overlay" onClick={onClose} />
      <div
        ref={sheetRef}
        className="bottom-sheet"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="bottom-sheet-handle" />
        {title && (
          <div className="bottom-sheet-header">
            <h3>{title}</h3>
            <button className="bottom-sheet-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        )}
        <div className="bottom-sheet-content">
          {children}
        </div>
      </div>
    </>
  );
}

