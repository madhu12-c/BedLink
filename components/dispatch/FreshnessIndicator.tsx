'use client';

import { useHydrated } from '@/lib/utils/useHydrated';
import React, { useEffect, useState, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { FreshnessCategory } from '@/lib/types';
import { serverNow } from '@/lib/utils/serverClock';

interface FreshnessIndicatorProps {
  updatedAt: string;
  className?: string;
  showIcon?: boolean;
  /** Small coloured text on one line ("19 min ago"), for tight rows on phones */
  compact?: boolean;
}

export function getFreshnessInfo(updatedAtIso: string, currentTimeMs = serverNow()): {
  label: string;
  category: FreshnessCategory;
  minutesAgo: number;
} {
  const updatedTime = new Date(updatedAtIso).getTime();
  const diffMs = Math.max(0, currentTimeMs - updatedTime);
  const minutesAgo = Math.floor(diffMs / (1000 * 60));

  if (minutesAgo < 1) {
    return { label: 'Updated just now', category: 'fresh', minutesAgo: 0 };
  }

  let timeAgoText = '';
  if (minutesAgo < 60) {
    timeAgoText = `${minutesAgo} min ago`;
  } else if (minutesAgo < 1440) {
    const hours = Math.floor(minutesAgo / 60);
    const mins = minutesAgo % 60;
    timeAgoText = mins > 0 ? `${hours} hr ${mins} min ago` : `${hours} ${hours === 1 ? 'hr' : 'hrs'} ago`;
  } else {
    const days = Math.floor(minutesAgo / 1440);
    const remHours = Math.floor((minutesAgo % 1440) / 60);
    timeAgoText = remHours > 0 ? `${days} ${days === 1 ? 'day' : 'days'} ${remHours} hr ago` : `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }

  if (minutesAgo <= 5) {
    return { label: `Updated ${timeAgoText}`, category: 'fresh', minutesAgo };
  } else if (minutesAgo <= 15) {
    return { label: `Updated ${timeAgoText}`, category: 'recent', minutesAgo };
  } else if (minutesAgo <= 30) {
    return { label: `Updated ${timeAgoText}`, category: 'aging', minutesAgo };
  } else {
    return { label: `Stale · ${timeAgoText}`, category: 'stale', minutesAgo };
  }
}

export function FreshnessIndicator({
  updatedAt,
  className = '',
  showIcon = true,
  compact = false
}: FreshnessIndicatorProps) {
  const mounted = useHydrated();
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(serverNow());
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
      text: 'text-emerald-700 dark:text-emerald-400',
      badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dot: 'bg-emerald-400',
      labelSuffix: '(Recent)'
    },
    aging: {
      text: 'text-amber-700 dark:text-amber-400',
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
      labelSuffix: '(Aging)'
    },
    stale: {
      text: 'text-red-700 dark:text-red-400',
      badge: 'bg-red-50 text-red-800 border-red-200',
      dot: 'bg-red-500',
      labelSuffix: '(Stale)'
    }
  };

  const currentStyle = styleMap[info.category];

  if (compact) {
    return (
      <span
        suppressHydrationWarning
        className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${currentStyle.text} ${className}`}
        title="How old this bed count is"
        role="status"
        aria-label={`${info.label} ${currentStyle.labelSuffix}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${currentStyle.dot}`} aria-hidden="true" />
        <span suppressHydrationWarning>
          {info.category === 'stale' ? 'Old: ' : ''}
          {info.label.replace(/^Updated /, '').replace(/^Stale · /, '')}
        </span>
      </span>
    );
  }

  return (
    <span
      suppressHydrationWarning
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${currentStyle.badge} ${className}`}
      title="How old this bed count is"
      role="status"
      aria-label={`${info.label} ${currentStyle.labelSuffix}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${currentStyle.dot}`} aria-hidden="true" />
      {showIcon && <Clock className="w-3 h-3 opacity-70" aria-hidden="true" />}
      <span suppressHydrationWarning>{info.label}</span>
    </span>
  );
}
