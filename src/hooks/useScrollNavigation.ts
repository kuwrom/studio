import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from './use-mobile';

export interface UseScrollNavigationProps {
  isExpanded: boolean;
  onToggle: (expanded: boolean) => void;
  scrollThreshold?: number;
  autoExpandCondition?: boolean;
}

export function useScrollNavigation({
  isExpanded,
  onToggle,
  scrollThreshold = 50,
  autoExpandCondition = false,
}: UseScrollNavigationProps) {
  const isMobile = useIsMobile();
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);

  // Enhanced touch start handler
  const handleTouchStart = useCallback((e: React.TouchEvent, scrollableRef?: React.RefObject<HTMLElement>) => {
    if (!isMobile) return;
    
    const touch = e.touches[0];
    const currentScrollTop = scrollableRef?.current?.scrollTop || 0;
    
    setStartY(touch.clientY);
    setScrollTop(currentScrollTop);
    setIsDragging(true);
    
    touchStartRef.current = {
      y: touch.clientY,
      scrollTop: currentScrollTop,
    };
  }, [isMobile]);

  // Enhanced touch move handler
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !touchStartRef.current || !isMobile) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Only collapse when scrolled to top and swiping down
    if (isExpanded && deltaY > scrollThreshold && touchStartRef.current.scrollTop <= 5) {
      onToggle(false);
      setIsDragging(false);
      touchStartRef.current = null;
    }
  }, [isDragging, isExpanded, scrollThreshold, onToggle, isMobile]);

  // Touch end handler
  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    touchStartRef.current = null;
  }, []);

  // Smooth scroll to top when expanding
  const scrollToTop = useCallback((element?: HTMLElement) => {
    if (element) {
      element.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, []);

  // Auto-expand with delay for better UX
  useEffect(() => {
    if (autoExpandCondition && !isExpanded) {
      const timer = setTimeout(() => {
        onToggle(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoExpandCondition, isExpanded, onToggle]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isExpanded) {
        onToggle(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, onToggle]);

  return {
    isDragging,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    scrollToTop,
    isMobile,
  };
} 