import React from 'react';
import { Button } from './ui/button';
import { useSound } from '../contexts/SoundContext';

// Button with hover sound for important interactions
export const SoundButton = React.forwardRef(({ 
  children, 
  onMouseEnter, 
  onClick,
  enableHoverSound = true,
  effectOnClick = null, // 'click', 'spin', 'purchase', etc.
  ...props 
}, ref) => {
  const { playHoverSound, playEffect, handleUserInteraction } = useSound();

  const handleMouseEnter = (e) => {
    if (enableHoverSound) {
      playHoverSound();
    }
    onMouseEnter?.(e);
  };

  const handleClick = (e) => {
    handleUserInteraction();
    if (effectOnClick) {
      playEffect(effectOnClick);
    }
    onClick?.(e);
  };

  return (
    <Button
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      {...props}
    >
      {children}
    </Button>
  );
});

SoundButton.displayName = 'SoundButton';

export default SoundButton;
