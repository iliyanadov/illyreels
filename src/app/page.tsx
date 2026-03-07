'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { upload } from '@vercel/blob/client';
import Image from 'next/image';
import { TikTokCanvas, TikTokCanvasRef } from './components/TikTokCanvas';
import { PublishingLimit } from './components/PublishingLimit';

// Check for Google OAuth tokens in URL on mount

// Check for Meta OAuth status in URL on mount
function getMetaStatusFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const meta = params.get('meta');
  const metaError = params.get('meta_error');
  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);
  return { connected: meta === 'connected', error: metaError };
}

interface InstagramUser {
  id: string;
  username: string;
  accountType: string;
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
  instagramCaption: string;
  change: string;
  data: VideoData | null;
  marketData: EventData | null;
  loading: boolean;
  loadingMarket: boolean;
  error: string;
  marketError: string;
  videoFailed: boolean; // Track if video failed to load in canvas
  instagramPermalink?: string; // Instagram URL after successful publish
  sheetRow?: number; // The actual spreadsheet row number (for display and updating)
  uploadError?: string; // Persistent upload error message (until dismissed)
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
    { id: '1', url: '', caption: '', tag: '', instagramCaption: '', change: '', data: null, marketData: null, loading: false, loadingMarket: false, error: '', marketError: '', videoFailed: false }
  ]);

  // Store refs for each canvas to trigger downloads
  const canvasRefsMap = useRef<Map<string, TikTokCanvasRef>>(new Map());

  // Brand toggle: 'sonotrade' | 'forum' | 'culturesparadox'
  const [brandMode, setBrandMode] = useState<'sonotrade' | 'forum' | 'culturesparadox'>('sonotrade');

  // Update sheet name based on brand mode
  useEffect(() => {
    const brandToSheetName: Record<string, string> = {
      sonotrade: 'SonotradeHQ',
      culturesparadox: 'CulturesParadox',
      forum: 'Forum',
    };
    setSheetName(brandToSheetName[brandMode] || 'SonotradeHQ');
  }, [brandMode]);

  // Google Sheets state
  const [googleToken, setGoogleToken] = useState<{ accessToken: string; refreshToken?: string } | null>(null);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState('1z9KIhjPJFo9rOJ4CDW-y7W9W4MEm8Lso-EsFRknbv5w');
  const [sheetName, setSheetName] = useState("SonotradeHQ");
  const [availableSheets, setAvailableSheets] = useState<Array<{ id: string; title: string; index: number }>>([]);
  const [loadingSheetNames, setLoadingSheetNames] = useState(false);
  const [startRow, setStartRow] = useState('4');
  const [endRow, setEndRow] = useState('32');
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheetsError, setSheetsError] = useState('');

  // Instagram state (multi-account support)
  const [igUser, setIgUser] = useState<InstagramUser | null>(null);
  const [allAccounts, setAllAccounts] = useState<Array<{ igUserId: string; igUsername: string; isActive: boolean }>>([]);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [metaError, setMetaError] = useState('');
  const [loadingIgUser, setLoadingIgUser] = useState(false);

  // Upload state
  const [uploadingEntry, setUploadingEntry] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');

  // Instagram upload queue (ensures only one upload at a time)
  const uploadQueueRef = useRef<Array<{ entryId: string; blob: Blob; filename: string }>>([]);
  const isProcessingUploadRef = useRef(false);

  // Bulk upload to Instagram state
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadPaused, setBulkUploadPaused] = useState(false);
  const [bulkUploadProgress, setBulkUploadProgress] = useState(0);
  const [bulkUploadStatus, setBulkUploadStatus] = useState('');
  const [bulkUploadTotal, setBulkUploadTotal] = useState(0);
  const [bulkUploadCompleted, setBulkUploadCompleted] = useState(0);
  const bulkUploadAbortRef = useRef(false);

  // Check for OAuth tokens on mount
  useEffect(() => {
    // Check Google connection status from API
    checkGoogleConnection();

    // Check for Meta connection status
    const metaStatus = getMetaStatusFromUrl();
    if (metaStatus) {
      if (metaStatus.connected) {
        // Fetch Instagram user info and accounts after successful connection
        fetchInstagramUser();
        fetchAllAccounts();
      } else if (metaStatus.error) {
        setMetaError(metaStatus.error);
      }
    } else {
      // Also check for existing accounts on page load
      fetchInstagramUser();
      fetchAllAccounts();
    }

    // Check for Google connection status from URL (after OAuth redirect)
    const googleStatus = getGoogleStatusFromUrl();
    if (googleStatus?.connected) {
      checkGoogleConnection();
    }
  }, []);

  // Fetch sheet names when spreadsheetId changes and Google is connected
  useEffect(() => {
    if (googleToken && spreadsheetId) {
      debouncedFetchSheetNames(spreadsheetId);
    }
    // Cleanup timeout on unmount
    return () => {
      if (sheetNameFetchTimeout.current) {
        clearTimeout(sheetNameFetchTimeout.current);
      }
    };
  }, [spreadsheetId, googleToken]);

  // Auto-select brand mode based on connected Instagram username
  useEffect(() => {
    if (igUser?.username) {
      const username = igUser.username.toLowerCase();
      if (username === 'sonotradehq') {
        setBrandMode('sonotrade');
      } else if (username === 'culturesparadox') {
        setBrandMode('culturesparadox');
      }
      // Forum has no Instagram account, so no auto-select for it
    }
  }, [igUser?.username]);

  // Check for Google OAuth status in URL on mount
  function getGoogleStatusFromUrl() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const google = params.get('google');
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    return { connected: google === 'connected' };
  }

  async function checkGoogleConnection() {
    try {
      const res = await fetch('/api/google/me');
      if (res.ok) {
        // Google is connected - set a placeholder token
        setGoogleToken({ accessToken: 'connected' });
      }
    } catch (error) {
      // Not connected
      setGoogleToken(null);
    }
  }

  function addRow() {
    setEntries([...entries, {
      id: Date.now().toString(),
      url: '',
      caption: '',
      tag: '',
      instagramCaption: '',
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
      { id: '1', url: '', caption: '', tag: '', instagramCaption: '', change: '', data: null, marketData: null, loading: false, loadingMarket: false, error: '', marketError: '', videoFailed: false }
    ]);
  }

  function handleVideoError(id: string) {
    setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, videoFailed: true } : e
    ));
  }

  function updateEntry(id: string, field: 'url' | 'caption' | 'tag' | 'change' | 'instagramCaption', value: string) {
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

  async function uploadAllToInstagram() {
    // Get all entries with fetched video data
    const entriesToUpload = entries.filter(e => e.data && !e.loading && !(e.data.images && e.data.images.length > 0));

    if (entriesToUpload.length === 0) {
      setBulkUploadStatus('No videos to upload');
      return;
    }

    // Reset state
    bulkUploadAbortRef.current = false;
    setBulkUploading(true);
    setBulkUploadPaused(false);
    setBulkUploadCompleted(0);
    setBulkUploadTotal(entriesToUpload.length);
    setBulkUploadProgress(0);
    setBulkUploadStatus(`Starting upload of ${entriesToUpload.length} videos...`);

    // Upload each video sequentially
    for (let i = 0; i < entriesToUpload.length; i++) {
      const entry = entriesToUpload[i];

      // Check if aborted
      if (bulkUploadAbortRef.current) {
        setBulkUploadStatus('Upload cancelled');
        setBulkUploading(false);
        return;
      }

      // Wait while paused
      while (bulkUploadPaused && !bulkUploadAbortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Check again after pause
      if (bulkUploadAbortRef.current) {
        setBulkUploadStatus('Upload cancelled');
        setBulkUploading(false);
        return;
      }

      const canvasRef = canvasRefsMap.current.get(entry.id);
      if (canvasRef && canvasRef.startUpload) {
        setBulkUploadStatus(`Uploading video ${i + 1} of ${entriesToUpload.length}...`);
        try {
          // Use startUpload instead of startDownload to upload to Instagram
          await canvasRef.startUpload();
          setBulkUploadCompleted(i + 1);
          setBulkUploadProgress(Math.round(((i + 1) / entriesToUpload.length) * 100));
          // Add a small delay between uploads to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`Failed to upload video ${entry.id}:`, error);
          setBulkUploadStatus(`Failed to upload video ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Continue with next video instead of stopping
        }
      }
    }

    setBulkUploadStatus(`Upload complete! ${entriesToUpload.length} videos uploaded.`);
    setBulkUploading(false);

    // Clear status after 5 seconds
    setTimeout(() => {
      if (!bulkUploading) {
        setBulkUploadStatus('');
        setBulkUploadProgress(0);
      }
    }, 5000);
  }

  function toggleBulkUploadPause() {
    setBulkUploadPaused(prev => {
      const newValue = !prev;
      setBulkUploadStatus(newValue ? 'Paused' : `Uploading video ${bulkUploadCompleted + 1} of ${bulkUploadTotal}...`);
      return newValue;
    });
  }

  function cancelBulkUpload() {
    bulkUploadAbortRef.current = true;
    setBulkUploadStatus('Cancelling...');
    setBulkUploading(false);
    setBulkUploadPaused(false);
  }

  async function connectGoogle() {
    // Clear any existing token to force fresh OAuth flow with new scope
    try {
      await fetch('/api/google/me', { method: 'DELETE' });
      setGoogleToken(null);
      console.log('[Google] Cleared old token before re-auth');
    } catch (e) {
      console.log('[Google] No existing token to clear:', e);
    }

    // Get OAuth URL from our API
    const res = await fetch('/api/google/auth');
    const data = await res.json();
    if (data.authUrl) {
      window.location.href = data.authUrl;
    }
  }

  async function disconnectGoogle() {
    try {
      await fetch('/api/google/me', { method: 'DELETE' });
      setGoogleToken(null);
    } catch (error) {
      console.error('Failed to disconnect Google:', error);
    }
  }

  async function connectMeta() {
    try {
      const res = await fetch('/api/meta/auth');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMetaError(data.error || 'Failed to connect to Instagram');
      }
    } catch (error) {
      setMetaError('Network error — please try again');
    }
  }

  async function fetchInstagramUser() {
    setLoadingIgUser(true);

    try {
      const res = await fetch('/api/meta/me');

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch Instagram user');
      }

      const user = await res.json();

      setIgUser(user);
      console.log('[Instagram] Connected as @' + user.username);
    } catch (error: any) {
      console.error('[Instagram] Failed to fetch user:', error);
      setMetaError(error?.message || 'Failed to fetch Instagram user info');
    } finally {
      setLoadingIgUser(false);
    }
  }

  async function fetchAllAccounts() {
    try {
      const res = await fetch('/api/meta/accounts');
      if (res.ok) {
        const data = await res.json();
        setAllAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('[Instagram] Failed to fetch accounts:', error);
    }
  }

  async function switchAccount(igUserId: string) {
    try {
      const res = await fetch('/api/meta/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ igUserId }),
      });
      if (res.ok) {
        await fetchInstagramUser();
        await fetchAllAccounts();
        setShowAccountDropdown(false);
      }
    } catch (error) {
      console.error('[Instagram] Failed to switch account:', error);
    }
  }

  // Process the upload queue (one upload at a time)
  async function processUploadQueue() {
    if (isProcessingUploadRef.current || uploadQueueRef.current.length === 0) {
      return;
    }

    isProcessingUploadRef.current = true;
    const { entryId, blob, filename } = uploadQueueRef.current.shift()!;

    await processSingleUpload(entryId, blob, filename);

    // Process next in queue if any
    if (uploadQueueRef.current.length > 0) {
      setTimeout(() => processUploadQueue(), 500);
    } else {
      isProcessingUploadRef.current = false;
    }
  }

  async function processSingleUpload(entryId: string, blob: Blob, filename: string) {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    // Clear any previous error when starting a new upload
    setEntries(entries => entries.map(e =>
      e.id === entryId
        ? { ...e, uploadError: undefined }
        : e
    ));

    setUploadingEntry(entryId);
    setUploadStatus('Uploading video...');
    setUploadProgress(10);

    try {
      // Upload to Vercel Blob (direct from browser, bypasses Vercel serverless limits)
      setUploadProgress(20);

      // Add random suffix to filename to avoid "blob already exists" errors
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      const ext = filename.substring(filename.lastIndexOf('.'));
      const uniqueFilename = `${nameWithoutExt}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

      const uploadedBlob = await upload(uniqueFilename, blob, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      });

      setUploadProgress(70);
      setUploadStatus('Publishing to Instagram...');

      // Publish to Instagram using the Vercel Blob URL
      const publishRes = await fetch('/api/meta/reels/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: uploadedBlob.url,
          caption: entry.instagramCaption || entry.caption || '',
          shareToFeed: false,
        }),
      });

      if (!publishRes.ok) {
        const error = await publishRes.json();
        throw new Error(error.error || 'Failed to publish to Instagram');
      }

      const publishData = await publishRes.json();
      setUploadProgress(100);
      setUploadStatus('Published successfully!');

      // Update entry with published info (including permalink)
      setEntries(entries => entries.map(e =>
        e.id === entryId
          ? {
              ...e,
              data: { ...e.data!, publishedMediaId: publishData.mediaId },
              instagramPermalink: publishData.permalink ?? undefined
            }
          : e
      ));

      // Update Google Sheet status to "published" if we have the row number
      console.log('[Sheets] Checking conditions for sheet update:', {
        sheetRow: entry.sheetRow,
        hasGoogleToken: !!googleToken,
        spreadsheetId,
        sheetName
      });

      if (entry.sheetRow !== undefined && googleToken && spreadsheetId && sheetName) {
        try {
          setUploadStatus('Updating spreadsheet...');
          const updateRes = await fetch('/api/google/sheets/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              spreadsheetId,
              sheetName,
              rowNumber: entry.sheetRow,
              status: 'published'
            }),
          });

          if (!updateRes.ok) {
            const updateError = await updateRes.json();
            console.error('[Sheets] API error:', updateError);
          } else {
            console.log('[Sheets] ✅ Updated row', entry.sheetRow, 'to "published"');
          }
        } catch (error) {
          console.error('[Sheets] Failed to update sheet status:', error);
        }
      } else {
        console.log('[Sheets] ⏭️ Skipped sheet update - missing conditions');
      }

      // Delete the Vercel Blob after successful Instagram upload to free up storage
      if (uploadedBlob.url) {
        try {
          console.log('[Blob Delete] Cleaning up blob:', uploadedBlob.url);
          await fetch('/api/storage/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: uploadedBlob.url }),
          });
          console.log('[Blob Delete] ✅ Blob cleaned up successfully');
        } catch (error) {
          console.error('[Blob Delete] Failed to clean up blob:', error);
          // Don't fail the upload if blob deletion fails
        }
      }

      // Clear uploading state (but keep the success message briefly)
      setTimeout(() => {
        setUploadingEntry(null);
        setUploadProgress(0);
      }, 2000);

    } catch (error: any) {
      // Store error persistently in the entry
      const errorMessage = error.message || 'Unknown error';
      setEntries(entries => entries.map(e =>
        e.id === entryId
          ? { ...e, uploadError: errorMessage }
          : e
      ));

      // Clear uploading state but keep the error
      setUploadingEntry(null);
      setUploadProgress(0);
      setUploadStatus('');
    }
  }

  function dismissEntryError(entryId: string) {
    setEntries(entries => entries.map(e =>
      e.id === entryId
        ? { ...e, uploadError: undefined }
        : e
    ));
  }

  async function handleUploadToInstagram(entryId: string, blob: Blob, filename: string) {
    // Add to queue
    uploadQueueRef.current.push({ entryId, blob, filename });

    // Show queued status if there are items waiting
    if (isProcessingUploadRef.current) {
      const queuePosition = uploadQueueRef.current.length;
      setUploadStatus(`Queued (${queuePosition} in line)...`);
    }

    // Start processing if not already processing
    if (!isProcessingUploadRef.current) {
      processUploadQueue();
    }
  }

  async function disconnectMeta(igUserId?: string) {
    try {
      if (igUserId) {
        // Disconnect specific account
        await fetch('/api/meta/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ igUserId }),
        });
      } else {
        // Disconnect all
        await fetch('/api/meta/disconnect', { method: 'POST' });
      }
      // Refresh state
      await fetchInstagramUser();
      await fetchAllAccounts();
    } catch (error) {
      console.error('[Instagram] Failed to disconnect:', error);
    }
  }

  async function handleExportComplete(entryId: string, blob: Blob, filename: string) {
    if (!igUser || !googleToken) {
      // Fallback to download if not connected to Instagram
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), {
        href: url,
        download: filename,
      }).click();
      URL.revokeObjectURL(url);
      return;
    }

    setUploadingEntry(entryId);
    setUploadProgress(0);
    setUploadStatus('Uploading to Drive...');

    try {
      // Step 1: Upload to Google Drive
      const formData = new FormData();
      formData.append('file', blob);
      formData.append('accessToken', googleToken.accessToken);

      setUploadProgress(20);
      setUploadStatus('Uploading to Google Drive...');

      const uploadRes = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const uploadData = await uploadRes.json();
        throw new Error(uploadData.error || 'Failed to upload to Drive');
      }

      const uploadData = await uploadRes.json();
      const videoUrl = uploadData.downloadUrl;

      setUploadProgress(50);
      setUploadStatus('Publishing to Instagram...');

      // Step 2: Publish to Instagram
      const entry = entries.find(e => e.id === entryId);
      const publishRes = await fetch('/api/meta/reels/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          caption: entry?.caption || '',
          shareToFeed: true,
        }),
      });

      if (!publishRes.ok) {
        const publishData = await publishRes.json();
        throw new Error(publishData.error || 'Failed to publish to Instagram');
      }

      setUploadProgress(100);
      setUploadStatus('✓ Uploaded to Instagram!');

      // Clear status after 3 seconds
      setTimeout(() => {
        setUploadStatus('');
        setUploadingEntry(null);
        setUploadProgress(0);
      }, 3000);
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadStatus(`Error: ${error?.message || 'Upload failed'}`);
      // Keep error visible for 3 seconds
      setTimeout(() => {
        setUploadStatus('');
        setUploadingEntry(null);
        setUploadProgress(0);
      }, 3000);
    }
  }

  // Fetch available sheet names from Google Sheets
  const fetchSheetNames = useCallback(async (id: string) => {
    if (!id.trim()) {
      setAvailableSheets([]);
      return;
    }

    setLoadingSheetNames(true);

    try {
      const res = await fetch(`/api/google/sheets/metadata?spreadsheet_id=${encodeURIComponent(id.trim())}`);

      if (res.ok) {
        const data = await res.json();
        setAvailableSheets(data.sheets || []);

        // Auto-select the first sheet if current selection is not in the list
        if (data.sheets && data.sheets.length > 0) {
          const currentExists = data.sheets.some((s: { title: string }) => s.title === sheetName);
          if (!currentExists) {
            setSheetName(data.sheets[0].title);
          }
        }
      } else {
        // If metadata fetch fails, just clear available sheets
        setAvailableSheets([]);
      }
    } catch (error) {
      console.error('[Sheets] Failed to fetch sheet names:', error);
      setAvailableSheets([]);
    } finally {
      setLoadingSheetNames(false);
    }
  }, []); // Empty deps - we'll handle state updates carefully

  // Debounced fetch for sheet names
  const sheetNameFetchTimeout = useRef<NodeJS.Timeout | null>(null);
  const debouncedFetchSheetNames = useCallback((id: string) => {
    if (sheetNameFetchTimeout.current) {
      clearTimeout(sheetNameFetchTimeout.current);
    }
    sheetNameFetchTimeout.current = setTimeout(() => {
      fetchSheetNames(id);
    }, 500); // 500ms debounce
  }, []);

  async function importFromSheets() {
    if (!googleToken || !spreadsheetId.trim()) {
      setSheetsError('Please provide a spreadsheet ID');
      return;
    }

    setLoadingSheets(true);
    setSheetsError('');

    try {
      const res = await fetch(
        `/api/google/sheets?spreadsheet_id=${encodeURIComponent(spreadsheetId.trim())}&start_row=${startRow}&end_row=${endRow}&sheet_name=${encodeURIComponent(sheetName.trim())}`
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
        instagramCaption: row.instagramCaption || '',
        change: row.change || '',
        data: null,
        marketData: null,
        loading: false,
        loadingMarket: false,
        error: '',
        marketError: '',
        videoFailed: false,
        sheetRow: row.sheetRow // Store the actual spreadsheet row number
      }));

      // Replace current entries with imported ones
      setEntries(newEntries.length > 0 ? newEntries : [
        { id: '1', url: '', caption: '', tag: '', instagramCaption: '', data: null, marketData: null, loading: false, loadingMarket: false, error: '', marketError: '', videoFailed: false }
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
                onClick={disconnectGoogle}
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

          {/* Instagram Connection - Multi-Account Support */}
          {igUser ? (
            <div className="relative">
              {/* Account Dropdown Button */}
              <button
                onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                className="flex items-center gap-2 rounded-lg border border-pink-900/50 bg-pink-950/20 px-3 py-2 text-xs font-semibold text-pink-400 hover:border-pink-700 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                @{igUser.username || 'Loading...'}
                <svg className={`w-3 h-3 transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showAccountDropdown && allAccounts.length > 0 && (
                <div className="absolute top-full right-0 mt-1 w-48 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl z-50">
                  <div className="p-2 border-b border-zinc-700">
                    <div className="text-xs text-zinc-500 font-semibold mb-1">Instagram Accounts</div>
                  </div>
                  {allAccounts.map((account) => (
                    <div
                      key={account.igUserId}
                      className="flex items-center justify-between px-3 py-2 hover:bg-zinc-800 cursor-pointer group"
                    >
                      <button
                        onClick={() => switchAccount(account.igUserId)}
                        className="flex-1 text-left flex items-center gap-2"
                      >
                        {account.isActive && (
                          <svg className="w-3 h-3 text-pink-400" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        )}
                        <span className={`text-xs ${account.isActive ? 'text-pink-400 font-semibold' : 'text-zinc-400'}`}>
                          @{account.igUsername}
                        </span>
                        {account.isActive && (
                          <span className="text-[10px] text-zinc-500">(active)</span>
                        )}
                      </button>
                      {!account.isActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            disconnectMeta(account.igUserId);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-opacity"
                          title="Remove account"
                        >
                          <svg className="w-3 h-3" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="p-2 border-t border-zinc-700">
                    <button
                      onClick={connectMeta}
                      className="w-full flex items-center justify-center gap-2 rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:border-zinc-500 transition-colors"
                    >
                      <svg className="w-3 h-3" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                      </svg>
                      Add Account
                    </button>
                    {allAccounts.length > 1 && (
                      <button
                        onClick={() => disconnectMeta()}
                        className="w-full mt-1 text-xs text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        Disconnect All
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={connectMeta}
              disabled={loadingIgUser}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              {loadingIgUser ? 'Loading...' : 'Connect Instagram'}
            </button>
          )}

          <div className="w-px h-6 bg-zinc-800 mx-1"></div>
          
          {/* Publishing Limit */}
          {igUser && <PublishingLimit />}
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
              onClick={() => setBrandMode('culturesparadox')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                brandMode === 'culturesparadox'
                  ? 'bg-purple-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Cultures Paradox
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Instagram Caption
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
                      <textarea
                        value={entry.instagramCaption}
                        onChange={e => updateEntry(entry.id, 'instagramCaption', e.target.value)}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                            e.preventDefault();
                          }
                        }}
                        placeholder="Instagram caption..."
                        rows={2}
                        className="w-full min-h-[60px] resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-purple-500 transition-colors"
                      />
                    </td>
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
          {/* Bulk Upload Progress Bar */}
          {bulkUploading && (
            <div className="mb-4 mx-auto max-w-xl">
              <div className="rounded-lg border border-pink-700 bg-pink-950/20 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-pink-400">
                    {bulkUploadStatus || `Uploading ${bulkUploadCompleted} of ${bulkUploadTotal}...`}
                  </span>
                  <span className="text-xs text-zinc-400">{bulkUploadProgress}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 transition-all duration-300"
                    style={{ width: `${bulkUploadProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-center gap-2">
                  {bulkUploadPaused ? (
                    <button
                      onClick={toggleBulkUploadPause}
                      className="flex items-center gap-1 rounded-md bg-green-600/20 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-600/30 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      Resume
                    </button>
                  ) : (
                    <button
                      onClick={toggleBulkUploadPause}
                      className="flex items-center gap-1 rounded-md bg-yellow-600/20 px-3 py-1.5 text-xs font-semibold text-yellow-400 hover:bg-yellow-600/30 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16"/>
                        <rect x="14" y="4" width="4" height="16"/>
                      </svg>
                      Pause
                    </button>
                  )}
                  <button
                    onClick={cancelBulkUpload}
                    className="flex items-center gap-1 rounded-md bg-red-600/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-600/30 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Download/Upload All Buttons */}
          <div className="flex justify-center gap-3 mb-4">
            <button
              onClick={downloadAll}
              disabled={bulkUploading}
              className="flex items-center gap-2 rounded-lg bg-[#fe2c55] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download All Videos
            </button>
            {igUser && googleToken && (
              <button
                onClick={uploadAllToInstagram}
                disabled={bulkUploading}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v16M12 2l-4 4M12 2l4 4"/>
                  <path d="M2 12h4M2 12l4-4M2 12l4 4"/>
                  <path d="M22 12h-4M22 12l-4-4M22 12l4 4"/>
                </svg>
                {bulkUploading ? 'Uploading...' : 'Upload All to Instagram'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {entries.filter(e => e.data && !e.loading && !(e.data.images && e.data.images.length > 0)).map((entry) => {
              return (
                <div key={entry.id} className="flex flex-col">
                  <div className="flex items-center justify-between px-2 py-1 mb-1">
                    <span className="text-xs font-semibold text-zinc-500">
                      Row {entry.sheetRow !== undefined ? entry.sheetRow : '?'}
                    </span>
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
                    rowNumber={entry.sheetRow !== undefined ? entry.sheetRow - 1 : 0}
                    onVideoError={() => handleVideoError(entry.id)}
                    onExportComplete={(blob, filename) => handleExportComplete(entry.id, blob, filename)}
                    onUploadToInstagram={(blob, filename) => handleUploadToInstagram(entry.id, blob, filename)}
                    igConnected={!!igUser}
                    brand={brandMode}
                    overlayLogoSrc={
                      brandMode === 'forum' ? '/logoForum.png' :
                      brandMode === 'culturesparadox' ? '/culturesparadox.png' :
                      '/templatelogo.png'
                    }
                    overlayDisplayName={
                      brandMode === 'forum' ? 'Forum Market' :
                      brandMode === 'culturesparadox' ? 'Cultures Paradox' :
                      'Sonotrade'
                    }
                    overlayHandle={
                      brandMode === 'forum' ? '@ForumDotMarket' :
                      brandMode === 'culturesparadox' ? '@culturesparadox' :
                      '@SonotradeHQ'
                    }
                    overlayChange={entry.change}
                    overlayCaption={entry.caption}
                    tag={entry.tag}
                    marketData={entry.marketData}
                  />

                  {/* Upload status for this entry */}
                  {uploadingEntry === entry.id && (
                    <div className="mt-3 rounded-lg border border-pink-700 bg-pink-950/20 px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-pink-400">{uploadStatus}</span>
                        <span className="text-xs text-zinc-400">{uploadProgress}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Persistent upload error with dismiss button */}
                  {entry.uploadError && (
                    <div className="mt-3 rounded-lg border border-red-700 bg-red-950/20 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <svg className="text-red-400 mt-0.5 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-red-400">Upload Failed</p>
                            <p className="text-xs text-red-300 mt-1">{entry.uploadError}</p>
                            {entry.uploadError.toLowerCase().includes('auth') && (
                              <p className="text-xs text-zinc-400 mt-1">Please reconnect your Instagram account and try again.</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => dismissEntryError(entry.id)}
                          className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
                          title="Dismiss error"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Instagram permalink (shown after successful publish) */}
                  {entry.instagramPermalink && (
                    <div className="mt-3 rounded-lg border border-green-700 bg-green-950/20 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="text-green-400" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                          </svg>
                          <span className="text-xs font-semibold text-green-400">Published to Instagram</span>
                        </div>
                        <a
                          href={entry.instagramPermalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded bg-green-600/20 px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-600/30 transition-colors"
                        >
                          View
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </a>
                      </div>
                    </div>
                  )}

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
                {availableSheets.length > 0 ? (
                  <div className="relative">
                    <select
                      value={sheetName}
                      onChange={e => setSheetName(e.target.value)}
                      disabled={loadingSheetNames}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-zinc-600 transition-colors disabled:opacity-50"
                    >
                      {availableSheets.map(sheet => (
                        <option key={sheet.id} value={sheet.title}>
                          {sheet.title}
                        </option>
                      ))}
                    </select>
                    {loadingSheetNames && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                        Loading...
                      </span>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={sheetName}
                    onChange={e => {
                      setSheetName(e.target.value);
                      // Clear available sheets if user types manually
                      if (availableSheets.length > 0 && spreadsheetId) {
                        debouncedFetchSheetNames(spreadsheetId);
                      }
                    }}
                    placeholder="SonotradeHQ"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-600 transition-colors"
                  />
                )}
                <p className="mt-1 text-xs text-zinc-500">
                  {availableSheets.length > 0
                    ? `${availableSheets.length} sheet${availableSheets.length !== 1 ? 's' : ''} available`
                    : 'Enter spreadsheet ID above to load sheets'
                  }
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
