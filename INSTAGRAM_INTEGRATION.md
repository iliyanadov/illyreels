# IllyReels Instagram Integration - Technical Documentation

## Overview

IllyReels uses Instagram's **Graph API for Content Publishing** to enable users to publish videos as Reels directly from the application. The integration uses OAuth 2.0 for authentication and follows Instagram's official 3-step publishing flow.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  page.tsx                                                             │  │
│  │  - Manages Instagram user state (igUser)                             │  │
│  │  - Handles OAuth redirect on mount                                   │  │
│  │  - Calls /api/meta/me to get user info                               │  │
│  │  - Uploads videos to Vercel Blob storage                            │  │
│  │  - Calls /api/meta/reels/publish to publish                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API LAYER (Next.js)                               │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐│
│  │ /api/meta/auth       │  │ /api/meta/callback   │  │ /api/meta/me       ││
│  │ - Generates OAuth    │  │ - Exchanges code     │  │ - Gets user info   ││
│  │   URL with state     │  │   for token          │  │   from Graph API   ││
│  └──────────────────────┘  └──────────────────────┘  └────────────────────┘│
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ /api/meta/reels/publish                                               │  │
│  │ - Step 1: Create container                                           │  │
│  │ - Step 2: Poll for status (5s intervals, up to 5 min)               │  │
│  │ - Step 3: Publish container                                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ /api/meta/publishing-limit                                            │  │
│  │ - Checks quota usage (default: 25 posts/day)                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TOKEN STORAGE (HTTP Cookies)                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ meta_token (httpOnly, secure, sameSite=lax)                         │  │
│  │ - Base64 encoded JSON:                                               │  │
│  │   {                                                                  │  │
│  │     userAccessToken: string,  // Long-lived token (~60 days)        │  │
│  │     igUserId: string,          // Discovered after connection       │  │
│  │     igUsername: string,        // For display                       │  │
│  │     expiresAt: number          // Unix timestamp                    │  │
│  │   }                                                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INSTAGRAM GRAPH API (graph.instagram.com)              │
│  - OAuth endpoints                                                         │
│  - Media container creation                                                │
│  - Content publishing                                                      │
│  - Quota management                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. OAuth Authentication Flow

### 1.1 Initiate OAuth (`/api/meta/auth`)

**Endpoint:** `GET /api/meta/auth`

**Purpose:** Generate the Instagram OAuth authorization URL

**Required Environment Variables:**
- `INSTAGRAM_APP_ID` - Instagram App ID from Meta Developer Portal
- `INSTAGRAM_REDIRECT_URI` - Must match what's configured in Meta Developer Portal

**Scopes Requested:**
```
instagram_business_basic          - Basic user info
instagram_business_content_publish - Required for publishing Reels
```

**Response:**
```json
{
  "url": "https://www.instagram.com/oauth/authorize?client_id=...",
  "state": "uuid-v4-random-string"
}
```

**Security:**
- Generates a random `state` parameter for CSRF protection
- State should be validated on callback (currently stored in frontend session)

**Code Reference:** `src/app/api/meta/auth/route.ts`

---

### 1.2 OAuth Callback (`/api/meta/callback`)

**Endpoint:** `GET /api/meta/callback?code=...&state=...`

**Purpose:** Exchange authorization code for a long-lived access token

**Flow (3 steps):**

#### Step 1: Exchange Code for Short-Lived Token
```
POST https://api.instagram.com/oauth/access_token
Content-Type: application/x-www-form-urlencoded

client_id=APP_ID
client_secret=APP_SECRET
grant_type=authorization_code
redirect_uri=REDIRECT_URI
code=AUTHORIZATION_CODE
```

**Response:**
```json
{
  "access_token": "short-lived-token",
  "expires_in": 3600  // 1 hour
}
```

#### Step 2: Exchange Short-Lived for Long-Lived Token
```
GET https://graph.instagram.com/access_token?
  grant_type=ig_exchange_token&
  client_secret=APP_SECRET&
  access_token=SHORT_LIVED_TOKEN
```

**Response:**
```json
{
  "access_token": "long-lived-token",
  "expires_in": 5184000  // ~60 days
}
```

#### Step 3: Store Token
- Token is stored in an `httpOnly` cookie named `meta_token`
- Cookie is Base64-encoded JSON
- Expires in ~60 days (matching token lifetime)
- Flags: `httpOnly`, `secure` (production), `sameSite=lax`

**User Experience:**
- Success: Shows HTML page with ✅ and auto-redirects after 1.5s
- Error: Shows HTML page with ❌ and error details

**Code Reference:** `src/app/api/meta/callback/route.ts`

---

## 2. Token Management

### 2.1 Token Storage (`src/lib/meta-token-storage.ts`)

**Cookie Structure:**
```
meta_token: Base64({
  userAccessToken: "IGQVJ...",
  igUserId: "123456789",
  igUsername: "username",
  expiresAt: 1735689600  // Unix timestamp
})
```

**Functions:**

| Function | Purpose |
|----------|---------|
| `setMetaToken(token)` | Store token in cookie |
| `getMetaToken()` | Retrieve and decode token, checks expiry |
| `updateMetaToken(updates)` | Update specific fields (like igUserId) |
| `clearMetaToken()` | Delete cookie |
| `hasMetaToken()` | Boolean check |
| `getIgUserId()` | Get Instagram User ID |
| `getIgAccessToken()` | Get access token string |

**Security Features:**
- `httpOnly`: JavaScript cannot read the token (prevents XSS theft)
- `secure`: Only sent over HTTPS in production
- `sameSite=lax`: Prevents CSRF but allows navigation-based flows
- Expiration checking: Automatically clears expired tokens

---

### 2.2 User Info Discovery (`/api/meta/me`)

**Endpoint:** `GET /api/meta/me`

**Purpose:** Fetch authenticated user's Instagram profile info

**API Call:**
```
GET https://graph.instagram.com/me?
  fields=id,username,account_type&
  access_token=TOKEN
```

**Response:**
```json
{
  "id": "123456789",
  "username": "illyreels",
  "accountType": "BUSINESS"
}
```

**Side Effect:** Updates stored token with `igUserId` and `igUsername` for later use

---

## 3. Publishing to Instagram

### 3.1 The 3-Step Publishing Flow

Instagram uses an **asynchronous publishing flow** because videos must be processed by Instagram's servers before being published.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           STEP 1: Create Container                          │
│                                                                              │
│  POST https://graph.instagram.com/{ig-user-id}/media                        │
│  Parameters:                                                                │
│    - media_type: "REELS"                                                    │
│    - video_url: {public_video_url}                                          │
│    - caption: {optional_text}                                               │
│    - share_to_feed: "true"|"false"                                         │
│                                                                              │
│  Response:                                                                   │
│    { "id": "container-id-123" }                                             │
│                                                                              │
│  NOTE: video_url must be publicly accessible (Vercel Blob used here)        │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           STEP 2: Poll for Status                           │
│                                                                              │
│  GET https://graph.instagram.com/{container-id}?fields=status_code           │
│                                                                              │
│  Poll every 5 seconds, up to 60 attempts (~5 minutes max)                   │
│                                                                              │
│  Status codes:                                                               │
│    - IN_PROGRESS: Still processing (continue polling)                        │
│    - FINISHED: Ready to publish (proceed to Step 3)                         │
│    - ERROR: Processing failed (abort with error)                            │
│    - EXPIRED: Container expired (abort with error)                         │
│                                                                              │
│  Response:                                                                   │
│    { "status_code": "FINISHED" }                                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           STEP 3: Publish Container                         │
│                                                                              │
│  POST https://graph.instagram.com/{ig-user-id}/media_publish                 │
│  Parameters:                                                                │
│    - creation_id: {container-id}                                            │
│                                                                              │
│  Response:                                                                   │
│    { "id": "media-id-456" }                                                 │
│                                                                              │
│  SUCCESS! Video is now published as a Reel                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Code Reference:** `src/app/api/meta/reels/publish/route.ts`

---

### 3.2 Publish Endpoint Details

**Endpoint:** `POST /api/meta/reels/publish`

**Request Body:**
```json
{
  "videoUrl": "https://blob-url...",
  "caption": "Optional caption text",
  "shareToFeed": false
}
```

**Response:**
```json
{
  "containerId": "container-id-123",
  "mediaId": "media-id-456"
}
```

**Polling Configuration:**
- `POLL_INTERVAL`: 5000ms (5 seconds)
- `MAX_POLL_ATTEMPTS`: 60
- **Maximum wait time:** ~5 minutes

**Error Handling:**
| Error Pattern | HTTP Status | User Message |
|---------------|-------------|--------------|
| Token/auth error | 401 | "Authentication failed. Please reconnect your account." |
| Missing videoUrl | 400 | "videoUrl is required" |
| No token | 401 | "No Instagram account connected" |
| Other errors | 500 | Error message from API |

---

## 4. Video Upload Flow

Since Instagram requires a publicly accessible video URL, IllyReels uses **Vercel Blob Storage**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Frontend Upload Flow                              │
│                                                                              │
│  1. TikTokCanvas exports video as Blob                                      │
│  2. Upload to Vercel Blob via /api/upload                                   │
│  3. Get public URL from upload response                                     │
│  4. Pass URL to /api/meta/reels/publish                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Why Vercel Blob?**
- Bypasses Vercel serverless function size limits (4.5MB request body)
- Direct upload from browser to Vercel's storage
- Returns publicly accessible URL immediately
- No server-side processing needed

---

## 5. Publishing Limits (Quota)

### 5.1 Quota Endpoint

**Endpoint:** `GET /api/meta/publishing-limit`

**API Call:**
```
GET https://graph.instagram.com/{ig-user-id}/content_publishing_limit?
  fields=config,quota_usage&
  access_token=TOKEN
```

**Response:**
```json
{
  "data": [
    {
      "config": {
        "quota_total": 25,
        "quota_duration": 86400
      },
      "quota_usage": 3
    }
  ]
}
```

**Simplified Response:**
```json
{
  "config": 25,
  "quota_usage": 3
}
```

**Quota Rules:**
- **Default limit:** 25 Reels per 24-hour period
- **Quota window:** Rolling 24 hours (not calendar day)
- **Rate limit error:** Returns `error.message: "Quota exceeded"`

**Frontend Component:** `PublishingLimit` displays `quota_usage / config` (e.g., "3/25")

---

## 6. Environment Variables Required

```bash
# Instagram OAuth
INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_REDIRECT_URI=http://localhost:3000/api/meta/callback

# Graph API
META_GRAPH_VERSION=v22.0

# Vercel Blob (for video storage)
BLOB_READ_WRITE_TOKEN=vercel_blob_token
```

**Where to get these:**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create an App → Select "Business" type
3. Add Product: Instagram
4. Configure Instagram Basic Display
5. Set Redirect URI in Valid OAuth Redirect URIs

---

## 7. Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid token` | Token expired | Re-authenticate user |
| `Quota exceeded` | Posted >25 in 24h | Wait before posting again |
| `Container processing failed` | Video format/size issue | Check video specs |
| `Container expired` | Took >60 mins to publish | Retry with fresh container |
| `Missing igUserId` | /api/meta/me not called after auth | Call user info endpoint |

---

## 8. Video Requirements

**Instagram Reels Specifications:**
- **Aspect Ratio:** 9:16 (vertical)
- **Duration:** 3-90 seconds
- **Format:** MP4 or MOV
- **Max File Size:** 250MB (when using upload endpoint)
- **Resolution:** 1080x1920 recommended

---

## 9. Frontend Integration Points

**In `src/app/page.tsx`:**

```typescript
// 1. Check connection status on mount
useEffect(() => {
  const metaStatus = getMetaStatusFromUrl();
  if (metaStatus?.connected) {
    fetchInstagramUser();
  }
}, []);

// 2. Fetch user info
async function fetchInstagramUser() {
  const res = await fetch('/api/meta/me');
  const user = await res.json();
  setIgUser(user);
}

// 3. Upload and publish
async function handleUploadToInstagram(entryId, blob, filename) {
  // Upload to Vercel Blob
  const uploadedBlob = await upload(filename, blob, {
    access: 'public',
    handleUploadUrl: '/api/upload',
  });

  // Publish to Instagram
  const publishRes = await fetch('/api/meta/reels/publish', {
    method: 'POST',
    body: JSON.stringify({
      videoUrl: uploadedBlob.url,
      caption: entry.instagramCaption || entry.caption,
      shareToFeed: false,
    }),
  });
}
```

---

## 10. Security Considerations

1. **Token Storage:** httpOnly cookies prevent XSS access
2. **CSRF Protection:** State parameter in OAuth flow
3. **Token Expiry:** Automatic cleanup of expired tokens
4. **Secrets:** Never exposed to frontend (server-side only)
5. **CORS:** Vercel Blob URLs are public but tokens are private

---

## 11. Testing Integration Tests

The integration tests cover all Instagram endpoints:

| Test File | Coverage |
|-----------|----------|
| `meta-auth.test.ts` | OAuth URL generation, user info retrieval |
| `meta-reels-publish.test.ts` | Full 3-step publish flow, errors, emojis |
| `meta-publishing-limit.test.ts` | Quota checking, token validation |

**Run tests:**
```bash
npm test  # All 128 tests including Instagram integration
```

---

## Summary Flow Diagram

```
User clicks "Connect Instagram"
         │
         ▼
Frontend: fetch('/api/meta/auth')
         │
         ▼
Returns OAuth URL → Redirect to Instagram
         │
         ▼
User approves permissions
         │
         ▼
Instagram redirects to /api/meta/callback?code=...
         │
         ▼
Backend: Exchange code → short-lived token → long-lived token
         │
         ▼
Store in httpOnly cookie → Redirect to /?meta=connected
         │
         ▼
Frontend: fetch('/api/meta/me') → Get user info + igUserId
         │
         ▼
User clicks "Publish to Instagram"
         │
         ▼
Frontend: Upload video to Vercel Blob → Get public URL
         │
         ▼
Frontend: fetch('/api/meta/reels/publish', { videoUrl, caption })
         │
         ▼
Backend Step 1: Create container with video URL
         │
         ▼
Backend Step 2: Poll status every 5s (up to 5 min)
         │
         ▼
Backend Step 3: Publish container → Return mediaId
         │
         ▼
Success! Show Published confirmation
```

---

**Last Updated:** 2026-03-06
**Graph API Version:** v22.0
**Token Lifetime:** ~60 days
**Publishing Quota:** 25 Reels per 24 hours
