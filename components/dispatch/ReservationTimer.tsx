'use client';

import React, { useEffect, useState } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';

interface ReservationTimerProps {
  expiresAt: string;
  onExpire?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ReservationTimer({
  expiresAt,
  onExpire,
  className = '',
  size = 'md'
}: ReservationTimerProps) {
  const [mounted, setMounted] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(120);

  useEffect(() => {
    setMounted(true);
    const calculate = () => {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      const remaining = Math.max(0, diff);
      setSecondsRemaining(remaining);
      if (remaining === 0 && onExpire) {
        onExpire();
      }
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const displaySeconds = mounted ? secondsRemaining : 120;
  const mins = Math.floor(displaySeconds / 60);
  const secs = displaySeconds % 60;
  const formattedTime = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

  const isCritical = displaySeconds <= 30 && displaySeconds > 0;
  const isExpired = mounted && displaySeconds === 0;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-xl font-bold px-4 py-2'
  };

  return (
    <div
      suppressHydrationWarning
      className={`inline-flex items-center gap-1.5 rounded-md font-mono font-semibold transition-colors ${
        isExpired
          ? 'bg-rose-100 text-rose-800 border border-rose-300'
          : isCritical
          ? 'bg-amber-100 text-amber-900 border border-amber-400 animate-pulse'
          : 'bg-blue-50 text-blue-900 border border-blue-200'
      } ${sizeClasses[size]} ${className}`}
      role="timer"
      aria-live="polite"
      aria-label={`Reservation countdown: ${formattedTime} remaining`}
    >
      {isCritical ? (
        <AlertTriangle className="w-4 h-4 text-amber-700" aria-hidden="true" />
      ) : (
        <Timer className="w-4 h-4 text-current opacity-80" aria-hidden="true" />
      )}
      <span suppressHydrationWarning>{isExpired ? '00:00 (EXPIRED)' : formattedTime}</span>
    </div>
  );
}
