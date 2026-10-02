'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { FreshnessCategory } from '@/lib/types';

interface FreshnessIndicatorProps {
  updatedAt: string;
  className?: string;
  showIcon?: boolean;
}

export function getFreshnessInfo(updatedAtIso: string, currentTimeMs = Date.now()): {
  label: string;
  category: FreshnessCategory;
  minutesAgo: number;
} {
  const updatedTime = new Date(updatedAtIso).getTime();
  const diffMs = Math.max(0, currentTimeMs - updatedTime);
  const minutesAgo = Math.floor(diffMs / (1000 * 60));

  if (minutesAgo < 1) {
    return { label: 'Updated just now', category: 'fresh', minutesAgo: 0 };
  } else if (minutesAgo <= 5) {
    return { label: `Updated ${minutesAgo} min ago`, category: 'fresh', minutesAgo };
  } else if (minutesAgo <= 15) {
    return { label: `Updated ${minutesAgo} min ago`, category: 'recent', minutesAgo };
  } else if (minutesAgo <= 30) {
    return { label: `Updated ${minutesAgo} min ago`, category: 'aging', minutesAgo };
  } else {
    return { label: `Stale · ${minutesAgo} min ago`, category: 'stale', minutesAgo };
  }
}

export function FreshnessIndicator({
  updatedAt,
  className = '',
  showIcon = true
}: FreshnessIndicatorProps) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const info = useMemo(() => {
    // If not mounted yet, use updatedAt time as reference so SSR and initial client hydration match exactly
    if (!mounted) {
      return getFreshnessInfo(updatedAt, new Date(updatedAt).getTime() + 60000);
    }
    return getFreshnessInfo(updatedAt, now);
  }, [updatedAt, now, mounted]);

  const styleMap: Record<FreshnessCategory, { text: string; badge: string; dot: string; labelSuffix: string }> = {
    fresh: {
      text: 'text-emerald-700 dark:text-emerald-400',
      badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dot: 'bg-emerald-500',
      labelSuffix: '(Fresh)'
    },
    recent: {
      text: 'text-blue-700 dark:text-blue-400',
      badge: 'bg-blue-50 text-blue-800 border-blue-200',
      dot: 'bg-blue-500',
      labelSuffix: '(Recent)'
    },
    aging: {
      text: 'text-amber-700 dark:text-amber-400',
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
      labelSuffix: '(Aging)'
    },
    stale: {
      text: 'text-rose-700 dark:text-rose-400',
      badge: 'bg-rose-50 text-rose-800 border-rose-200',
      dot: 'bg-rose-500',
      labelSuffix: '(Stale)'
    }
  };

  const currentStyle = styleMap[info.category];

  return (
    <span
      suppressHydrationWarning
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${currentStyle.badge} ${className}`}
      title="Inventory freshness status"
      role="status"
      aria-label={`${info.label} ${currentStyle.labelSuffix}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${currentStyle.dot}`} aria-hidden="true" />
      {showIcon && <Clock className="w-3 h-3 opacity-70" aria-hidden="true" />}
      <span suppressHydrationWarning>{info.label}</span>
    </span>
  );
}
