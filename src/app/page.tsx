'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { TikTokCanvas, TikTokCanvasRef } from './components/TikTokCanvas';

// Check for Google OAuth tokens in URL on mount
function getGoogleTokensFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('google_access_token');
  const refreshToken = params.get('google_refresh_token');
  if (accessToken) {
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    return { accessToken, refreshToken: refreshToken || undefined };
  }
  return null;
}

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
  tag: string;
  change: string;
  data: VideoData | null;
  marketData: EventData | null;
  loading: boolean;
  loadingMarket: boolean;
  error: string;
  marketError: string;
  videoFailed: boolean; // Track if video failed to load in canvas
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function proxyUrl(url: string, filename: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

function proxyStreamUrl(url: string): string {
  // Properly encode the URL for the query parameter
  return `/api/proxy?stream=1&url=${encodeURIComponent(url)}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Tag to Event ID mapping
const TAG_TO_EVENT_ID: Record<string, string> = {
  'film': 'KXENGAGEMENTTIMOTHEEKYLIE-26',
};

export default function Home() {
  const [entries, setEntries] = useState<VideoEntry[]>([
    { id: '1', url: '', caption: '', tag: '', change: '', data: null, marketData: null, loading: false, loadingMarket: false, error: '', marketError: '', videoFailed: false }
  ]);

  // Store refs for each canvas to trigger downloads
  const canvasRefsMap = useRef<Map<string, TikTokCanvasRef>>(new Map());

  // Brand toggle: 'sonotrade' | 'forum'
  const [brandMode, setBrandMode] = useState<'sonotrade' | 'forum'>('sonotrade');

  // Google Sheets state
  const [googleToken, setGoogleToken] = useState<{ accessToken: string; refreshToken?: string } | null>(null);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState('1z9KIhjPJFo9rOJ4CDW-y7W9W4MEm8Lso-EsFRknbv5w');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [startRow, setStartRow] = useState('4');
  const [endRow, setEndRow] = useState('32');
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheetsError, setSheetsError] = useState('');

  // Check for OAuth tokens on mount
  useEffect(() => {
    const tokens = getGoogleTokensFromUrl();
    if (tokens) {
      setGoogleToken(tokens);
    }
  }, []);

  function addRow() {
    setEntries([...entries, {
      id: Date.now().toString(),
      url: '',
      caption: '',
      tag: '',
      change: '',
      data: null,
      marketData: null,
      loading: false,
      loadingMarket: false,
      error: '',
      marketError: '',
      videoFailed: false
    }]);
  }

  function removeRow(id: string) {
    if (entries.length === 1) return; // Keep at least one row
    setEntries(entries.filter(e => e.id !== id));
  }

  function resetEverything() {
    setEntries([
      { id: '1', url: '', caption: '', tag: '', change: '', data: null, marketData: null, loading: false, loadingMarket: false, error: '', marketError: '', videoFailed: false }
    ]);
  }

  function handleVideoError(id: string) {
    setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, videoFailed: true } : e
    ));
  }

  function updateEntry(id: string, field: 'url' | 'caption' | 'tag' | 'change', value: string) {
    setEntries(prevEntries => prevEntries.map(e => e.id === id ? { ...e, [field]: value } : e));
  }

  async function fetchMarket(id: string) {
    // Get the tag BEFORE any state updates
    const entry = entries.find(e => e.id === id);
    if (!entry || !entry.tag.trim()) return;

    const tag = entry.tag.trim().toLowerCase();
    const eventId = TAG_TO_EVENT_ID[tag];

    if (!eventId) {
      setEntries(prevEntries => prevEntries.map(e =>
        e.id === id ? { ...e, loadingMarket: false, marketError: `Unknown tag: ${tag}` } : e
      ));
      return;
    }

    console.log('Fetching market for tag:', tag, '→ eventId:', eventId);

    // Set loading state
    setEntries(prevEntries => prevEntries.map(e =>
      e.id === id ? { ...e, loadingMarket: true, marketError: '', marketData: null, videoFailed: false } : e
    ));

    try {
      // Use our Next.js API route to avoid CORS issues
      const res = await fetch(`/api/market?eventId=${encodeURIComponent(eventId)}&withNestedMarkets=true`);

      console.log('Response status:', res.status);

      const json = await res.json();
      console.log('Response data:', json);

      setEntries(prevEntries => prevEntries.map(e =>
        e.id === id ? {
          ...e,
          loadingMarket: false,
          marketError: res.ok ? '' : (json.error || json.message || `Error ${res.status}: Failed to fetch market data`),
          marketData: res.ok ? json : null
        } : e
      ));
    } catch (error) {
      console.error('Fetch error:', error);
      setEntries(prevEntries => prevEntries.map(e =>
        e.id === id ? { ...e, loadingMarket: false, marketError: 'Network error — please try again' } : e
      ));
    }
  }

  async function fetchVideo(id: string) {
    // Get current entry data before any async operations
    const currentEntry = entries.find(e => e.id === id);

    if (!currentEntry || !currentEntry.url.trim()) {
      setEntries(prev => prev.map(e =>
        e.id === id ? { ...e, error: 'URL is required' } : e
      ));
      return;
    }

    if (!currentEntry.caption.trim()) {
      setEntries(prev => prev.map(e =>
        e.id === id ? { ...e, error: 'Caption is required' } : e
      ));
      return;
    }

    // Set loading state for both video and market (skip market in forum mode)
    setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, loading: true, loadingMarket: brandMode !== 'forum' && !!e.tag.trim(), error: '', data: null, marketData: null, marketError: '', videoFailed: false } : e
    ));

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: currentEntry.url.trim() }),
      });

      const json = await res.json();

      setEntries(prev => prev.map(e =>
        e.id === id ? {
          ...e,
          loading: false,
          error: res.ok ? '' : (json.error || 'Something went wrong'),
          data: res.ok ? json : null,
          videoFailed: false
        } : e
      ));
    } catch (err) {
      console.error('Fetch video error:', err);
      setEntries(prev => prev.map(e =>
        e.id === id ? { ...e, loading: false, error: 'Network error — please try again', loadingMarket: false } : e
      ));
      return;
    }

    // Fetch market data if tag is present (skip in forum mode)
    const entry = entries.find(e => e.id === id);
    if (brandMode !== 'forum' && entry?.tag.trim()) {
      const tag = entry.tag.trim().toLowerCase();
      const eventId = TAG_TO_EVENT_ID[tag];

      if (eventId) {
        console.log('Fetching market for tag:', tag, '→ eventId:', eventId);
        try {
          const res = await fetch(`/api/market?eventId=${encodeURIComponent(eventId)}&withNestedMarkets=true`);
          const json = await res.json();
          setEntries(prev => prev.map(e =>
            e.id === id ? {
              ...e,
              loadingMarket: false,
              marketError: res.ok ? '' : (json.error || json.message || `Error ${res.status}: Failed to fetch market data`),
              marketData: res.ok ? json : null
            } : e
          ));
        } catch (error) {
          console.error('Fetch market error:', error);
          setEntries(prev => prev.map(e =>
            e.id === id ? { ...e, loadingMarket: false, marketError: 'Network error' } : e
          ));
        }
      } else {
        setEntries(prev => prev.map(e =>
          e.id === id ? { ...e, loadingMarket: false, marketError: `Unknown tag: ${tag}` } : e
        ));
      }
    }
  }

  async function fetchAllVideos() {
    // Get all entries that need fetching
    const entriesToFetch = entries.filter(e =>
      e.url.trim() && e.caption.trim() && !e.data && !e.loading
    );

    if (entriesToFetch.length === 0) {
      // Show error if no valid entries
      const entriesWithoutCaption = entries.filter(e => e.url.trim() && !e.caption.trim());
      if (entriesWithoutCaption.length > 0) {
        setEntries(prevEntries => prevEntries.map(e =>
          entriesWithoutCaption.some(ne => ne.id === e.id)
            ? { ...e, error: 'Caption is required' }
            : e
        ));
      }
      return;
    }

    // Fetch sequentially to avoid rate limiting
    for (const entry of entriesToFetch) {
      await fetchVideo(entry.id);
      // Delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
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

  async function connectGoogle() {
    // Get OAuth URL from our API
    const res = await fetch('/api/google/auth');
    const data = await res.json();
    if (data.authUrl) {
      window.location.href = data.authUrl;
    }
  }

  async function importFromSheets() {
    if (!googleToken || !spreadsheetId.trim()) {
      setSheetsError('Please provide a spreadsheet ID');
      return;
    }

    setLoadingSheets(true);
    setSheetsError('');

    try {
      const res = await fetch(
        `/api/google/sheets?access_token=${encodeURIComponent(googleToken.accessToken)}&spreadsheet_id=${encodeURIComponent(spreadsheetId.trim())}&start_row=${startRow}&end_row=${endRow}&sheet_name=${encodeURIComponent(sheetName.trim())}`
      );

      const data = await res.json();

      if (!res.ok) {
        setSheetsError(data.error || 'Failed to fetch spreadsheet data');
        setLoadingSheets(false);
        return;
      }

      // Create new entries from the imported data
      const newEntries = data.rows.map((row: any) => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
        url: row.url,
        caption: row.caption,
        tag: row.tag || '',
        change: row.change || '',
        data: null,
        marketData: null,
        loading: false,
        loadingMarket: false,
        error: '',
        marketError: '',
        videoFailed: false
      }));

      // Replace current entries with imported ones
      setEntries(newEntries.length > 0 ? newEntries : [
        { id: '1', url: '', caption: '', tag: '', data: null, marketData: null, loading: false, loadingMarket: false, error: '', marketError: '', videoFailed: false }
      ]);

      setShowSheetsModal(false);
    } catch (error) {
      setSheetsError('Network error — please try again');
    } finally {
      setLoadingSheets(false);
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

        {/* Google Sheets Import */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {googleToken ? (
            <>
              <span className="text-xs text-green-400">✓ Connected to Google Sheets</span>
              <button
                onClick={() => setShowSheetsModal(true)}
                className="rounded-lg border border-green-700 bg-green-950/20 px-4 py-2 text-xs font-semibold text-green-400 hover:bg-green-950/40 hover:border-green-600 transition-colors"
              >
                Import from Sheets
              </button>
              <button
                onClick={() => setGoogleToken(null)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-400 hover:border-red-500 hover:text-red-400 transition-colors"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={connectGoogle}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.98 7.447c.078-.444-.137-.795-.382-1.077-.266-.308-.628-.464-1.021-.464l-6.57.003-2.048-6.095C12.011.346 11.77.174 11.495.174c-.277 0-.518.172-.564.64L8.882 6.91l-6.57.003c-.394 0-.755.156-1.021.464-.245.282-.46.633-.382 1.077l2.13 6.326-5.477 4.364c-.27.215-.384.528-.303.85.078.31.309.564.637.681l6.354 2.22 2.042 6.076c.085.25.29.419.527.419.236 0 .44-.17.527-.42l2.042-6.075 6.354-2.22c.328-.117.56-.372.637-.682.081-.322-.033-.635-.303-.85l-5.477-4.364 2.13-6.326zM11.495 18.17l-1.63 4.846-1.63-4.846-5.083-1.776 4.38-3.493-1.708-5.074h5.241v-.002l.001.002 1.63-4.846 1.629 4.846h5.241l-1.708 5.074 4.38 3.493-5.083 1.776z"/>
              </svg>
              Connect Google Sheets
            </button>
          )}
          <div className="w-px h-6 bg-zinc-800 mx-1"></div>
          <button
            onClick={resetEverything}
            className="rounded-lg border border-orange-700 bg-orange-950/20 px-4 py-2 text-xs font-semibold text-orange-400 hover:bg-orange-950/40 hover:border-orange-600 transition-colors"
          >
            Reset All
          </button>
          <div className="w-px h-6 bg-zinc-800 mx-1"></div>
          {/* Brand toggle */}
          <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-1">
            <button
              onClick={() => setBrandMode('sonotrade')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                brandMode === 'sonotrade'
                  ? 'bg-zinc-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Sonotrade
            </button>
            <button
              onClick={() => setBrandMode('forum')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                brandMode === 'forum'
                  ? 'bg-[#0078FF] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {brandMode === 'forum' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logoForum.png" alt="" className="h-4 w-4 rounded-full object-cover" />
              )}
              Forum Market
            </button>
          </div>
        </div>
      </div>

      {/* Video Table */}
      <div className="w-full max-w-6xl">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          {/* Table header toolbar */}
          <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between bg-zinc-900/50">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-500 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              Add Row
            </button>
            <button
              onClick={fetchAllVideos}
              disabled={entries.every(e => !e.url.trim() || !e.caption.trim() || e.data || e.loading)}
              className="rounded-lg bg-[#fe2c55] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Fetch All Videos
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-3 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider w-12">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Video URL
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Caption
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Event ID
                  </th>
                  {brandMode === 'forum' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider w-32">
                      % Change
                    </th>
                  )}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider w-32">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={entry.id} className="border-b border-zinc-800 last:border-b-0">
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-medium text-zinc-500">{index + 1}</span>
                    </td>
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
                      <textarea
                        value={entry.caption}
                        onChange={e => updateEntry(entry.id, 'caption', e.target.value)}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                            e.preventDefault();
                          }
                        }}
                        disabled={entry.data !== null}
                        placeholder="Caption (required)..."
                        rows={2}
                        className="w-full min-h-[60px] resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={entry.tag}
                        onChange={e => updateEntry(entry.id, 'tag', e.target.value)}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                            e.preventDefault();
                          }
                        }}
                        disabled={entry.loading}
                        placeholder="Tag (e.g., film)..."
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {entry.marketError && (
                        <p className="mt-1 text-xs text-red-400">{entry.marketError}</p>
                      )}
                      {entry.marketData && (
                        <p className="mt-1 text-xs text-green-400">✓ {entry.marketData.title}</p>
                      )}
                    </td>
                    {brandMode === 'forum' && (
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={entry.change}
                          onChange={e => updateEntry(entry.id, 'change', e.target.value)}
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                              e.preventDefault();
                            }
                          }}
                          placeholder="e.g. +5.2%"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#246eff] transition-colors"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => fetchVideo(entry.id)}
                          disabled={entry.loading || !entry.url.trim() || (!!entry.data && !entry.videoFailed)}
                          className="rounded-lg bg-[#fe2c55] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {entry.videoFailed ? 'Retry' : entry.data ? '✓ Fetched' : entry.loading ? '...' : 'Fetch'}
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
            {entries.filter(e => e.data && !e.loading && !(e.data.images && e.data.images.length > 0)).map((entry) => {
              const rowIndex = entries.findIndex(e => e.id === entry.id);
              return (
                <div key={entry.id} className="flex flex-col">
                  <div className="flex items-center justify-between px-2 py-1 mb-1">
                    <span className="text-xs font-semibold text-zinc-500">Row {rowIndex + 1}</span>
                  </div>
                  <TikTokCanvas
                    ref={(ref) => {
                      if (ref) {
                        canvasRefsMap.current.set(entry.id, ref);
                      } else {
                        canvasRefsMap.current.delete(entry.id);
                      }
                    }}
                    videoSrc={proxyStreamUrl(entry.data!.play || entry.data!.hdplay || entry.data!.wmplay)}
                    videoId={entry.data!.id}
                    rowNumber={rowIndex}
                    onVideoError={() => handleVideoError(entry.id)}
                    brand={brandMode}
                    overlayLogoSrc={brandMode === 'forum' ? '/logoForum.png' : '/templatelogo.png'}
                    overlayDisplayName={brandMode === 'forum' ? 'Forum Market' : 'Sonotrade'}
                    overlayHandle={brandMode === 'forum' ? '@ForumDotMarket' : '@SonotradeHQ'}
                    overlayChange={entry.change}
                    overlayCaption={entry.caption}
                    tag={entry.tag}
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
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-600 text-center max-w-sm">
        For personal use only. Respect TikTok&apos;s terms of service and content creators&apos; rights.
      </p>

      {/* Google Sheets Import Modal */}
      {showSheetsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Import from Google Sheets</h2>
              <button
                onClick={() => setShowSheetsModal(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Spreadsheet ID
                </label>
                <input
                  type="text"
                  value={spreadsheetId}
                  onChange={e => setSpreadsheetId(e.target.value)}
                  placeholder="From URL: /d/SPREADSHEET_ID/edit"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-600 transition-colors"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Find the ID in your sheet URL: /d/{'<span class="text-zinc-400">ID</span>'}/edit
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Sheet Name
                </label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={e => setSheetName(e.target.value)}
                  placeholder="Sheet1"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-600 transition-colors"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  The name of the tab (usually "Sheet1")
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Start Row
                  </label>
                  <input
                    type="number"
                    value={startRow}
                    onChange={e => setStartRow(e.target.value)}
                    min="1"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-zinc-600 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    End Row
                  </label>
                  <input
                    type="number"
                    value={endRow}
                    onChange={e => setEndRow(e.target.value)}
                    min="1"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-zinc-600 transition-colors"
                  />
                </div>
              </div>

              <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-xs text-zinc-400">
                <p className="font-medium text-zinc-300 mb-1">Expected format:</p>
                <p>• Column A: TikTok/Instagram URL</p>
                <p>• Column B: Caption</p>
                <p>• Column C: Tag (e.g., "film")</p>
              </div>

              {sheetsError && (
                <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-400">
                  {sheetsError}
                </div>
              )}

              <button
                onClick={importFromSheets}
                disabled={loadingSheets || !spreadsheetId.trim()}
                className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingSheets ? 'Importing...' : 'Import Rows'}
              </button>
            </div>
          </div>
        </div>
      )}

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
