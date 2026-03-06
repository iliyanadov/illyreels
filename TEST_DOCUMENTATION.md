# IllyReels - Complete Technical Documentation for Testing

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [File Structure](#file-structure)
4. [Data Models & Interfaces](#data-models--interfaces)
5. [API Endpoints](#api-endpoints)
6. [Components](#components)
7. [State Management](#state-management)
8. [External Integrations](#external-integrations)
9. [Authentication Flows](#authentication-flows)
10. [Environment Variables](#environment-variables)
11. [Error Handling](#error-handling)
12. [Testing Considerations](#testing-considerations)

---

## Project Overview

**IllyReels** is a Next.js 16 full-stack application that enables users to:
1. Download TikTok and Instagram videos (with or without watermarks)
2. Edit videos with custom overlays (brand logos, captions, tick marks)
3. Import video metadata in bulk from Google Sheets
4. Publish edited videos directly to Instagram Reels
5. Store videos in Google Drive for long-term storage

**Target Users**: Content creators who need to repurpose TikTok content for Instagram with consistent branding.

**Key Value Proposition**: Batch processing of social media content with automated publishing workflow.

---

## Architecture & Tech Stack

### Frontend
- **Framework**: Next.js 16.1.6 with App Router
- **UI Styling**: Tailwind CSS (custom dark theme)
- **State Management**: React hooks (useState, useRef, useEffect)
- **Canvas**: HTML5 Canvas for video manipulation
- **Video Processing**: MP4Box.js for video muxing

### Backend
- **Runtime**: Node.js (forced for API routes)
- **API Routes**: Next.js Route Handlers
- **Storage**: httpOnly cookies for OAuth tokens
- **File Upload**: Vercel Blob + Google Drive API

### External Services
- **TikTok Download**: tikwm.com API
- **Instagram Download**: btch-downloader npm package
- **Google APIs**: Sheets API (readonly), Drive API (file write)
- **Instagram/Meta**: Instagram Graph API v22.0
- **Prediction Markets**: DFlow API

### Third-Party Libraries
- `@vercel/blob` - Client-side file uploads
- `btch-downloader` - Instagram media downloader
- `googleapis` - Google OAuth2 and API access
- `mp4box` - Video file manipulation

---

## File Structure

```
illyreels/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout, fonts, metadata
│   │   ├── page.tsx                # Main application (~2000 lines)
│   │   ├── globals.css             # Global styles & Tailwind config
│   │   ├── components/
│   │   │   ├── TikTokCanvas.tsx    # Video editing canvas component
│   │   │   └── PublishingLimit.tsx # Instagram quota display component
│   │   └── api/                    # API routes
│   │       ├── download/
│   │       │   └── route.ts        # TikTok/Instagram video download
│   │       ├── proxy/
│   │       │   └── route.ts        # CORS proxy for media files
│   │       ├── upload/
│   │       │   └── route.ts        # Vercel Blob upload handler
│   │       ├── google/
│   │       │   ├── auth.ts         # Google OAuth initiation
│   │       │   ├── callback.ts     # Google OAuth token exchange
│   │       │   ├── me.ts           # Google connection status
│   │       │   ├── sheets.ts       # Google Sheets import
│   │       │   └── token.ts        # Google token management
│   │       ├── meta/
│   │       │   ├── auth.ts         # Instagram OAuth initiation
│   │       │   ├── callback.ts     # Instagram OAuth token exchange
│   │       │   ├── disconnect.ts   # Disconnect Instagram account
│   │       │   ├── me.ts           # Instagram user info
│   │       │   ├── publishing-limit.ts # Instagram quota check
│   │       │   └── reels/
│   │       │       └── publish.ts  # Publish to Instagram Reels
│   │       ├── market/
│   │       │   └── route.ts        # DFlow market data fetch
│   │       └── storage/
│   │           └── upload.ts       # Google Drive upload
│   └── lib/
│       ├── google-token-storage.ts # Google token cookie management
│       ├── meta-token-storage.ts   # Instagram token cookie management
│       ├── drive-storage.ts        # Google Drive server operations
│       └── drive-upload.ts         # Google Drive client operations
├── public/                         # Static assets
├── .env.local                      # Environment variables
├── next.config.ts                  # Next.js configuration
├── tsconfig.json                   # TypeScript configuration
└── package.json                    # Dependencies
```

---

## Data Models & Interfaces

### VideoEntry (Main Data Structure)
```typescript
interface VideoEntry {
  id: string;                      // Unique identifier (timestamp + random)
  url: string;                     // TikTok/Instagram URL
  caption: string;                 // Heading caption for overlay
  tag: string;                     // Event ID tag for market lookup
  instagramCaption: string;        // Caption for Instagram post
  change: string;                  // Percentage change (forum mode only)
  data: VideoData | null;          // Fetched video metadata
  marketData: EventData | null;    // Fetched market data from DFlow
  loading: boolean;                // Video fetch in progress
  loadingMarket: boolean;          // Market data fetch in progress
  error: string;                   // Video fetch error message
  marketError: string;             // Market fetch error message
  videoFailed: boolean;            // Video failed to load in canvas
}
```

### VideoData (Downloaded Video Metadata)
```typescript
interface VideoData {
  id: string;                      // Video unique ID
  title: string;                   // Video title/description
  cover: string;                   // Thumbnail URL
  author: Author;                  // Creator information
  play: string;                    // SD URL, no watermark
  wmplay: string;                  // SD URL, with watermark
  hdplay: string;                  // HD URL, no watermark
  duration: number;                // Video duration in seconds
  size: number;                    // File size in bytes
  images?: string[];               // For Instagram image posts
}

interface Author {
  uniqueId: string;                // Username
  nickname: string;                // Display name
  avatarThumb: string;             // Profile picture URL
}
```

### Market Data (DFlow Prediction Markets)
```typescript
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
  yesAsk?: string;
  yesBid?: string;
  noAsk?: string;
  noBid?: string;
}
```

### Token Storage Models
```typescript
// Google Token
interface GoogleToken {
  accessToken: string;
  refreshToken?: string;
}

// Instagram Token
interface StoredToken {
  userAccessToken: string;    // Instagram User Access Token
  igUserId?: string;          // Instagram User ID
  igUsername?: string;        // Instagram username
  expiresAt?: number;         // Token expiration timestamp (Unix)
}
```

---

## API Endpoints

### Authentication Endpoints

#### `GET /api/google/auth`
**Purpose**: Initiate Google OAuth2 flow for Sheets access

**Response**:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

**Flow**:
1. Generates OAuth2 URL with `spreadsheets.readonly` scope
2. Sets `access_type=offline` for refresh token
3. Sets `prompt=consent` to ensure refresh token is returned
4. Returns authorization URL for frontend redirect

---

#### `GET /api/google/callback?code={code}&error={error}`
**Purpose**: Handle Google OAuth callback

**Parameters**:
- `code` (string): Authorization code from Google
- `error` (string, optional): Error if user denied access

**Response**: HTML page with success/error message and auto-redirect

**Flow**:
1. Exchanges authorization code for access and refresh tokens
2. Stores tokens in `google_token` httpOnly cookie (base64 encoded, 7-day expiry)
3. Returns success page that redirects to `/?google=connected`

**Error Handling**:
- OAuth denial → Shows error page
- Missing code → Shows error page
- Token exchange failure → Logs error, shows error page

---

#### `GET /api/google/me`
**Purpose**: Check if user is connected to Google

**Response**:
```json
{
  "connected": true
}
```

**Error Response**:
```json
{
  "error": "Not connected to Google"
}
```

**Flow**:
1. Reads `google_token` cookie
2. Returns connection status

---

#### `GET /api/meta/auth`
**Purpose**: Initiate Instagram OAuth flow

**Environment Variables Required**:
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_REDIRECT_URI`

**Response**:
```json
{
  "url": "https://www.instagram.com/oauth/authorize?...",
  "state": "uuid-v4-random-string"
}
```

**Scopes Requested**:
- `instagram_business_basic`
- `instagram_business_content_publish`

**Security**: Uses UUID as `state` parameter for CSRF protection

---

#### `GET /api/meta/callback?code={code}&error={error}&error_reason={error_reason}`
**Purpose**: Handle Instagram OAuth callback

**Two-Step Token Exchange**:
1. **First exchange**: Code → Short-lived token (1 hour expiry)
2. **Second exchange**: Short-lived → Long-lived token (60 days expiry)

**Stored in Cookie**:
- User access token
- User ID (fetched from Graph API)
- Username (fetched from Graph API)
- Expiration timestamp

**Response**: HTML page with success/error message, auto-redirect to `/?meta=connected`

**Special Note**: Uses Instagram Login flow (NOT Facebook Login), which uses `graph.instagram.com` domain

---

#### `GET /api/meta/me`
**Purpose**: Get connected Instagram user information

**Response**:
```json
{
  "id": "123456789",
  "username": "example_user",
  "accountType": "MEDIA_CREATOR"
}
```

**Error Response** (401):
```json
{
  "error": "No Instagram account connected"
}
```

---

#### `POST /api/meta/disconnect`
**Purpose**: Disconnect Instagram account

**Response**:
```json
{
  "success": true
}
```

**Flow**: Clears `meta_token` cookie

---

#### `GET /api/meta/publishing-limit`
**Purpose**: Check Instagram Reels publishing quota

**Response**:
```json
{
  "config": {
    "quota_total": 65
  },
  "quota_usage": 12
}
```

**Details**:
- `quota_total`: Daily quota (typically 65 for Instagram Business)
- `quota_usage`: Used quota (resets daily)

**Error Response** (401):
```json
{
  "error": "Authentication failed"
}
```

---

### Data Processing Endpoints

#### `POST /api/download`
**Purpose**: Download TikTok or Instagram video metadata

**Request Body**:
```json
{
  "url": "https://www.tiktok.com/@user/video/123456789"
}
```

**Success Response (TikTok)**:
```json
{
  "id": "7234567890123456789",
  "title": "Video description",
  "cover": "https://thumbnail_url",
  "author": {
    "uniqueId": "@username",
    "nickname": "Display Name",
    "avatarThumb": "https://avatar_url"
  },
  "play": "https://video_url_sd_no_wm",
  "wmplay": "https://video_url_sd_wm",
  "hdplay": "https://video_url_hd_no_wm",
  "duration": 15,
  "size": 2048576
}
```

**Success Response (Instagram)**:
```json
{
  "id": "timestamp",
  "title": "",
  "cover": "https://thumbnail_url",
  "author": {
    "uniqueId": "instagram",
    "nickname": "Instagram User",
    "avatarThumb": ""
  },
  "play": "https://video_url",
  "wmplay": "https://video_url",
  "hdplay": "https://video_url",
  "duration": 0,
  "size": 0
}
```

**Error Responses**:
- `400` - Invalid URL, video not found, rate limited
- `502` - Upstream service error
- `504` - Request timeout (30s)

**Special Handling**:
- Short URL resolution for `vm.tiktok.com` and `vt.tiktok.com`
- User-friendly error messages for common failures
- 30-second timeout for external API calls

---

#### `GET /api/google/sheets?spreadsheet_id={id}&start_row={n}&end_row={n}&sheet_name={name}`
**Purpose**: Import video data from Google Sheets

**Query Parameters**:
- `spreadsheet_id` (required): Google Sheet ID
- `start_row` (optional, default: "4"): First row to import
- `end_row` (optional, default: "32"): Last row to import
- `sheet_name` (optional, default: "Sheet1"): Sheet name

**Expected Sheet Format** (Columns A-D):
| A | B | C | D |
|---|---|---|---|
| Video URL | Caption | Tag | Instagram Caption |

**Success Response**:
```json
{
  "rows": [
    {
      "url": "https://tiktok.com/...",
      "caption": "Heading text",
      "tag": "film",
      "instagramCaption": "Instagram post caption..."
    }
  ]
}
```

**Error Responses**:
- `400` - Missing spreadsheet_id
- `401` - Not connected to Google
- `5xx` - API errors

**Flow**:
1. Validates Google token
2. Calls Google Sheets API with specified range
3. Maps columns to data structure
4. Filters out rows without URLs

---

#### `GET /api/market?eventId={id}&withNestedMarkets={boolean}`
**Purpose**: Fetch prediction market data from DFlow API

**Query Parameters**:
- `eventId` (required): Event ID (e.g., "KXENGAGEMENTTIMOTHEEKYLIE-26")
- `withNestedMarkets` (optional, default: "true"): Include nested market data

**Environment Variables Required**:
- `DFLOW_API_KEY`
- `DFLOW_API_URL`

**Success Response**: See Market Data interface above

**Error Responses**:
- `400` - Missing eventId
- `500` - DFlow API error

---

### Media Handling Endpoints

#### `GET /api/proxy?url={url}&filename={name}&stream={0|1}`
**Purpose**: Proxy media files to bypass CORS restrictions

**Query Parameters**:
- `url` (required): Media file URL
- `filename` (optional, default: "tiktok-download"): Download filename
- `stream` (optional, default: "0"): If "1", streams video (no download header)

**Allowed Hosts**:
- `*.tikwm.com`
- `*.tiktokcdn.com`
- `*.tiktokv.com`
- `*.tokcdn.com`
- `*.muscdn.app`
- `*.rapidcdn.app`
- `*.cdninstagram.com`
- `*.instagram.com`

**Response**: Proxied file with proper headers:
- Content-Type correction (octet-stream → video/mp4)
- CORS headers for video playback
- Range request support for streaming
- Content-Disposition for downloads

**Security**: Host whitelist to prevent open proxy abuse

---

#### `POST /api/upload`
**Purpose**: Upload video to Vercel Blob storage

**Request Body**:
```json
{
  "url": "https://video_url"
}
```

**Response**: Vercel Blob upload response

**Flow**: Uses `@vercel/blob` client upload from browser

---

#### `POST /api/storage/upload`
**Purpose**: Upload video to Google Drive

**Request**: Multipart form data with file

**Response**:
```json
{
  "fileId": "1ABC123xyz",
  "downloadUrl": "https://drive.google.com/uc?export=download&id=...",
  "filename": "video-1234567890.mp4"
}
```

**Drive Folder**: Creates/uses "Sonoreels Uploads" folder
**Permissions**: Public sharing (anyone with link can view)

---

### Publishing Endpoints

#### `POST /api/meta/reels/publish`
**Purpose**: Publish a video to Instagram Reels

**Request Body**:
```json
{
  "videoUrl": "https://public_video_url",
  "caption": "Post caption...",
  "shareToFeed": true
}
```

**Three-Step Publishing Process**:

1. **Create Container**:
   ```
   POST https://graph.instagram.com/v22.0/{ig-user-id}/media
   - media_type: REELS
   - video_url: {public_video_url}
   - caption: {caption}
   - share_to_feed: true/false
   ```
   Returns: `container_id`

2. **Poll for Readiness** (up to 5 minutes, 5-second intervals):
   ```
   GET https://graph.instagram.com/v22.0/{container-id}?fields=status_code
   ```
   Status codes:
   - `IN_PROGRESS` - Still processing
   - `FINISHED` - Ready to publish
   - `ERROR` - Processing failed
   - `EXPIRED` - Container expired

3. **Publish**:
   ```
   POST https://graph.instagram.com/v22.0/{ig-user-id}/media_publish
   - creation_id: {container_id}
   ```
   Returns: `media_id` of published reel

**Success Response**:
```json
{
  "containerId": "123456789",
  "mediaId": "987654321"
}
```

**Error Responses**:
- `400` - Missing videoUrl
- `401` - Authentication failed
- `500` - Publishing error

**Requirements**:
- Video must be publicly accessible (not behind auth)
- Video aspect ratio: 9:16 recommended
- Video duration: 3 seconds to 90 seconds
- Video file size: Max 50 MB (varies by account)

---

## Components

### TikTokCanvas Component

**File**: `src/app/components/TikTokCanvas.tsx`

**Purpose**: Render and edit video with brand overlays

**Props**:
```typescript
interface TikTokCanvasProps {
  videoUrl: string;           // URL of video to render
  onDownload?: (blob: Blob, metadata: VideoMetadata) => void;
  brandMode?: 'sonotrade' | 'forum';  // Brand styling mode
}

interface TikTokCanvasRef {
  triggerDownload: () => void;
}
```

**Internal Canvas Dimensions**:
- Canvas: 1080×1920 (1080p portrait)
- Display scale: 0.25 (270×480 on screen)
- Video target width: 1000px
- Header height: 110px

**Features**:
1. **Video Positioning**: Auto-center with aspect ratio preservation
2. **Drag & Resize**: 8-point handles for video box manipulation
3. **Brand Overlays**:
   - **Sonotrade**: Header with logo, caption lines, tick mark
   - **Forum**: Header + bottom ribbon with market data
4. **Export**: Records canvas and downloads as video

**Export Process**:
1. Uses `MediaRecorder` API to capture canvas stream
2. Records at 30 FPS in `video/webm` format
3. Uses `mp4box.js` to mux to `video/mp4`
4. Triggers callback with Blob and metadata

**State Management**:
- `videoBox`: {x, y, w, h} position and size
- `isDragging`: Active drag state
- `dragHandle`: Which handle is being dragged
- `videoLoaded`: Video ready state

**Brand-Specific Rendering**:
- `SONOTRADE_HEADER_HEIGHT = 110`
- `FORUM_HEADER_HEIGHT = 110`
- `FORUM_RIBBON_HEIGHT = 90`
- `CAPTION_LINE_HEIGHT = 55`

### PublishingLimit Component

**File**: `src/app/components/PublishingLimit.tsx`

**Purpose**: Display Instagram publishing quota

**Data Structure**:
```typescript
interface QuotaData {
  config: {
    quota_total: number;
  };
  quota_usage: number;
}
```

**Features**:
- Progress bar visualization
- Color coding by usage level:
  - Green: < 50%
  - Yellow: 50-80%
  - Red: > 80%
- Real-time quota updates

---

## State Management

### Main Page State (`src/app/page.tsx`)

#### Core State Variables
```typescript
// Video entries array
const [entries, setEntries] = useState<VideoEntry[]>([...]);

// Canvas references for triggering downloads
const canvasRefsMap = useRef<Map<string, TikTokCanvasRef>>(new Map());

// Brand mode toggle
const [brandMode, setBrandMode] = useState<'sonotrade' | 'forum'>('sonotrade');

// Google Sheets integration
const [googleToken, setGoogleToken] = useState<GoogleToken | null>(null);
const [showSheetsModal, setShowSheetsModal] = useState(false);
const [spreadsheetId, setSpreadsheetId] = useState('default-sheet-id');
const [startRow, setStartRow] = useState('4');
const [endRow, setEndRow] = useState('32');
const [sheetName, setSheetName] = useState('SonotradeHQ');

// Instagram integration
const [igUser, setIgUser] = useState<InstagramUser | null>(null);
const [quotaData, setQuotaData] = useState<QuotaData | null>(null);

// UI state
const [downloadingAll, setDownloadingAll] = useState(false);
const [uploadStatus, setUploadStatus] = useState('');
const [uploadingEntry, setUploadingEntry] = useState<string | null>(null);
const [uploadProgress, setUploadProgress] = useState(0);
```

#### Key Functions

**Entry Management**:
```typescript
// Update a single field in an entry
function updateEntry(id: string, field: keyof VideoEntry, value: string): void

// Add a new empty row
function addRow(): void

// Remove a row
function removeRow(id: string): void

// Fetch video data from URL
async function fetchVideo(id: string): Promise<void>

// Fetch market data by tag
async function fetchMarket(id: string): Promise<void>
```

**Batch Operations**:
```typescript
// Fetch all videos
async function fetchAllVideos(): Promise<void>

// Download all processed videos
async function downloadAll(): Promise<void>

// Upload all to Instagram
async function uploadAll(): Promise<void>
```

**Authentication**:
```typescript
// Connect to Google
async function connectGoogle(): Promise<void>

// Disconnect from Google
async function disconnectGoogle(): Promise<void>

// Connect to Instagram
async function connectMeta(): Promise<void>

// Disconnect from Instagram
async function disconnectMeta(): Promise<void>
```

**Google Sheets Import**:
```typescript
async function importFromSheets(): Promise<void>
// Fetches from API, replaces entries array with imported data
```

**Video Processing**:
```typescript
// Process single video for upload
async function processAndUploadVideo(entry: VideoEntry): Promise<void>
// 1. Triggers canvas download
// 2. Uploads to Vercel Blob
// 3. Publishes to Instagram
```

### Cookie-Based Token Storage

Both Google and Instagram tokens are stored in httpOnly cookies:

**Storage Format**:
```
base64(json({
  accessToken: "...",
  refreshToken: "...",  // Google only
  expiresAt: 1234567890  // Instagram only
}))
```

**Security**:
- `httpOnly: true` - Not accessible via JavaScript
- `secure: true` (production) - HTTPS only
- `sameSite: 'lax'` - CSRF protection
- `path: '/'` - Available site-wide

---

## External Integrations

### Google Sheets API

**Scope**: `https://www.googleapis.com/auth/spreadsheets.readonly`

**API Endpoint**:
```
GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{sheetName}!A{startRow}:D{endRow}
```

**Column Mapping**:
- Column A: Video URL
- Column B: Caption (heading text)
- Column C: Tag (event ID)
- Column D: Instagram Caption

**Token Lifecycle**:
1. OAuth flow returns access token + refresh token
2. Access token stored in cookie (7-day expiry)
3. No automatic token refresh implemented

### Google Drive API

**Scope**: `https://www.googleapis.com/auth/drive.file`

**Folder**: Creates "Sonoreels Uploads" folder in root

**Upload Flow**:
1. Check if folder exists (search by name)
2. If not, create folder
3. Upload file with `parents: [folderId]`
4. Set permissions to `anyone with link can view`
5. Return file ID and download URL

### Instagram Graph API

**Base URL**: `https://graph.instagram.com/v22.0/`

**Scopes**:
- `instagram_business_basic` - User profile data
- `instagram_business_content_publish` - Create Reels

**Token Exchange**:
```
1. code → short-lived token (1 hour)
   POST https://api.instagram.com/oauth/access_token

2. short-lived → long-lived token (60 days)
   GET https://graph.instagram.com/access_token
   ?grant_type=ig_exchange_token
   &client_secret={secret}
   &access_token={short-lived}
```

**Rate Limits**:
- Publishing quota: 65 Reels per 24 hours (varies by account)
- Quota usage fetched via `user_publishing_limit` field

### TikTok Download (tikwm.com)

**API Endpoint**: `POST https://www.tikwm.com/api/`

**Request**:
```
Content-Type: application/x-www-form-urlencoded
url={videoUrl}&hd=1
```

**Timeout**: 30 seconds

**Short URL Handling**: Follows redirects for `vm.tiktok.com` and `vt.tiktok.com`

### Instagram Download (btch-downloader)

**Package**: `btch-downloader` (CommonJS)

**Usage**: Dynamic import required
```typescript
const { igdl } = await import('btch-downloader');
const data = await igdl(url);
```

**Timeout**: 30 seconds

### DFlow Prediction Markets API

**Environment Variables**:
- `DFLOW_API_KEY` - Authentication
- `DFLOW_API_URL` - Base URL (https://c.prediction-markets-api.dflow.net)

**Tag to Event ID Mapping**:
```typescript
const TAG_TO_EVENT_ID: Record<string, string> = {
  'film': 'KXENGAGEMENTTIMOTHEEKYLIE-26',
};
```

**Usage**: Fetches market data for display in Forum brand mode

---

## Authentication Flows

### Google OAuth Flow

```
User clicks "Connect Google"
        ↓
GET /api/google/auth
        ↓
Returns authUrl
        ↓
window.location.href = authUrl
        ↓
User approves on Google
        ↓
Redirect to /api/google/callback?code=xxx
        ↓
Exchange code for tokens
POST https://oauth2.googleapis.com/token
        ↓
Store tokens in httpOnly cookie
        ↓
Redirect to /?google=connected
        ↓
useEffect detects google=connected
        ↓
Fetches /api/google/me
        ↓
Sets googleToken state
```

### Instagram OAuth Flow

```
User clicks "Connect Instagram"
        ↓
GET /api/meta/auth
        ↓
Returns authUrl + state
        ↓
window.location.href = authUrl
        ↓
User approves on Instagram
        ↓
Redirect to /api/meta/callback?code=xxx&state=xxx
        ↓
Step 1: Exchange code for short-lived token
POST https://api.instagram.com/oauth/access_token
        ↓
Step 2: Exchange for long-lived token
GET https://graph.instagram.com/access_token
?grant_type=ig_exchange_token
        ↓
Fetch user data
GET https://graph.instagram.com/v22.0/me
?fields=id,username,account_type
        ↓
Store token + user data in cookie
        ↓
Redirect to /?meta=connected
        ↓
useEffect detects meta=connected
        ↓
Fetches /api/meta/me + /api/meta/publishing-limit
        ↓
Sets igUser + quotaData state
```

---

## Environment Variables

### Required Variables

```env
# Instagram / Meta
INSTAGRAM_APP_ID=947925477699650
INSTAGRAM_APP_SECRET=your_app_secret_here
INSTAGRAM_REDIRECT_URI=https://yourdomain.com/api/meta/callback

# Google
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/google/callback

# DFlow API
DFLOW_API_KEY=your_dflow_api_key
DFLOW_API_URL=https://c.prediction-markets-api.dflow.net

# Application
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NODE_ENV=production
```

### Optional Variables

```env
META_GRAPH_VERSION=v22.0
```

---

## Error Handling

### API Error Response Format

```json
{
  "error": "Human-readable error message"
}
```

### HTTP Status Codes Used

- `200` - Success
- `400` - Bad request (invalid input, missing parameters)
- `401` - Unauthorized (not connected, token expired)
- `403` - Forbidden (URL not allowed)
- `502` - Bad gateway (upstream service error)
- `504` - Gateway timeout (request took too long)

### Client-Side Error Display

**Video Errors**: Displayed below each row
```typescript
entry.error = "Video not found. The link may be private, deleted, or invalid."
```

**Market Errors**: Displayed below Event ID field
```typescript
entry.marketError = "Market not found for tag: film"
```

**Global Errors**: Alert banners at top of page
- Connection errors
- Upload progress/errors
- Batch operation status

### Error Boundaries

No React error boundaries implemented. Errors propagate to default Next.js error page.

---

## Testing Considerations

### Critical Testing Areas

#### 1. Authentication Flows
- **Google OAuth**: Complete flow from auth to callback
- **Instagram OAuth**: Complete flow including both token exchanges
- **Token Persistence**: Verify cookies are set correctly
- **Token Expiry**: Instagram tokens should expire after 60 days
- **Disconnect**: Verify cookies are cleared

#### 2. Video Download
- **TikTok URLs**: Public videos, private videos, deleted videos
- **Short URLs**: `vm.tiktok.com` and `vt.tiktok.com` redirects
- **Instagram URLs**: Both video and image posts
- **Error Handling**: Invalid URLs, rate limits, timeouts
- **Video Data**: Verify all fields (title, author, URLs)

#### 3. Google Sheets Import
- **Valid Sheet**: Correct format imports correctly
- **Column Mapping**: Verify A→D mapping is correct
- **Empty Rows**: Rows without URLs should be skipped
- **Invalid Sheet ID**: Proper error handling
- **Row Ranges**: start_row and end_row parameters
- **Sheet Names**: Non-default sheet names

#### 4. Canvas & Video Processing
- **Video Rendering**: Videos display correctly in canvas
- **Overlays**: Brand headers render correctly
- **Export**: Downloaded videos include overlays
- **Video Quality**: Export resolution is 1080×1920
- **Multi-video**: Each canvas operates independently

#### 5. Instagram Publishing
- **3-Step Flow**: Container → Wait → Publish
- **Polling**: Status checks work correctly
- **Timeout**: Handles max polling attempts
- **Quota**: Publishing limit checked and updated
- **Error States**: Handles ERROR and EXPIRED statuses

#### 6. State Management
- **Entry CRUD**: Add, update, remove rows
- **Independent States**: Each entry's loading/error states don't interfere
- **Undo/Redo**: Cmd/Ctrl+Z prevention on inputs

#### 7. Cookie Security
- **httpOnly**: Tokens not accessible via JavaScript
- **secure**: HTTPS-only in production
- **sameSite**: CSRF protection
- **Encoding**: Base64 encoding/decoding

#### 8. CORS Proxy
- **Allowed Hosts**: Only whitelisted domains work
- **Streaming**: stream=1 parameter works
- **Range Requests**: Video playback supports seeking
- **Content-Type**: Video content type corrected

#### 9. Google Drive Upload
- **Folder Creation**: Creates "Sonoreels Uploads" if missing
- **File Upload**: Uploads successfully
- **Permissions**: Public sharing enabled
- **Response**: Returns correct file ID and URL

#### 10. Responsive UI
- **Mobile**: Layout works on small screens
- **Dark Mode**: Consistent dark theme
- **Loading States**: Proper loading indicators
- **Error Messages**: Clear, actionable errors

### Test Data Recommendations

**TikTok URLs**:
- Public video: `https://www.tiktok.com/@scout2015/video/6718335390845095173`
- Short URL: `https://vm.tiktok.com/ZM6PXXDB/`
- Private/deleted: For error testing

**Instagram URLs**:
- Public reel: Any public Instagram Reel URL
- Image post: Any public Instagram image post

**Google Sheets**:
Create test sheet with columns A-D:
- A: Video URLs (mix of valid and invalid)
- B: Various caption lengths
- C: Valid/invalid tags
- D: Instagram captions

### Mock Service Considerations

For reliable testing, consider mocking:
- TikTok download API (tikwm.com)
- Instagram download API (btch-downloader)
- Google Sheets API
- Instagram Graph API
- DFlow API

### Performance Testing

- **Concurrent Requests**: Multiple video fetches simultaneously
- **Large Sheets**: Import from sheets with 100+ rows
- **Video Export**: Memory usage during canvas recording
- **Upload Speeds**: Large video uploads to Vercel/Google Drive

### Edge Cases

1. **Network Failures**: Drop network during OAuth, download, upload
2. **Token Revocation**: Manually revoke tokens during session
3. **Quota Limits**: Exceed Instagram publishing quota
4. **Large Videos**: Near 50 MB limit for Instagram
5. **Long Captions**: Instagram caption character limits
6. **Special Characters**: Captions with emojis, special chars
7. **Multiple Tabs**: Open app in multiple browser tabs
8. **Browser Refresh**: State persistence across refresh
9. **Cookie Blocking**: Browser with cookies disabled
10. **Video Formats**: Different video codecs from TikTok

---

## Appendix: Tag-to-Event ID Mapping

```typescript
const TAG_TO_EVENT_ID: Record<string, string> = {
  'film': 'KXENGAGEMENTTIMOTHEEKYLIE-26',
};
```

This mapping is used to fetch market data from DFlow API. When a user enters a tag in the "Event ID" field and clicks fetch (or it auto-fetches), the system looks up the corresponding event ID.

---

## Appendix: Instagram Caption Fallback Logic

```typescript
const caption = entry.instagramCaption || entry.caption || '';
```

When uploading to Instagram:
1. First tries `entry.instagramCaption` (from Google Sheets Column D)
2. Falls back to `entry.caption` (heading text)
3. Uses empty string if neither exists

---

## Appendix: Video URL Selection Priority

```typescript
const videoUrl = entry.data?.hdplay    // HD, no watermark
  || entry.data?.play                  // SD, no watermark
  || entry.data?.wmplay                // SD, with watermark
  || '';
```

For downloading and processing, the system prefers:
1. HD without watermark
2. SD without watermark
3. SD with watermark (last resort)

---

*Document generated for IllyReels testing and QA purposes*
*Last updated: 2025-03-06*
