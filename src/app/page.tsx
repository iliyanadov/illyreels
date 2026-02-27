'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { TikTokCanvas, TikTokCanvasRef } from './components/TikTokCanvas';

interface Author {
  uniqueId: string;
  nickname: string;
  avatarThumb: string;
}

interface VideoData {
  id: string;
  title: string;
  cover: string;
  author: Author;
  play: string;       // SD, no watermark
  wmplay: string;     // SD, with watermark
  hdplay: string;     // HD, no watermark
  duration: number;
  size: number;
  images?: string[];  // for photo/image posts
}

interface Market {
  accounts: Record<string, any>;
  canCloseEarly: boolean;
  closeTime: number;
  eventTicker: string;
  expirationTime: number;
  marketType: string;
  noSubTitle: string;
  openInterest: number;
  openTime: number;
  result: string;
  rulesPrimary: string;
  status: string;
  subtitle: string;
  ticker: string;
  title: string;
  volume: number;
  yesSubTitle: string;
  earlyCloseCondition?: string;
  noAsk?: string;
  noBid?: string;
  rulesSecondary?: string;
  yesAsk?: string;
  yesBid?: string;
}

interface SettlementSource {
  name: string;
  url: string;
}

interface EventData {
  seriesTicker: string;
  subtitle: string;
  ticker: string;
  title: string;
  competition: string | null;
  competitionScope: string | null;
  imageUrl: string;
  liquidity: number;
  markets: Market[];
  openInterest: number;
  settlementSources: SettlementSource[];
  strikeDate: number;
  strikePeriod: string;
  volume: number;
  volume24h: number;
}

interface VideoEntry {
  id: string;
  url: string;
  caption: string;
  eventId: string;
  data: VideoData | null;
  marketData: EventData | null;
  loading: boolean;
  loadingMarket: boolean;
  error: string;
  marketError: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function proxyUrl(url: string, filename: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

function proxyStreamUrl(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}&stream=1`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Home() {
  const [entries, setEntries] = useState<VideoEntry[]>([
    { id: '1', url: '', caption: '', eventId: '', data: null, marketData: null, loading: false, loadingMarket: false, error: '', marketError: '' }
  ]);
  
  // Store refs for each canvas to trigger downloads
  const canvasRefsMap = useRef<Map<string, TikTokCanvasRef>>(new Map());

  function addRow() {
    setEntries([...entries, { 
      id: Date.now().toString(), 
      url: '', 
      caption: '', 
      eventId: '',
      data: null, 
      marketData: null,
      loading: false, 
      loadingMarket: false,
      error: '',
      marketError: ''
    }]);
  }

  function removeRow(id: string) {
    if (entries.length === 1) return; // Keep at least one row
    setEntries(entries.filter(e => e.id !== id));
  }

  function updateEntry(id: string, field: 'url' | 'caption' | 'eventId', value: string) {
    setEntries(entries.map(e => e.id === id ? { ...e, [field]: value } : e));
  }

  async function fetchMarket(id: string) {
    const entry = entries.find(e => e.id === id);
    if (!entry || !entry.eventId.trim()) return;

    setEntries(entries.map(e => 
      e.id === id ? { ...e, loadingMarket: true, marketError: '', marketData: null } : e
    ));

    try {
      // Use our Next.js API route to avoid CORS issues
      const res = await fetch(`/api/market?eventId=${encodeURIComponent(entry.eventId.trim())}&withNestedMarkets=true`);
      
      console.log('Response status:', res.status);
      
      const json = await res.json();
      console.log('Response data:', json);
      
      setEntries(entries.map(e => 
        e.id === id ? { 
          ...e, 
          loadingMarket: false, 
          marketError: res.ok ? '' : (json.error || json.message || `Error ${res.status}: Failed to fetch market data`),
          marketData: res.ok ? json : null 
        } : e
      ));
    } catch (error) {
      console.error('Fetch error:', error);
      setEntries(entries.map(e => 
        e.id === id ? { ...e, loadingMarket: false, marketError: 'Network error — please try again' } : e
      ));
    }
  }

  async function fetchVideo(id: string) {
    const entry = entries.find(e => e.id === id);
    if (!entry || !entry.url.trim()) return;
    if (!entry.caption.trim()) {
      setEntries(entries.map(e =>
        e.id === id ? { ...e, error: 'Caption is required' } : e
      ));
      return;
    }

    setEntries(entries.map(e =>
      e.id === id ? { ...e, loading: true, error: '', data: null } : e
    ));

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: entry.url.trim() }),
      });
      const json = await res.json();
      
      setEntries(entries.map(e => 
        e.id === id ? { 
          ...e, 
          loading: false, 
          error: res.ok ? '' : (json.error || 'Something went wrong'),
          data: res.ok ? json : null 
        } : e
      ));
    } catch {
      setEntries(entries.map(e => 
        e.id === id ? { ...e, loading: false, error: 'Network error — please try again' } : e
      ));
    }
  }

  async function fetchAllVideos() {
    // Fetch all entries that have URLs but no data yet
    const promises = entries
      .filter(e => e.url.trim() && !e.data && !e.loading)
      .map(e => fetchVideo(e.id));
    
    await Promise.all(promises);
  }

  async function downloadAll() {
    // Get all entries with fetched video data
    const entriesToDownload = entries.filter(e => e.data && !e.loading && !(e.data.images && e.data.images.length > 0));
    
    // Download each video sequentially, waiting for each to complete
    for (const entry of entriesToDownload) {
      const canvasRef = canvasRefsMap.current.get(entry.id);
      if (canvasRef) {
        try {
          // Wait for the current download to fully complete before moving to next
          await canvasRef.startDownload();
          // Add a small delay between downloads
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Failed to download video ${entry.id}:`, error);
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-4 py-16">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#010101"/>
            <path d="M21.5 7h-3.2v12.3c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9 1.3-2.9 2.9-2.9c.3 0 .6 0 .9.1V13c-.3 0-.6-.1-.9-.1-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6V12.7c1.1.8 2.5 1.3 4 1.3v-3.2c-2.2 0-3.9-1.7-3.9-3.8z" fill="#fff"/>
          </svg>
          <h1 className="text-3xl font-bold tracking-tight">TikTok Downloader</h1>
        </div>
        <p className="text-zinc-400 text-sm max-w-sm">
          Download TikTok videos &amp; images — with or without watermark
        </p>
      </div>

      {/* Video Table */}
      <div className="w-full max-w-6xl">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Video URL
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Caption
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Event ID
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider w-32">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={entry.id} className="border-b border-zinc-800 last:border-b-0">
                    <td className="px-4 py-3">
                      <input
                        type="url"
                        value={entry.url}
                        onChange={e => updateEntry(entry.id, 'url', e.target.value)}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                            e.preventDefault();
                          }
                        }}
                        placeholder="Paste TikTok URL..."
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#fe2c55] transition-colors"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={entry.caption}
                        onChange={e => updateEntry(entry.id, 'caption', e.target.value)}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                            e.preventDefault();
                          }
                        }}
                        disabled={entry.data !== null}
                        placeholder="Caption (required)..."
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={entry.eventId}
                          onChange={e => updateEntry(entry.id, 'eventId', e.target.value)}
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                              e.preventDefault();
                            }
                          }}
                          placeholder="Event ticker..."
                          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
                        />
                        <button
                          onClick={() => fetchMarket(entry.id)}
                          disabled={!entry.eventId.trim() || entry.loadingMarket}
                          className="rounded-lg border border-blue-700 bg-blue-950/20 px-3 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-950/40 hover:border-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {entry.loadingMarket ? 'Loading...' : 'Fetch'}
                        </button>
                      </div>
                      {entry.marketError && (
                        <p className="mt-1 text-xs text-red-400">{entry.marketError}</p>
                      )}
                      {entry.marketData && (
                        <p className="mt-1 text-xs text-green-400">✓ {entry.marketData.title}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => fetchVideo(entry.id)}
                          disabled={entry.loading || !entry.url.trim()}
                          className="rounded-lg bg-[#fe2c55] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {entry.loading ? '...' : 'Fetch'}
                        </button>
                        {entries.length > 1 && (
                          <button
                            onClick={() => removeRow(entry.id)}
                            className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs font-semibold text-zinc-400 hover:border-red-500 hover:text-red-400 transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Table footer with actions */}
          <div className="border-t border-zinc-800 px-4 py-3 flex items-center justify-between bg-zinc-900/50">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-500 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              Add Row
            </button>
            <button
              onClick={fetchAllVideos}
              disabled={entries.every(e => !e.url.trim() || e.data || e.loading)}
              className="rounded-lg bg-[#fe2c55] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Fetch All Videos
            </button>
          </div>
        </div>

        {/* Show errors */}
        {entries.some(e => e.error) && (
          <div className="mt-4 space-y-2">
            {entries.map(entry => entry.error && (
              <div key={entry.id} className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
                <strong>Row {entries.indexOf(entry) + 1}:</strong> {entry.error}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Render all canvases for fetched videos in a grid */}
      {entries.filter(e => e.data && !e.loading && !(e.data.images && e.data.images.length > 0)).length > 0 && (
        <div className="w-full max-w-[1800px] mt-8">
          {/* Download All Button */}
          <div className="flex justify-center mb-4">
            <button
              onClick={downloadAll}
              className="flex items-center gap-2 rounded-lg bg-[#fe2c55] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download All Videos
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {entries.filter(e => e.data && !e.loading && !(e.data.images && e.data.images.length > 0)).map((entry, index) => (
              <div key={entry.id} className="flex flex-col">
                <TikTokCanvas
                  ref={(ref) => {
                    if (ref) {
                      canvasRefsMap.current.set(entry.id, ref);
                    } else {
                      canvasRefsMap.current.delete(entry.id);
                    }
                  }}
                  videoSrc={proxyStreamUrl(entry.data!.hdplay || entry.data!.play || entry.data!.wmplay)}
                  videoId={entry.data!.id}
                  overlayCaption={entry.caption}
                  eventId={entry.eventId}
                  marketData={entry.marketData}
                />

                <button
                  onClick={() => removeRow(entry.id)}
                  className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-red-700 bg-red-950/20 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-950/40 hover:border-red-600 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-600 text-center max-w-sm">
        For personal use only. Respect TikTok&apos;s terms of service and content creators&apos; rights.
      </p>

    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
