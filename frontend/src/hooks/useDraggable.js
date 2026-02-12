import { useState, useCallback, useRef, useEffect } from 'react';

// Layout constants
const NAVBAR_HEIGHT = 64;
const FOOTER_HEIGHT = 56;
const PANEL_MARGIN = 8;

/**
 * Custom hook for making elements draggable within bounded areas
 * Constrains movement between navbar and footer
 */
export const useDraggable = (initialPosition = { x: null, y: null }) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  // Calculate bounds based on viewport
  const getBounds = useCallback((elementWidth, elementHeight) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    return {
      minX: PANEL_MARGIN,
      maxX: viewportWidth - elementWidth - PANEL_MARGIN,
      minY: NAVBAR_HEIGHT + PANEL_MARGIN,
      maxY: viewportHeight - FOOTER_HEIGHT - elementHeight - PANEL_MARGIN
    };
  }, []);

  // Constrain position within bounds
  const constrainPosition = useCallback((x, y, width, height) => {
    const bounds = getBounds(width, height);
    return {
      x: Math.min(Math.max(x, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(y, bounds.minY), bounds.maxY)
    };
  }, [getBounds]);

  // Handle mouse/touch down
  const handleDragStart = useCallback((e) => {
    if (!dragRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    
    const rect = dragRef.current.getBoundingClientRect();
    offsetRef.current = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
    
    setIsDragging(true);
  }, []);

  // Handle mouse/touch move
  const handleDragMove = useCallback((e) => {
    if (!isDragging || !dragRef.current) return;
    
    e.preventDefault();
    
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    
    const rect = dragRef.current.getBoundingClientRect();
    const newX = clientX - offsetRef.current.x;
    const newY = clientY - offsetRef.current.y;
    
    const constrained = constrainPosition(newX, newY, rect.width, rect.height);
    setPosition(constrained);
  }, [isDragging, constrainPosition]);

  // Handle mouse/touch up
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add/remove event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleDragMove, { passive: false });
      document.addEventListener('touchend', handleDragEnd);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchmove', handleDragMove);
      document.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Handle window resize to keep panel in bounds
  useEffect(() => {
    const handleResize = () => {
      if (dragRef.current && position.x !== null && position.y !== null) {
        const rect = dragRef.current.getBoundingClientRect();
        const constrained = constrainPosition(position.x, position.y, rect.width, rect.height);
        if (constrained.x !== position.x || constrained.y !== position.y) {
          setPosition(constrained);
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, constrainPosition]);

  return {
    position,
    setPosition,
    isDragging,
    dragRef,
    handleDragStart,
    NAVBAR_HEIGHT,
    FOOTER_HEIGHT,
    constrainPosition
  };
};

export { NAVBAR_HEIGHT, FOOTER_HEIGHT };
