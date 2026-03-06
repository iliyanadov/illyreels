'use client';

import { useState, useEffect } from 'react';

interface LimitData {
  config: number;
  quota_usage: number;
}

export function PublishingLimit() {
  const [limit, setLimit] = useState<LimitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLimit = async () => {
    try {
      const res = await fetch('/api/meta/publishing-limit');
      if (!res.ok) {
        if (res.status === 401) {
          setLimit(null);
          setLoading(false);
          return;
        }
        throw new Error('Failed to fetch limit');
      }
      const data = await res.json();
      console.log('[PublishingLimit] Data:', data);
      setLimit(data);
      setError(null);
    } catch (err: any) {
      console.error('[PublishingLimit] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLimit();
    const interval = setInterval(fetchLimit, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/20 px-3 py-2 text-xs text-red-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {error}
      </div>
    );
  }

  if (!limit) {
    return null;
  }

  const config = Number(limit.config) || 25;
  const quotaUsage = Number(limit.quota_usage) || 0;
  const remaining = Math.max(0, config - quotaUsage);
  const percentage = (quotaUsage / config) * 100;

  // Color coding based on usage
  let barColor = 'bg-emerald-500';
  let textColor = 'text-emerald-400';
  if (percentage >= 100) {
    barColor = 'bg-red-500';
    textColor = 'text-red-400';
  } else if (percentage >= 80) {
    barColor = 'bg-yellow-500';
    textColor = 'text-yellow-400';
  } else if (percentage >= 50) {
    barColor = 'bg-blue-500';
    textColor = 'text-blue-400';
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      {/* Simple Instagram icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor"/>
        <circle cx="12" cy="12" r="3" fill="#18181b"/>
      </svg>

      {/* Text */}
      <div className="flex flex-col">
        <span className={`text-xs font-semibold ${textColor}`}>
          {quotaUsage} / {config} posts used today
        </span>
        <span className="text-[10px] text-zinc-500">
          {remaining} remaining
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-24 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-colors duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
