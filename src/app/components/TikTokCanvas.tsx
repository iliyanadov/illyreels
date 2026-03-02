'use client';

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

// @ts-ignore - mp4box doesn't have proper types
import MP4Box from 'mp4box';

// Internal canvas resolution (1080p portrait for highest export quality)
export const CANVAS_W = 1080;
export const CANVAS_H = 1920;
// Target width for video fitting (1000px leaves 40px padding on each side)
export const VIDEO_TARGET_W = 1000;
// Display scale so the on-screen canvas isn't huge
const DISPLAY_SCALE = 0.25; // 1080×1920 → 270×480 on screen
const MIN_DIM = 40;
const H_SIZE = 10; // handle square side length

type Handle = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br' | 'move';

interface Box { x: number; y: number; w: number; h: number }

// Pure module-level function — no closure issues inside effects
function calcVideoBox(vw: number, vh: number, currentBrand: string): Box {
  const headerNet = BASE_HEADER_HEIGHT - 4; // 106px — header height minus its 4px overlap
  const maxVideoH = currentBrand === 'forum'
    ? CANVAS_H - headerNet - 30 - 90  // reserve space for gap + ribbon
    : CANVAS_H;
  const scale = Math.min(VIDEO_TARGET_W / vw, maxVideoH / vh);
  const drawW = vw * scale;
  const drawH = vh * scale;
  const x = (CANVAS_W - drawW) / 2;
  const y = currentBrand === 'forum'
    ? headerNet + (maxVideoH - drawH) / 2
    : (CANVAS_H - drawH) / 2;
  return { x, y, w: drawW, h: drawH };
}

const CURSORS: Record<Handle, string> = {
  tl: 'n-resize', tc: 'n-resize',  tr: 'n-resize',
  bl: 's-resize', bc: 's-resize',  br: 's-resize',
  move: 'move',
};

// Header overlay (Twitter/X style) drawn above the video area inside the crop box
const BASE_HEADER_HEIGHT = 110; // Height without caption
const CAPTION_LINE_HEIGHT = 55; // Spacing between caption lines
const CAPTION_TOP_PADDING = 80; // Padding above first caption line
const HEADER_PADDING_X = 32;
const HEADER_PADDING_TOP = 14;

// Exact verified tick SVG (from X) rendered into the canvas via a data URL image
const VERIFIED_TICK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" aria-hidden="true">
  <g>
    <path clip-rule="evenodd"
          d="M13.596 3.011L11 .5 8.404 3.011l-3.576-.506-.624 3.558-3.19 1.692L2.6 11l-1.586 3.245 3.19 1.692.624 3.558 3.576-.506L11 21.5l2.596-2.511 3.576.506.624-3.558 3.19-1.692L19.4 11l1.586-3.245-3.19-1.692-.624-3.558-3.576.506zM6 11.39l3.74 3.74 6.2-6.77L14.47 7l-4.8 5.23-2.26-2.26L6 11.39z"
          fill="url(#paint0_linear_8728_433881)"
          fill-rule="evenodd" />
    <path clip-rule="evenodd"
          d="M13.348 3.772L11 1.5 8.651 3.772l-3.235-.458-.565 3.219-2.886 1.531L3.4 11l-1.435 2.936 2.886 1.531.565 3.219 3.235-.458L11 20.5l2.348-2.272 3.236.458.564-3.219 2.887-1.531L18.6 11l1.435-2.936-2.887-1.531-.564-3.219-3.236.458zM6 11.39l3.74 3.74 6.2-6.77L14.47 7l-4.8 5.23-2.26-2.26L6 11.39z"
          fill="url(#paint1_linear_8728_433881)"
          fill-rule="evenodd" />
    <path clip-rule="evenodd"
          d="M6 11.39l3.74 3.74 6.197-6.767h.003V9.76l-6.2 6.77L6 12.79v-1.4zm0 0z"
          fill="#D18800"
          fill-rule="evenodd" />
    <defs>
      <linearGradient gradientUnits="userSpaceOnUse" id="paint0_linear_8728_433881" x1="4" x2="19.5" y1="1.5" y2="22">
        <stop stop-color="#F4E72A" />
        <stop offset=".539" stop-color="#CD8105" />
        <stop offset=".68" stop-color="#CB7B00" />
        <stop offset="1" stop-color="#F4EC26" />
        <stop offset="1" stop-color="#F4E72A" />
      </linearGradient>
      <linearGradient gradientUnits="userSpaceOnUse" id="paint1_linear_8728_433881" x1="5" x2="17.5" y1="2.5" y2="19.5">
        <stop stop-color="#F9E87F" />
        <stop offset=".406" stop-color="#E2B719" />
        <stop offset=".989" stop-color="#E2B719" />
      </linearGradient>
    </defs>
  </g>
</svg>
`.trim();

interface Market {
  ticker: string;
  title: string;
  yesAsk?: string;
  yesBid?: string;
  noAsk?: string;
  noBid?: string;
}

interface MarketData {
  ticker: string;
  title: string;
  imageUrl?: string | null;
  markets: Market[];
}

interface Props {
  videoSrc: string;
  videoId?: string;
  rowNumber?: number; // Row number for ordered exports
  onVideoError?: () => void; // Callback when video fails to load
  brand?: 'sonotrade' | 'forum';
  overlayLogoSrc?: string;
  overlayChange?: string;
  overlayDisplayName?: string;
  overlayHandle?: string;
  overlayDate?: string;
  overlayVerified?: boolean;
  overlayCaption?: string;
  tag?: string;
  marketData?: MarketData | null;
}

export interface TikTokCanvasRef {
  startDownload: () => Promise<void>;
}

export const TikTokCanvas = forwardRef<TikTokCanvasRef, Props>(function TikTokCanvas({
  videoSrc,
  videoId,
  rowNumber = 0,
  onVideoError,
  brand = 'sonotrade',
  overlayLogoSrc = '/templatelogo.png',
  overlayChange = '',
  overlayDisplayName = 'Sonotrade',
  overlayHandle = '@SonotradeHQ',
  overlayDate = 'Jan 22',
  overlayVerified = true,
  overlayCaption = '',
  tag = '',
  marketData = null,
}: Props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const raf       = useRef(0);

  // Cached image for the verified tick SVG
  const verifiedImgRef = useRef<HTMLImageElement | null>(null);
  // Cached image for the logo
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  // Cached image for the Sonotrade banner
  const bannerImgRef = useRef<HTMLImageElement | null>(null);
  // Cached image for the market/event
  const marketImgRef = useRef<HTMLImageElement | null>(null);
  // Track if market image has been loaded
  const marketImgLoadedRef = useRef(false);

  // Pan offset for the underlying video (dragging moves the video, not the crop box)
  const videoOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Video zoom scale
  const videoScaleRef = useRef<number>(1);
  const [videoScale, setVideoScale] = useState(1);

  // Playback state for template preview
  const [isPlaying, setIsPlaying] = useState(false);
  // Video error state
  const [videoError, setVideoError] = useState<string | null>(null);
  // Video loading state - true when video is still fetching data
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  // Box lives in both a ref (for the draw loop) and state (for handle positions)
  const boxRef = useRef<Box>({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H });
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H });

  // Active drag
  const drag = useRef<{
    handle: Handle;
    sx: number;
    sy: number;
    sb: Box;
    videoOffsetStart: { x: number; y: number };
  } | null>(null);

  // Recording
  const [isRecording, setIsRecording]     = useState(false);
  const [recProgress, setRecProgress]     = useState(0);
  const [recStatus, setRecStatus]         = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Expose download method to parent component via ref
  useImperativeHandle(ref, () => ({
    startDownload: () => {
      if (!isRecording) {
        return startRecording();
      }
      return Promise.resolve();
    }
  }));

  // ── Reset on new video ───────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      console.log('[Row ' + (rowNumber + 1) + '] Video loaded successfully:', { videoId, vw, vh, src: videoSrc });
      if (vw && vh) {
        const b = calcVideoBox(vw, vh, brand);
        boxRef.current = b;
        setBox(b);
        videoOffsetRef.current = { x: 0, y: 0 };
        videoScaleRef.current = 1;
        setVideoScale(1);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoSrc, brand]);

  // Reposition already-loaded video when brand changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const b = calcVideoBox(video.videoWidth, video.videoHeight, brand);
    boxRef.current = b;
    setBox(b);
    videoOffsetRef.current = { x: 0, y: 0 };
    videoScaleRef.current = 1;
    setVideoScale(1);
  }, [brand]);

  // Reset logo cache when logo source changes so next draw picks up the new image
  useEffect(() => {
    logoImgRef.current = null;
  }, [overlayLogoSrc]);

  // Clear video error when videoSrc changes and set up loading state
  useEffect(() => {
    // Skip if videoSrc is empty or doesn't contain a real URL
    if (!videoSrc || !videoSrc.includes('url=') || videoSrc.endsWith('url=')) {
      setIsVideoLoading(false);
      return;
    }

    console.log('[Row ' + (rowNumber + 1) + '] Video source changed for videoId:', videoId);
    console.log('[Row ' + (rowNumber + 1) + '] Video src (first 200 chars):', videoSrc.substring(0, Math.min(200, videoSrc.length)));
    setVideoError(null);
    setIsVideoLoading(true);

    const video = videoRef.current;
    if (!video) {
      setIsVideoLoading(false);
      return;
    }

    // Reset video before loading new source
    video.pause();
    video.removeAttribute('src'); // Clear existing source
    video.load(); // Reset the video element

    // Set the new source
    video.src = videoSrc;

    // Track when video is ready or fails
    const handleLoadedData = () => {
      if (video.readyState >= 2) {
        console.log('[Row ' + (rowNumber + 1) + `] Video ${videoId} loaded data, readyState:`, video.readyState);
        setIsVideoLoading(false);
      }
    };

    const handleError = () => {
      console.log('[Row ' + (rowNumber + 1) + `] Video ${videoId} error`);
      setIsVideoLoading(false);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);

    // Set a timeout to detect videos that never load
    // Some TikTok videos can take 60+ seconds to load from their CDN
    const timeoutId = setTimeout(() => {
      if (video.readyState < 2 && !videoError) {
        console.error('[Row ' + (rowNumber + 1) + '] Video loading timeout for videoId:', videoId);
        console.error('[Row ' + (rowNumber + 1) + '] Video src (first 200 chars):', videoSrc.substring(0, Math.min(200, videoSrc.length)));
        console.error('[Row ' + (rowNumber + 1) + '] ReadyState:', video.readyState, 'NetworkState:', video.networkState);
        setVideoError('Video failed to load. The video URL may be invalid.');
        setIsVideoLoading(false);
        if (onVideoError) {
          onVideoError();
        }
      }
    }, 120000); // 2 minutes - some TikTok CDN responses are very slow

    return () => {
      clearTimeout(timeoutId);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
    };
  }, [videoSrc]);

  // ── Load market image when marketData changes (outside draw loop) ─────────────
  useEffect(() => {
    if (!marketData?.imageUrl) {
      marketImgLoadedRef.current = false;
      return;
    }

    // Reset loaded state
    marketImgLoadedRef.current = false;

    // Create new image if not exists or URL changed
    if (!marketImgRef.current || marketImgRef.current.src !== marketData.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = marketData.imageUrl;

      img.onload = () => {
        marketImgLoadedRef.current = true;
        // Trigger one redraw to show the image
      };

      marketImgRef.current = img;
    } else if (marketImgRef.current.complete) {
      marketImgLoadedRef.current = true;
    }
  }, [marketData?.imageUrl]);

  // ── Helper: Count caption lines accurately ───────────────────────────────────
  function countCaptionLines(canvasCtx: CanvasRenderingContext2D): number {
    if (!overlayCaption) return 0;

    const captionFont = '400 42px Chirp, "Comic Sans MS", cursive';
    canvasCtx.font = captionFont;
    const maxWidth = CANVAS_W - (HEADER_PADDING_X + 43) * 2;

    const userLines = overlayCaption.split('\n');
    let captionLines = 0;

    for (let lineIndex = 0; lineIndex < userLines.length; lineIndex++) {
      const userLine = userLines[lineIndex];
      if (!userLine) {
        captionLines++;
        continue;
      }

      const words = userLine.split(' ');
      let line = '';
      let lineCount = 1;

      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = canvasCtx.measureText(testLine);

        if (metrics.width > maxWidth && i > 0) {
          lineCount++;
          line = words[i] + ' ';
        } else {
          line = testLine;
        }
      }
      captionLines += lineCount;
    }

    return captionLines;
  }

  // ── Reusable drawing functions (used by both main canvas and export) ─────────────
  // These functions draw identically on any CanvasRenderingContext2D

  interface DrawHeaderParams {
    ctx: CanvasRenderingContext2D;
    cx: number;
    cy: number;
    cw: number;
    countCaptionLinesFn: (ctx: CanvasRenderingContext2D) => number;
  }

  function drawHeaderOnContext({ ctx, cx, cy, cw, countCaptionLinesFn }: DrawHeaderParams): number {
    const padX = HEADER_PADDING_X + 43; // Shift right by 43px
    const padY = HEADER_PADDING_TOP;
    const lineH = 50;
    const nameFont = '600 44px system-ui, sans-serif';
    const metaFont = '400 40px system-ui, sans-serif';
    const metaColor = 'rgba(113, 118, 123, 1)';
    const nameColor = 'rgb(231, 233, 234)';

    // Calculate number of caption lines to determine dynamic header height
    const captionLines = countCaptionLinesFn(ctx);

    // Dynamic header height based on CAPTION_LINE_HEIGHT, minus bottom offset to tighten the box
    const CAPTION_BOTTOM_OFFSET = 18; // Reduce space below last line
    const headerHeight = overlayCaption
      ? BASE_HEADER_HEIGHT + CAPTION_TOP_PADDING + (captionLines * CAPTION_LINE_HEIGHT) - CAPTION_BOTTOM_OFFSET
      : BASE_HEADER_HEIGHT;

    // Solid header background
    ctx.fillStyle = '#000';
    ctx.fillRect(cx, cy, cw, headerHeight);

    // Baselines for name and handle
    const baselineName = cy + padY + lineH;
    const handleBaseline = baselineName + 48;

    // Logo on the left, vertically centered alongside both lines of text
    const logoHeight = 96;
    const textCenterY = (baselineName + handleBaseline) / 2;
    const logoX = cx + padX;
    let logo = logoImgRef.current;
    if (!logo) {
      logo = new Image();
      logo.src = overlayLogoSrc;
      logoImgRef.current = logo;
    }

    // Calculate logo width based on aspect ratio, or use default
    let logoWidth = logoHeight; // default to square if image not loaded
    if (logo.complete && logo.width && logo.height) {
      const logoAspectRatio = logo.width / logo.height;
      logoWidth = logoHeight * logoAspectRatio;
      const logoY = textCenterY - logoHeight / 2 - 10; // Move up by 10px
      const logoRadius = 14; // corner radius
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(logoX, logoY, logoWidth, logoHeight, logoRadius);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
      ctx.restore();
    }

    // First line: display name + verified badge, to the right of the logo
    let left = logoX + logoWidth + 28; // extra right-side gap after logo

    // Display name
    ctx.font = nameFont;
    ctx.fillStyle = nameColor;
    ctx.fillText(overlayDisplayName, left, baselineName);
    left += ctx.measureText(overlayDisplayName).width + 6;

    // Verified badge (exact X SVG), vertically centered with the display name
    if (overlayVerified) {
      const size = 36;
      const badgeX = left;
      const nameCenterY = baselineName - 22; // approx vertical center of 44px name
      const badgeY = nameCenterY - size / 2 + 8;
      let img = verifiedImgRef.current;
      if (!img) {
        img = new Image();
        img.src = `data:image/svg+xml;utf8,${encodeURIComponent(VERIFIED_TICK_SVG)}`;
        verifiedImgRef.current = img;
      }
      if (img.complete) {
        ctx.drawImage(img, badgeX, badgeY, size, size);
      }
      left += size + 12;
    }

    // Second line: @handle under the display name, with a bit more spacing
    ctx.font = metaFont;
    ctx.fillStyle = metaColor;
    const handleLeft = logoX + logoWidth + 28;
    ctx.fillText(overlayHandle, handleLeft, handleBaseline);

    // Caption: below the handle if provided
    if (overlayCaption) {
      const captionFont = '400 42px Chirp, "Comic Sans MS", cursive';
      const captionColor = 'rgb(231, 233, 234)';
      const captionBaseline = handleBaseline + CAPTION_TOP_PADDING;
      const captionLeft = cx + padX;

      ctx.font = captionFont;
      ctx.fillStyle = captionColor;

      // Split by user's explicit newlines first, then wrap each line
      const userLines = overlayCaption.split('\n');
      const maxWidth = cw - padX * 2;
      let y = captionBaseline;

      for (let lineIndex = 0; lineIndex < userLines.length; lineIndex++) {
        const userLine = userLines[lineIndex];
        if (!userLine) {
          // Empty line from user - just advance Y
          y += CAPTION_LINE_HEIGHT;
          continue;
        }

        const words = userLine.split(' ');
        let line = '';

        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);

          if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line, captionLeft, y);
            line = words[i] + ' ';
            y += CAPTION_LINE_HEIGHT;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, captionLeft, y);
        // Only advance Y if there are more user lines to process
        if (lineIndex < userLines.length - 1) {
          y += CAPTION_LINE_HEIGHT;
        }
      }
    }

    return headerHeight; // Return the calculated height
  }

  interface DrawMarketCardParams {
    ctx: CanvasRenderingContext2D;
    boxY: number;
  }

  function drawMarketCardOnContext({ ctx, boxY }: DrawMarketCardParams): void {
    if (!tag?.trim() || !marketData || !marketData.markets || marketData.markets.length === 0) {
      return;
    }

    const market = marketData.markets[0];
    const boxHeight = 140;
    const boxPadding = 60;
    const radius = 16;
    const boxX = boxPadding;
    const boxWidth = CANVAS_W - boxPadding * 2;

    // Draw rounded rectangle with black background and gray border
    ctx.fillStyle = '#000';
    ctx.strokeStyle = 'rgba(113, 118, 123, 0.5)';
    ctx.lineWidth = 2;

    // Rounded rectangle path
    ctx.beginPath();
    ctx.moveTo(boxX + radius, boxY);
    ctx.lineTo(boxX + boxWidth - radius, boxY);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
    ctx.lineTo(boxX + radius, boxY + boxHeight);
    ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
    ctx.lineTo(boxX, boxY + radius);
    ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    const textPadding = 40; // Increased internal padding
    const imageSize = 80; // Increased square image size
    const imageMargin = 25; // Increased gap between image and text

    // Draw market image if available (using pre-loaded image)
    let textStartX = boxX + textPadding;
    if (marketImgRef.current && marketImgLoadedRef.current) {
      const img = marketImgRef.current;
      const imgX = boxX + textPadding;
      const imgY = boxY + (boxHeight - imageSize) / 2; // Vertically center

      // Draw rounded rectangle clip for image
      ctx.save();
      ctx.beginPath();
      const imgRadius = 12; // Increased corner radius to match rectangle
      ctx.moveTo(imgX + imgRadius, imgY);
      ctx.lineTo(imgX + imageSize - imgRadius, imgY);
      ctx.quadraticCurveTo(imgX + imageSize, imgY, imgX + imageSize, imgY + imgRadius);
      ctx.lineTo(imgX + imageSize, imgY + imageSize - imgRadius);
      ctx.quadraticCurveTo(imgX + imageSize, imgY + imageSize, imgX + imageSize - imgRadius, imgY + imageSize);
      ctx.lineTo(imgX + imgRadius, imgY + imageSize);
      ctx.quadraticCurveTo(imgX, imgY + imageSize, imgX, imgY + imageSize - imgRadius);
      ctx.lineTo(imgX, imgY + imgRadius);
      ctx.quadraticCurveTo(imgX, imgY, imgX + imgRadius, imgY);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(img, imgX, imgY, imageSize, imageSize);
      ctx.restore();

      textStartX = imgX + imageSize + imageMargin;
    }

    // Calculate max width for text (leave space for odds and banner on right)
    const maxTextWidth = 420; // Reduced from 450 to make title area slightly narrower

    // Event title (white text) - max 2 lines with ellipsis for truncation
    ctx.font = '600 28px system-ui, sans-serif'; // Increased from 26px to 28px
    ctx.fillStyle = 'rgb(231, 233, 234)';
    ctx.textAlign = 'left'; // Ensure left alignment for title

    const fullText = marketData.title;
    const fullTextWidth = ctx.measureText(fullText).width;
    const ellipsis = '...';
    const ellipsisWidth = ctx.measureText(ellipsis).width;

    if (fullTextWidth <= maxTextWidth) {
      // Text fits in one line - center it vertically
      const textY = boxY + boxHeight / 2 + 8; // Vertically centered
      ctx.fillText(fullText, textStartX, textY);
    } else {
      // Text needs wrapping - split into two rows max, with truncation
      const lineHeight = 34; // Increased from 30px to 34px for more spacing
      const totalTextHeight = lineHeight * 2; // Two lines
      const textY = boxY + (boxHeight - totalTextHeight) / 2 + 24; // Center the two-line block
      const words = fullText.split(' ');
      let line1 = '';
      let line2 = '';

      for (const word of words) {
        // Try adding to line 1
        const testLine1 = line1 + (line1 ? ' ' : '') + word;
        const line1Width = ctx.measureText(testLine1).width;

        if (line1Width <= maxTextWidth) {
          line1 = testLine1;
        } else {
          // Line 1 is full, add to line 2
          const testLine2 = line2 + (line2 ? ' ' : '') + word;
          const line2Width = ctx.measureText(testLine2).width;

          if (line2Width <= maxTextWidth - ellipsisWidth) {
            line2 = testLine2;
          } else {
            // Line 2 is also full - truncate with ellipsis
            break;
          }
        }
      }

      // Draw the lines (line2 may have ellipsis)
      ctx.fillText(line1, textStartX, textY);
      if (line2) {
        ctx.fillText(line2, textStartX, textY + 34);
      } else {
        // Only one line, add ellipsis if truncated
        const truncatedWidth = ctx.measureText(line1).width;
        if (truncatedWidth > maxTextWidth - ellipsisWidth) {
          // Truncate line1 and add ellipsis
          let truncatedLine = line1;
          while (ctx.measureText(truncatedLine + ellipsis).width > maxTextWidth) {
            truncatedLine = truncatedLine.slice(0, -1);
          }
          ctx.fillText(truncatedLine + ellipsis, textStartX, textY);
        } else {
          ctx.fillText(line1, textStartX, textY);
        }
      }
    }

    // Draw odds (yesBid) on the right side if available
    if (market.yesBid) {
      const bannerReservedWidth = 240; // Space reserved for banner column
      const oddsColumnEnd = boxX + boxWidth - textPadding - bannerReservedWidth;

      // Convert decimal to percentage (0.01 -> 1%)
      const oddsValue = parseFloat(market.yesBid) * 100;
      const oddsText = Math.round(oddsValue) + '%';

      // Calculate payout: (100 / percentage) * 100
      const payoutValue = (100 / oddsValue) * 100;
      const payoutAmount = Math.round(payoutValue);

      // Measure payout line width for centering
      ctx.font = '400 16px system-ui, sans-serif';
      const greenText = '$' + payoutAmount;
      const prefix = '$100 → ';
      const payoutLineWidth = ctx.measureText(prefix + greenText).width;

      // Draw percentage (larger, above and centered over payout)
      ctx.font = '700 60px system-ui, sans-serif'; // Increased from 48px to 60px
      ctx.fillStyle = 'rgb(231, 233, 234)';
      const oddsY = boxY + boxHeight / 2 + 4; // Moved down slightly
      // Center the percentage above the payout line
      const percentageWidth = ctx.measureText(oddsText).width;
      const percentageX = oddsColumnEnd - (payoutLineWidth / 2) + (percentageWidth / 2);
      ctx.textAlign = 'right';
      ctx.fillText(oddsText, percentageX, oddsY);

      // Draw payout with mixed colors
      ctx.font = '400 20px system-ui, sans-serif'; // Increased from 17px to 20px
      const payoutY = oddsY + 34; // Reduced from 38 to bring closer

      // Measure and draw the full text with green payout
      const greenWidth = ctx.measureText(greenText).width;

      // Draw "$X" in green (right-aligned)
      ctx.fillStyle = 'rgb(0, 186, 124)'; // Green color
      ctx.fillText(greenText, oddsColumnEnd, payoutY);

      // Draw "$100 → " in gray (to the left of green text)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(prefix, oddsColumnEnd - greenWidth, payoutY);

      ctx.textAlign = 'left'; // Reset alignment

      // Draw Sonotrade banner in its own column on the far right
      let banner = bannerImgRef.current;
      if (!banner) {
        banner = new Image();
        banner.src = '/banner.png';
        bannerImgRef.current = banner;
      }

      if (banner.complete && banner.width && banner.height) {
        const bannerHeight = 55; // Increased from 50px to 55px
        const bannerAspectRatio = banner.width / banner.height;
        const bannerWidth = bannerHeight * bannerAspectRatio;

        // Calculate total height of banner + text + gap
        const textGap = 7; // Reduced gap between banner and text
        const textHeight = 16; // Approximate text height (increased for 15px font)
        const totalHeight = bannerHeight + textGap + textHeight;
        const rightMargin = 0; // Minimal right margin from rectangle edge

        // Position banner and text as a group, vertically centered
        const groupY = boxY + (boxHeight - totalHeight) / 2;
        // Position banner with right margin considered
        const maxBannerRight = boxX + boxWidth - textPadding - rightMargin;
        const bannerX = maxBannerRight - bannerWidth;
        const bannerY = groupY;

        // Draw banner (removed bounds check to debug)
        ctx.drawImage(banner, bannerX, bannerY, bannerWidth, bannerHeight);

        // Draw "Exclusive access in bio" below the banner
        ctx.font = '400 17px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // White at 50% opacity
        ctx.textAlign = 'center';
        const textX = bannerX + bannerWidth / 2; // Center text under banner
        const textY = bannerY + bannerHeight + textGap + 10;
        ctx.fillText('Exclusive access in bio', textX, textY);
      }

      // Reset text alignment to left (default)
      ctx.textAlign = 'left';
    }
  }

  function drawForumBannerOnContext({ ctx, boxY }: { ctx: CanvasRenderingContext2D; boxY: number }): void {
    const boxHeight = 90;
    const boxX = 0;
    const boxWidth = CANVAS_W;

    // Blue background, no border, no corner radius
    ctx.fillStyle = '#246eff';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Logo on the left, vertically centered
    let logo = logoImgRef.current;
    if (!logo) {
      logo = new Image();
      logo.src = overlayLogoSrc;
      logoImgRef.current = logo;
    }
    if (logo.complete && logo.width && logo.height) {
      const logoH = 60;
      const logoW = logoH * (logo.width / logo.height);
      const logoX = 60;
      const logoY = boxY + (boxHeight - logoH) / 2;
      ctx.drawImage(logo, logoX, logoY, logoW, logoH);

      // "Forum" text to the right of the logo
      ctx.font = 'bold 46px "Arial MT Pro", "Arial Black", Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText('Forum', logoX + logoW + 10, boxY + boxHeight / 2 + 3);

      // Right side: [event ID] [▲] [% change], all right-aligned as a group
      const tagText = tag?.trim() || '';
      const changeText = overlayChange?.trim() || '';
      if (tagText || changeText) {
        ctx.font = '300 34px "Arial MT Pro", Arial, sans-serif';
        const triW = 22;
        const triH = 19;
        const triGap = 14;
        const centerY = boxY + boxHeight / 2 + 3;
        const rightEdge = CANVAS_W - 90;

        // Measure text widths
        const changeWidth = changeText ? ctx.measureText(changeText).width : 0;
        const tagWidth = tagText ? ctx.measureText(tagText).width : 0;

        // Calculate group width: tag + gap + triangle + gap + change
        const groupWidth = tagWidth + (tagWidth ? triGap : 0) + triW + (changeText ? triGap : 0) + changeWidth;
        let x = rightEdge - groupWidth;

        // Draw event ID
        if (tagText) {
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(tagText, x, centerY);
          x += tagWidth + triGap;
        }

        // Draw triangle
        const triY = centerY - triH / 2 - 4;
        ctx.fillStyle = '#00c853';
        ctx.beginPath();
        ctx.moveTo(x + triW / 2, triY);
        ctx.lineTo(x + triW, triY + triH);
        ctx.lineTo(x, triY + triH);
        ctx.closePath();
        ctx.fill();
        x += triW + (changeText ? triGap : 0);

        // Draw % change
        if (changeText) {
          ctx.fillStyle = '#00c853';
          ctx.textBaseline = 'middle';
          ctx.fillText(changeText, x, centerY);
        }

        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  // ── Draw loop (black bg + global header + cropped video) ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const v = videoRef.current;
    if (!canvas || !v) return;
    const video = v;
    const ctx = canvas.getContext('2d')!;
    let active = true;

    function draw() {
      if (!active) return;
      raf.current = requestAnimationFrame(draw);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const { x, y, w, h } = boxRef.current;
        const { x: ox, y: oy } = videoOffsetRef.current;

        // First pass: calculate the header height without drawing
        const captionLines = overlayCaption ? countCaptionLines(ctx) : 0;

        const CAPTION_BOTTOM_OFFSET = 18;
        const headerHeight = overlayCaption
          ? BASE_HEADER_HEIGHT + CAPTION_TOP_PADDING + (captionLines * CAPTION_LINE_HEIGHT) - CAPTION_BOTTOM_OFFSET
          : BASE_HEADER_HEIGHT;

        // Header: fixed X, but Y follows the crop box (16px overlap)
        const headerY = Math.max(0, y - headerHeight + 4);
        drawHeaderOnContext({ ctx, cx: 0, cy: headerY, cw: CANVAS_W, countCaptionLinesFn: countCaptionLines });

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const scale = Math.min(VIDEO_TARGET_W / vw, CANVAS_H / vh) * videoScaleRef.current;
        const drawW = vw * scale;
        const drawH = vh * scale;
        const dx = (CANVAS_W - drawW) / 2 + ox;
        const dy = (CANVAS_H - drawH) / 2 + oy;

        ctx.save();
        // Clip video to the crop box, but do NOT affect the header above
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(video, dx, dy, drawW, drawH);
        ctx.restore();

        // Draw brand element below the video
        if (brand === 'forum') {
          drawForumBannerOnContext({ ctx, boxY: y + h + 30 });
        } else {
          drawMarketCardOnContext({ ctx, boxY: y + h + 30 });
        }
      }
    }
    draw();
    return () => { active = false; cancelAnimationFrame(raf.current); };
  }, [videoSrc, overlayDisplayName, overlayHandle, overlayDate, overlayVerified, overlayCaption, videoScale, marketData, brand, overlayChange]);

  // ── Pinch-to-zoom (wheel/trackpad + touch gestures) ──────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle wheel/trackpad pinch
    function onWheel(e: WheelEvent) {
      // Check if it's a pinch gesture (ctrlKey is set for trackpad pinch on most browsers)
      // Also support regular wheel for zoom
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY;
        const scaleFactor = 1 + delta * 0.01;
        const newScale = Math.max(0.5, Math.min(3, videoScaleRef.current * scaleFactor));
        videoScaleRef.current = newScale;
        setVideoScale(newScale);
      }
    }

    // Handle touch pinch gestures
    let initialDistance = 0;
    let initialScale = 1;

    function getTouchDistance(touches: TouchList): number {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        initialDistance = getTouchDistance(e.touches);
        initialScale = videoScaleRef.current;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && initialDistance > 0) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches);
        const scaleFactor = currentDistance / initialDistance;
        const newScale = Math.max(0.5, Math.min(3, initialScale * scaleFactor));
        videoScaleRef.current = newScale;
        setVideoScale(newScale);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) {
        initialDistance = 0;
      }
    }

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // ── Global mouse move / up (drag works even outside the canvas) ──────────────
  useEffect(() => {
    function applyDrag(dx: number, dy: number, shiftKey: boolean) {
      if (!drag.current) return;
      const { handle: h, sb, videoOffsetStart } = drag.current;
      let nx = sb.x, ny = sb.y, nw = sb.w, nh = sb.h;

      if (h === 'move') {
        // Dragging the center pans the video under a fixed crop box
        videoOffsetRef.current = {
          x: videoOffsetStart.x + dx,
          y: videoOffsetStart.y + dy,
        };
        return;
      }

      switch (h) {
        case 'br':
          if (shiftKey) {
            nh = Math.max(MIN_DIM, sb.h + dy * 2); ny = sb.y - dy;
          } else {
            nh = Math.max(MIN_DIM, sb.h + dy);
          }
          break;
        case 'bl':
          if (shiftKey) {
            nh = Math.max(MIN_DIM, sb.h + dy * 2); ny = sb.y - dy;
          } else {
            nh = Math.max(MIN_DIM, sb.h + dy);
          }
          break;
        case 'tr':
          if (shiftKey) {
            nh = Math.max(MIN_DIM, sb.h - dy * 2); ny = sb.y + dy;
          } else {
            nh = Math.max(MIN_DIM, sb.h - dy); ny = sb.y + sb.h - nh;
          }
          break;
        case 'tl':
          if (shiftKey) {
            nh = Math.max(MIN_DIM, sb.h - dy * 2); ny = sb.y + dy;
          } else {
            nh = Math.max(MIN_DIM, sb.h - dy); ny = sb.y + sb.h - nh;
          }
          break;
        case 'tc':
          if (shiftKey) {
            nh = Math.max(MIN_DIM, sb.h - dy * 2); ny = sb.y + dy;
          } else {
            nh = Math.max(MIN_DIM, sb.h - dy); ny = sb.y + sb.h - nh;
          }
          break;
        case 'bc':
          if (shiftKey) {
            nh = Math.max(MIN_DIM, sb.h + dy * 2); ny = sb.y - dy;
          } else {
            nh = Math.max(MIN_DIM, sb.h + dy);
          }
          break;
      }

      const b = { x: nx, y: ny, w: nw, h: nh };
      boxRef.current = b;
      setBox({ ...b });
    }

    function onMove(e: MouseEvent) {
      if (!drag.current) return;
      // Convert screen-space drag delta to canvas-space by dividing to DISPLAY_SCALE
      const dx = (e.clientX - drag.current.sx) / DISPLAY_SCALE;
      const dy = (e.clientY - drag.current.sy) / DISPLAY_SCALE;
      applyDrag(dx, dy, e.shiftKey);
    }
    function onUp() { drag.current = null; }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  function startDrag(e: React.MouseEvent, handle: Handle) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      handle,
      sx: e.clientX,
      sy: e.clientY,
      sb: { ...boxRef.current },
      videoOffsetStart: { ...videoOffsetRef.current },
    };
  }

  function resetBox() {
    const video = videoRef.current;
    if (video && video.videoWidth && video.videoHeight) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      // Calculate scale to fit video to VIDEO_TARGET_W width
      const scale = Math.min(VIDEO_TARGET_W / vw, CANVAS_H / vh);
      const drawW = vw * scale;
      const drawH = vh * scale;
      // Center the crop box on the canvas
      const x = (CANVAS_W - drawW) / 2;
      const y = (CANVAS_H - drawH) / 2;
      const b = { x, y, w: drawW, h: drawH };
      boxRef.current = b;
      setBox(b);
    } else {
      // Fallback if video not loaded yet
      const b = { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
      boxRef.current = b;
      setBox(b);
    }
    videoOffsetRef.current = { x: 0, y: 0 };
    videoScaleRef.current = 1;
    setVideoScale(1);
  }

  function centerEverything() {
    // Calculate header height
    let headerHeight = BASE_HEADER_HEIGHT;
    if (overlayCaption) {
      // Use canvas context to measure text accurately
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const captionLines = countCaptionLines(ctx);
          const CAPTION_BOTTOM_OFFSET = 18;
          headerHeight = BASE_HEADER_HEIGHT + CAPTION_TOP_PADDING + (captionLines * CAPTION_LINE_HEIGHT) - CAPTION_BOTTOM_OFFSET;
        }
      }
    }

    const currentBox = boxRef.current;
    const oldY = currentBox.y;
    const cropBoxHeight = currentBox.h;

    // Market box height (if present)
    const hasMarketBox = tag?.trim() && marketData && marketData.markets && marketData.markets.length > 0;
    const marketBoxHeight = hasMarketBox ? 140 + 30 : 0; // 140 box height + 30px gap

    // Total content height
    const totalHeight = headerHeight + cropBoxHeight + marketBoxHeight;

    // Calculate starting Y to center everything on canvas
    const startY = (CANVAS_H - totalHeight) / 2;

    // Header is positioned at startY (drawn above crop box)
    // Crop box Y = startY + headerHeight
    const newY = startY + headerHeight;

    // Calculate how much the crop box moved
    const deltaY = newY - oldY;

    // Update crop box position (keep width and x position)
    const b = { x: currentBox.x, y: newY, w: currentBox.w, h: currentBox.h };
    boxRef.current = b;
    setBox({ ...b });

    // Move video with the crop box (maintain relative position)
    videoOffsetRef.current = {
      x: videoOffsetRef.current.x,
      y: videoOffsetRef.current.y + deltaY
    };
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }

  // ── Handle positions ─────────────────────────────────────────────────────────
  const handles: { type: Handle; cx: number; cy: number }[] = [
    { type: 'tl', cx: box.x * DISPLAY_SCALE,           cy: box.y * DISPLAY_SCALE           },
    { type: 'tc', cx: (box.x + box.w / 2) * DISPLAY_SCALE, cy: box.y * DISPLAY_SCALE       },
    { type: 'tr', cx: (box.x + box.w) * DISPLAY_SCALE,   cy: box.y * DISPLAY_SCALE         },
    { type: 'bl', cx: box.x * DISPLAY_SCALE,           cy: (box.y + box.h) * DISPLAY_SCALE },
    { type: 'bc', cx: (box.x + box.w / 2) * DISPLAY_SCALE, cy: (box.y + box.h) * DISPLAY_SCALE },
    { type: 'br', cx: (box.x + box.w) * DISPLAY_SCALE,   cy: (box.y + box.h) * DISPLAY_SCALE },
  ];

  // ── Professional export: demux → decode → render → encode → mux ──────────────────
  async function startRecording(): Promise<void> {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video || isRecording) {
      throw new Error('Cannot start recording');
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    setIsRecording(true);
    setRecProgress(0);
    setRecStatus('Initializing...');
    console.log('[startRecording] Starting professional MP4 export...');

    try {
      // Import libraries dynamically
      const mediabunny = await import('mediabunny');

      const {
        Output,
        Mp4OutputFormat,
        BufferTarget,
        VideoSample,
        VideoSampleSource,
        EncodedAudioPacketSource,
        EncodedPacketSink,
        Input,
        BlobSource,
        ALL_FORMATS,
        QUALITY_HIGH,
      } = mediabunny;

      // @ts-ignore
      console.log('[startRecording] MP4Box:', MP4Box);
      // @ts-ignore
      const MP4BoxFile = MP4Box.createFile();
      // @ts-ignore
      console.log('[startRecording] MP4BoxFile created:', MP4BoxFile);

      // Get the video URL - try to get the original URL from videoSrc prop
      // The proxy URL (/api/proxy?stream=1&...) doesn't work well with mp4box
      const videoSrc = video.src || video.currentSrc;

      // Extract the original URL from the proxy URL
      let videoUrl = videoSrc;
      if (videoSrc.includes('/api/proxy')) {
        try {
          const urlParam = new URL(videoSrc, window.location.origin).searchParams.get('url');
          if (urlParam) {
            videoUrl = decodeURIComponent(urlParam);
            console.log('[startRecording] Using original URL instead of proxy');
          }
        } catch (e) {
          console.warn('[startRecording] Could not extract original URL from proxy URL');
        }
      }

      if (!videoUrl) {
        throw new Error('No video source URL available');
      }

      console.log('[startRecording] Video URL:', videoUrl);
      setRecStatus('Downloading video file...');

      // Fetch the video file as ArrayBuffer
      let arrayBuffer: ArrayBuffer;
      try {
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        arrayBuffer = await response.arrayBuffer();
        console.log('[startRecording] Video fetched, size:', arrayBuffer.byteLength);
      } catch (fetchError) {
        console.error('[startRecording] Fetch error:', fetchError);
        throw new Error(`Failed to download video: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
      }

      // Demux with mp4box.js
      setRecStatus('Parsing video file...');
      console.log('[startRecording] Demuxing with mp4box...');

      // Set up sample tracking
      let videoSamples: Array<{ data: Uint8Array; timestamp: number; duration: number; isKeyframe: boolean }> = [];
      let audioSamples: Array<{ data: Uint8Array; timestamp: number; duration: number }> = [];
      let videoTrackId: number | null = null;
      let audioTrackId: number | null = null;
      let videoTimescale = 90000;
      let audioTimescale = 44100;
      let samplesReady = false;
      let audioDecoderConfig: Uint8Array | null = null; // AAC AudioSpecificConfig

      // Set up mp4box callbacks
      MP4BoxFile.onReady = (info: any) => {
        console.log('[startRecording] MP4 onReady - info:', info);
        setRecStatus('Parsing video file...');

        // Find video and audio tracks
        for (const track of info.tracks || []) {
          console.log('[startRecording] Track:', track.id, track.codec, track.type);
          if (track.type === 'video' && !videoTrackId) {
            videoTrackId = track.id;
            videoTimescale = track.timescale || 90000;
          }
          if (track.type === 'audio' && !audioTrackId) {
            audioTrackId = track.id;
            audioTimescale = track.timescale || 44100;
          }
        }

        console.log('[startRecording] Video track ID:', videoTrackId, 'Audio track ID:', audioTrackId);

        // Extract AAC AudioSpecificConfig from audio track
        if (audioTrackId) {
          try {
            // @ts-ignore
            const audioSampleDescs = MP4BoxFile.getSampleDescription(audioTrackId);
            console.log('[startRecording] Audio sample descriptions:', audioSampleDescs);
            if (audioSampleDescs && audioSampleDescs[0]) {
              const desc = audioSampleDescs[0];
              // Log all properties of the description for debugging
              // @ts-ignore
              console.log('[startRecording] Audio desc keys:', Object.keys(desc));
              // @ts-ignore
              console.log('[startRecording] Audio desc:', desc);

              // Try different paths to find the AudioSpecificConfig
              // @ts-ignore
              if (desc.esds) {
                // @ts-ignore
                console.log('[startRecording] esds keys:', Object.keys(desc.esds));
                // @ts-ignore
                console.log('[startRecording] esds:', desc.esds);

                // Try esds.ESDescriptor.decConfigDescr.decSpecificInfo
                // @ts-ignore
                if (desc.esds.ESDescriptor && desc.esds.ESDescriptor.decConfigDescr) {
                  // @ts-ignore
                  const decConfig = desc.esds.ESDescriptor.decConfigDescr;
                  // @ts-ignore
                  if (decConfig.decSpecificInfo && decConfig.decSpecificInfo.data) {
                    // @ts-ignore
                    audioDecoderConfig = new Uint8Array(decConfig.decSpecificInfo.data);
                    console.log('[startRecording] AAC AudioSpecificConfig extracted from decSpecificInfo, length:', audioDecoderConfig.length);
                  }
                  // @ts-ignore
                  else if (decConfig.decSpecificInfo) {
                    // @ts-ignore
                    audioDecoderConfig = new Uint8Array(decConfig.decSpecificInfo);
                    console.log('[startRecording] AAC AudioSpecificConfig extracted (direct), length:', audioDecoderConfig.length);
                  }
                }

                // Fallback: try esds.descriptor directly
                // @ts-ignore
                if (!audioDecoderConfig && desc.esds.descriptor) {
                  // @ts-ignore
                  audioDecoderConfig = new Uint8Array(desc.esds.descriptor);
                  console.log('[startRecording] AAC AudioSpecificConfig extracted from descriptor, length:', audioDecoderConfig.length);
                }

                // Another fallback: try esds.data
                // @ts-ignore
                if (!audioDecoderConfig && desc.esds.data) {
                  // @ts-ignore
                  audioDecoderConfig = new Uint8Array(desc.esds.data);
                  console.log('[startRecording] AAC AudioSpecificConfig extracted from esds.data, length:', audioDecoderConfig.length);
                }
              }

              // Last resort: try to find any buffer-like property
              if (!audioDecoderConfig) {
                // @ts-ignore
                for (const key in desc) {
                  // @ts-ignore
                  const val = desc[key];
                  if (val && (val instanceof Uint8Array || (val.buffer && val.buffer instanceof ArrayBuffer))) {
                    // @ts-ignore
                    audioDecoderConfig = new Uint8Array(val);
                    console.log('[startRecording] AAC AudioSpecificConfig extracted from', key, ', length:', audioDecoderConfig.length);
                    break;
                  }
                }
              }

              if (!audioDecoderConfig) {
                console.warn('[startRecording] Could not extract AAC AudioSpecificConfig, will use default');
                // Use a default AAC-LC AudioSpecificConfig for 44.1kHz stereo
                // This is [0x11, 0x90] = AAC-LC, 44.1kHz, stereo
                audioDecoderConfig = new Uint8Array([0x11, 0x90]);
                console.log('[startRecording] Using default AAC AudioSpecificConfig');
              }
            }
          } catch (e) {
            console.warn('[startRecording] Failed to extract audio decoder config:', e);
            // Use default as fallback
            audioDecoderConfig = new Uint8Array([0x11, 0x90]);
            console.log('[startRecording] Using default AAC AudioSpecificConfig after error');
          }
        }

        // Start extracting samples
        if (videoTrackId) {
          MP4BoxFile.setExtractionOptions(videoTrackId, null, { nbSamples: Infinity });
        }
        if (audioTrackId) {
          MP4BoxFile.setExtractionOptions(audioTrackId, null, { nbSamples: Infinity });
        }
        MP4BoxFile.start();
      };

      MP4BoxFile.onSamples = (id: number, user: any, samples: any[]) => {
        console.log('[startRecording] onSamples called - track ID:', id, 'sample count:', samples.length);
        if (id === videoTrackId) {
          for (const sample of samples) {
            // sample.data is already a Uint8Array in mp4box
            videoSamples.push({
              data: new Uint8Array(sample.data), // Clone to prevent reference issues
              timestamp: sample.cts / videoTimescale,
              duration: sample.duration / videoTimescale,
              isKeyframe: sample.is_sync,
            });
          }
          console.log('[startRecording] Video samples total:', videoSamples.length);
        }
        if (id === audioTrackId) {
          for (const sample of samples) {
            // sample.data is already a Uint8Array in mp4box
            audioSamples.push({
              data: new Uint8Array(sample.data), // Clone to prevent reference issues
              timestamp: sample.cts / audioTimescale,
              duration: sample.duration / audioTimescale,
            });
          }
          console.log('[startRecording] Audio samples total:', audioSamples.length);
        }
      };

      // Append the buffer and parse
      console.log('[startRecording] Appending buffer to mp4box...');
      const arrayBufferCopy = arrayBuffer.slice(0);

      // Check file header to see if it's a valid MP4
      const header = new Uint8Array(arrayBufferCopy.slice(0, 12));
      console.log('[startRecording] File header:', Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' '));
      // MP4 files start with FTYP box (usually 00 00 00 XX 66 74 79 70)

      // Set up error handler for mp4box
      // @ts-ignore
      MP4BoxFile.onError = (error: any) => {
        console.error('[startRecording] MP4Box error:', error);
      };

      try {
        // mp4box requires the buffer to have a fileStart property
        // @ts-ignore
        arrayBufferCopy.fileStart = 0;
        // @ts-ignore
        const offset = MP4BoxFile.appendBuffer(arrayBufferCopy);
        console.log('[startRecording] appendBuffer returned offset:', offset);

        console.log('[startRecording] Calling flush...');
        // @ts-ignore
        MP4BoxFile.flush();

        console.log('[startRecording] Flush completed, waiting for onReady callback...');
      } catch (e) {
        console.error('[startRecording] Error during mp4box append/flush:', e);
        throw new Error(`MP4 parsing error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }

      // Wait for samples to be extracted (with timeout)
      console.log('[startRecording] Waiting for sample extraction...');
      const maxWaitTime = 10000; // 10 seconds
      const startTime = Date.now();

      await new Promise<void>((resolve, reject) => {
        const checkInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          if (videoSamples.length > 0) {
            clearInterval(checkInterval);
            console.log('[startRecording] Samples extracted successfully');
            resolve();
          } else if (elapsed > maxWaitTime) {
            clearInterval(checkInterval);
            reject(new Error('Timeout waiting for video samples extraction. The video format may not be supported.'));
          }
        }, 100);
      });

      console.log('[startRecording] Video samples extracted:', videoSamples.length);
      console.log('[startRecording] Audio samples extracted:', audioSamples.length);

      if (videoSamples.length === 0) {
        throw new Error('No video samples found in file - the video may be corrupted or in an unsupported format');
      }

      // Calculate export parameters
      const lastVideoSample = videoSamples[videoSamples.length - 1];
      const videoDuration = lastVideoSample.timestamp + lastVideoSample.duration;
      const outputFps = 30;
      const totalFrames = Math.floor(videoDuration * outputFps);
      const frameDuration = 1 / outputFps;

      console.log('[startRecording] Video duration:', videoDuration, 'totalFrames:', totalFrames);

      setRecStatus('Decoding video...');

      // Set up video decoder
      const decodedFrames: Array<{ frame: VideoFrame; timestamp: number }> = [];
      let decodeIndex = 0;

      const decoder = new VideoDecoder({
        output: (frame: VideoFrame) => {
          decodedFrames.push({ frame, timestamp: frame.timestamp / 1_000_000 });
          decodeIndex++;
        },
        error: (e: Error) => {
          console.error('[VideoDecoder] error:', e);
        },
      });

      // Get the video track to extract codec description
      // @ts-ignore
      const videoTrack = MP4BoxFile.getTrackById(videoTrackId);
      console.log('[startRecording] Video track:', videoTrack);
      // Log all properties of videoTrack
      // @ts-ignore
      for (const key in videoTrack) {
        try {
          // @ts-ignore
          console.log('[startRecording] videoTrack.' + key + ':', typeof videoTrack[key]);
        } catch (e) {}
      }

      // Try to get the AVC decoder configuration record
      let description: Uint8Array | undefined;

      // Method 1: Try mp4box's getSampleDescription
      // @ts-ignore
      if (typeof MP4BoxFile.getSampleDescription === 'function') {
        // @ts-ignore
        const sampleDescriptions = MP4BoxFile.getSampleDescription(videoTrackId);
        console.log('[startRecording] Sample descriptions:', sampleDescriptions);
        if (sampleDescriptions && sampleDescriptions[0]) {
          console.log('[startRecording] Sample desc[0]:', sampleDescriptions[0]);
          // @ts-ignore
          description = sampleDescriptions[0].avcC?.config || sampleDescriptions[0].avcC;
        }
      }

      // Method 2: Try accessing through track structure (stsd entries)
      if (!description) {
        try {
          // @ts-ignore
          const stsd = videoTrack?.mdia?.minf?.stbl?.stsd;
          console.log('[startRecording] stsd:', stsd);
          // @ts-ignore
          const entries = stsd?.entries;
          console.log('[startRecording] stsd.entries:', entries);
          if (entries && entries[0]) {
            // @ts-ignore
            const avcC = entries[0].avcC;
            if (avcC) {
              // @ts-ignore
              console.log('[startRecording] avcC.config:', avcC.config);
              // @ts-ignore
              console.log('[startRecording] avcC.data:', avcC.data);
              // @ts-ignore
              console.log('[startRecording] avcC.size:', avcC.size);
              // @ts-ignore
              console.log('[startRecording] avcC.start:', avcC.start);
              // @ts-ignore
              console.log('[startRecording] avcC.fileStart:', avcC.fileStart);
              // @ts-ignore
              console.log('[startRecording] avcC.hdr_size:', avcC.hdr_size);
              // @ts-ignore
              console.log('[startRecording] avcC.subarray:', typeof avcC.subarray);

              // The config is typically a Uint8Array stored in avcC.config
              // @ts-ignore
              if (avcC.config && avcC.config.length > 0) {
                // @ts-ignore
                description = new Uint8Array(avcC.config);
                console.log('[startRecording] Got config from avcC.config, length:', description.length);
              }
              // Try using subarray if available
              // @ts-ignore
              else if (typeof avcC.subarray === 'function') {
                // @ts-ignore
                description = avcC.subarray();
                if (description) {
                  console.log('[startRecording] Got config from avcC.subarray, length:', description.length);
                }
              }
              // If avcC has a start position and size, read from original buffer
              // @ts-ignore
              else if (typeof avcC.start !== 'undefined' && avcC.size) {
                // @ts-ignore
                const start = avcC.start;
                // @ts-ignore
                const size = avcC.size;
                // The start position includes the 8-byte box header (4 bytes size + 4 bytes type "avcC")
                // The actual AVC decoder configuration record starts after the header
                // We need to skip the 8-byte header to get the actual config
                const headerSize = 8;
                const configStart = start + headerSize;
                const configSize = size - headerSize;
                const configData = new Uint8Array(arrayBuffer, configStart, configSize);
                description = configData;
                console.log('[startRecording] Got config from raw buffer at', configStart, 'size', configSize, 'length:', description.length);
                console.log('[startRecording] Config data (first 20 bytes):', Array.from(description.slice(0, Math.min(20, description.length))).map(b => b.toString(16).padStart(2, '0')).join(' '));
              }
            }
          }
        } catch (e) {
          console.log('[startRecording] Error accessing stsd:', e);
        }
      }

      // Method 3: Try description property on codec
      if (!description) {
        // @ts-ignore
        description = videoTrack?.codec?.description;
      }

      console.log('[startRecording] AVC decoder config:', description ? 'found, length=' + description.length : 'not found');

      // If still no description, try to extract from the first sample's data
      // The AVC decoder configuration is often at the beginning of H.264 streams
      if (!description) {
        console.log('[startRecording] Trying to extract description from samples...');
        // Find first keyframe sample
        const firstKeyframe = videoSamples.find(s => s.isKeyframe);
        if (firstKeyframe) {
          // The AVC decoder configuration record starts with 0x00 0x00 0x00 0x01 followed by SPS
          // Let's try to find it in the sample data
          const data = firstKeyframe.data;
          console.log('[startRecording] First keyframe data (first 20 bytes):', Array.from(data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
      }

      // Configure decoder with the proper codec string and description
      // The codec is avc1.64001f which means H.264 High Profile Level 3.1
      const decoderConfig: VideoDecoderConfig = {
        codec: 'avc1.64001F',
        codedWidth: 1080,
        codedHeight: 1920,
        // @ts-ignore - description is required for AVC H.264
        description: description,
      };

      const isSupported = await VideoDecoder.isConfigSupported(decoderConfig);
      console.log('[startRecording] Decoder config supported:', isSupported.supported);

      decoder.configure(decoderConfig);

      // Decode all video samples
      for (let i = 0; i < videoSamples.length; i++) {
        if (signal.aborted) {
          decoder.close();
          throw new Error('Cancelled');
        }

        const sample = videoSamples[i];
        const chunk = new EncodedVideoChunk({
          type: sample.isKeyframe ? 'key' : 'delta',
          timestamp: sample.timestamp * 1_000_000,
          data: sample.data,
        });

        await decoder.decode(chunk);
        setRecProgress(0.1 + (i / videoSamples.length) * 0.3);
      }

      await decoder.flush();
      decoder.close();

      console.log('[startRecording] Decoded frames:', decodedFrames.length);

      setRecStatus('Preparing audio...');

      // Create Mediabunny output
      const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
      });

      // Set up video encoder
      const videoSource = new VideoSampleSource({
        codec: 'avc',
        bitrate: QUALITY_HIGH,
      });
      output.addVideoTrack(videoSource);

      // Set up audio track BEFORE starting output
      let audioSource: any = null;
      let audioPackets: any[] = []; // Store EncodedPackets from mediabunny
      let audioDecoderConfigForExport: any = null;

      if (audioSamples.length > 0) {
        console.log('[startRecording] Setting up audio using mediabunny Input...');

        try {
          // Fetch video as Blob
          const videoBlob = await fetch(videoSrc).then(r => r.blob());

          // Open with mediabunny Input
          const input = new Input({
            source: new BlobSource(videoBlob),
            formats: ALL_FORMATS,
          });

          const audioTrack = await input.getPrimaryAudioTrack();

          if (audioTrack) {
            // Get the decoder config - this is the exact format WebCodecs wants
            audioDecoderConfigForExport = await audioTrack.getDecoderConfig();
            console.log('[startRecording] Audio decoderConfig from mediabunny:', audioDecoderConfigForExport);

            // Create EncodedAudioPacketSource and add to output BEFORE start()
            audioSource = new EncodedAudioPacketSource('aac');
            output.addAudioTrack(audioSource);

            // Create EncodedPacketSink to iterate packets in decode order
            const sink = new EncodedPacketSink(audioTrack);

            // Collect all packets using the packets() async generator
            for await (const packet of sink.packets()) {
              audioPackets.push(packet);
            }

            console.log('[startRecording] Collected', audioPackets.length, 'audio packets from mediabunny');

            // Get the first timestamp for alignment
            const firstTimestamp = audioPackets[0]?.timestamp || 0;
            console.log('[startRecording] First audio timestamp:', firstTimestamp);

            // Align timestamps to start at 0
            for (const packet of audioPackets) {
              packet.timestamp = packet.timestamp - firstTimestamp;
            }

            // Remove any packets with negative timestamps after alignment
            audioPackets = audioPackets.filter((p: any) => p.timestamp >= 0);
            console.log('[startRecording] After alignment and filtering:', audioPackets.length, 'packets');
          }
        } catch (audioError) {
          console.error('[startRecording] Audio setup failed:', audioError);
        }
      }

      setRecStatus('Rendering frames...');

      await output.start();

      // Create offscreen canvas for rendering
      const offscreenCanvas = new OffscreenCanvas(CANVAS_W, CANVAS_H);
      const offscreenCtx = offscreenCanvas.getContext('2d')!;

      // Log for debugging
      if (decodedFrames.length > 0) {
        const firstFrame = decodedFrames[0].frame;
        // @ts-ignore
        console.log('[startRecording] First frame dimensions:', firstFrame.codedWidth, 'x', firstFrame.codedHeight);
      }

      // Render and encode each output frame
      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        if (signal.aborted) {
          await output.finalize();
          throw new Error('Cancelled');
        }

        const targetTimestamp = frameIdx * frameDuration;

        // Find the nearest decoded frame
        let sourceFrame = decodedFrames[0];
        for (const f of decodedFrames) {
          if (f.timestamp <= targetTimestamp) {
            sourceFrame = f;
          } else {
            break;
          }
        }

        // Clear canvas
        offscreenCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        // Get current crop box, scale, and offset
        const box = boxRef.current;
        const userScale = videoScaleRef.current;
        const { x: ox, y: oy } = videoOffsetRef.current;

        // Draw background (black)
        offscreenCtx.fillStyle = '#000';
        offscreenCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Get original video dimensions (from video element, not decoded frame)
        // The decoded frame may have different dimensions due to encoding
        const video = videoRef.current;
        const vw = video?.videoWidth || 1080;
        const vh = video?.videoHeight || 1920;

        // Use same scaling logic as main canvas:
        // Scale to fit VIDEO_TARGET_W (1000px) width or full canvas height
        const scale = Math.min(VIDEO_TARGET_W / vw, CANVAS_H / vh) * userScale;
        const drawW = vw * scale;
        const drawH = vh * scale;

        // Center in full canvas (not crop box), then apply offset
        const dx = (CANVAS_W - drawW) / 2 + ox;
        const dy = (CANVAS_H - drawH) / 2 + oy;

        // Clip and draw video to crop box
        offscreenCtx.save();
        offscreenCtx.beginPath();
        offscreenCtx.rect(box.x, box.y, box.w, box.h);
        offscreenCtx.clip();
        offscreenCtx.drawImage(sourceFrame.frame, dx, dy, drawW, drawH);
        offscreenCtx.restore();

        // Draw header overlay using reusable function (exact match with main canvas)
        // First calculate header height to position it correctly
        // @ts-ignore - OffscreenCanvasRenderingContext2D is compatible for our use
        const captionLines = overlayCaption ? countCaptionLines(offscreenCtx) : 0;

        const CAPTION_BOTTOM_OFFSET = 18;
        const headerHeight = overlayCaption
          ? BASE_HEADER_HEIGHT + CAPTION_TOP_PADDING + (captionLines * CAPTION_LINE_HEIGHT) - CAPTION_BOTTOM_OFFSET
          : BASE_HEADER_HEIGHT;
        const headerY = Math.max(0, box.y - headerHeight + 4);
        // @ts-ignore - OffscreenCanvasRenderingContext2D is compatible for our use
        drawHeaderOnContext({ ctx: offscreenCtx, cx: 0, cy: headerY, cw: CANVAS_W, countCaptionLinesFn: countCaptionLines });

        // Draw brand element below video (exact match with main canvas)
        if (brand === 'forum') {
          // @ts-ignore - OffscreenCanvasRenderingContext2D is compatible for our use
          drawForumBannerOnContext({ ctx: offscreenCtx, boxY: box.y + box.h + 30 });
        } else {
          // @ts-ignore - OffscreenCanvasRenderingContext2D is compatible for our use
          drawMarketCardOnContext({ ctx: offscreenCtx, boxY: box.y + box.h + 30 });
        }

        // Create VideoSample from offscreen canvas
        const sample = new VideoSample(offscreenCanvas, {
          timestamp: targetTimestamp,
          duration: frameDuration,
        });

        await videoSource.add(sample);
        sample.close();

        // Update progress
        setRecProgress(0.4 + (frameIdx / totalFrames) * 0.4);
      }

      // Clean up decoded frames
      for (const { frame } of decodedFrames) {
        frame.close();
      }

      // Add audio packets using stored EncodedPacket objects from mediabunny
      if (audioSource && audioPackets.length > 0) {
        setRecStatus('Adding audio...');
        console.log('[startRecording] Adding', audioPackets.length, 'audio packets...');

        for (let i = 0; i < audioPackets.length; i++) {
          const packet = audioPackets[i];

          // Pass decoderConfig only on first packet
          if (i === 0) {
            await audioSource.add(packet, { decoderConfig: audioDecoderConfigForExport });
            console.log('[startRecording] Added first audio packet with decoderConfig');
          } else {
            await audioSource.add(packet);
          }
        }
        console.log('[startRecording] Audio packets added:', audioPackets.length);
      }

      setRecStatus('Finalizing...');
      setRecProgress(0.95);

      await output.finalize();

      console.log('[startRecording] Export complete');

      const buffer = output.target.buffer;
      if (!buffer) {
        throw new Error('No buffer received from output');
      }

      const blob = new Blob([buffer], { type: 'video/mp4' });

      // Download
      const url = URL.createObjectURL(blob);
      const filename = `row-${String(rowNumber + 1).padStart(2, '0')}-${videoId ?? 'export'}.mp4`;
      Object.assign(document.createElement('a'), {
        href: url,
        download: filename,
      }).click();
      URL.revokeObjectURL(url);

      setRecProgress(1);
    } catch (error) {
      if (error instanceof Error && error.message !== 'Cancelled') {
        console.error('[startRecording] Export failed:', error);
        // Show error to user via status
        setRecStatus(`Error: ${error.message}`);
        // Keep the error visible for 3 seconds
        setTimeout(() => {
          setRecStatus('');
        }, 3000);
        throw error;
      }
    } finally {
      setIsRecording(false);
      setRecProgress(0);
      setRecStatus('');

      const video = videoRef.current;
      if (video) {
        video.muted = true;
        video.pause();
        video.currentTime = 0;
        video.loop = true;
        video.playbackRate = 1.0;
      }
      abortControllerRef.current = null;
    }
  }

  function cancelRecording() {
    abortControllerRef.current?.abort();
    setIsRecording(false);
    setRecProgress(0);
    setRecStatus('');

    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.pause();
      video.currentTime = 0;
      video.playbackRate = 1.0;
      video.loop = true;
    }
  }

  function zoomIn() {
    const newScale = Math.min(3, videoScaleRef.current + 0.05);
    videoScaleRef.current = newScale;
    setVideoScale(newScale);
  }

  function zoomOut() {
    const newScale = Math.max(0.5, videoScaleRef.current - 0.05);
    videoScaleRef.current = newScale;
    setVideoScale(newScale);
  }

  return (
    <div className="flex flex-col items-center gap-4 mt-8">

      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={zoomOut}
          disabled={videoScale <= 0.5}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Zoom out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <span className="text-xs text-zinc-500 font-mono w-12 text-center">{Math.round(videoScale * 100)}%</span>
        <button
          onClick={zoomIn}
          disabled={videoScale >= 3}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Zoom in"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
            <line x1="11" y1="8" x2="11" y2="14"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button
          onClick={() => {
            videoScaleRef.current = 1;
            setVideoScale(1);
          }}
          disabled={videoScale === 1}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Reset zoom"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>

      {/* Outer wrapper — overflow:visible so handles can extend outside canvas bounds */}
      <div
        className="relative"
        style={{ width: CANVAS_W * DISPLAY_SCALE, height: CANVAS_H * DISPLAY_SCALE, overflow: 'visible' }}
      >

        {/* Canvas — black bg + video drawn in JS */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ width: CANVAS_W * DISPLAY_SCALE, height: CANVAS_H * DISPLAY_SCALE }}
          className="block rounded-2xl border border-zinc-700 shadow-[0_0_48px_rgba(254,44,85,0.1)]"
        />

        {/* Video loading overlay */}
        {isVideoLoading && !videoError && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl"
            style={{ width: CANVAS_W * DISPLAY_SCALE, height: CANVAS_H * DISPLAY_SCALE }}
          >
            <div className="text-center px-4">
              <svg className="animate-spin mx-auto mb-2" width="32" height="32" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25"/>
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"/>
              </svg>
              <p className="text-zinc-300 text-sm font-medium">Loading video...</p>
              <p className="text-zinc-500 text-xs mt-1">Large videos may take a minute</p>
            </div>
          </div>
        )}

        {/* Video error overlay */}
        {videoError && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-2xl"
            style={{ width: CANVAS_W * DISPLAY_SCALE, height: CANVAS_H * DISPLAY_SCALE }}
          >
            <div className="text-center px-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 mx-auto mb-2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-red-400 text-sm font-medium">{videoError}</p>
              <p className="text-zinc-500 text-xs mt-1">Try fetching the video again</p>
            </div>
          </div>
        )}

        {/* Handle overlay — sits on top of canvas, overflows freely */}
        <div className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>

          {/* Selection border around the video box */}
          <div
            style={{
              position: 'absolute',
              left: box.x * DISPLAY_SCALE,
              top: box.y * DISPLAY_SCALE,
              width: box.w * DISPLAY_SCALE,
              height: box.h * DISPLAY_SCALE,
              border: '1px solid rgba(255,255,255,0.35)',
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* Move hit-area (inner part of box, excluding handle edges) */}
          <div
            style={{
              position: 'absolute',
              left: box.x * DISPLAY_SCALE + H_SIZE,
              top:  box.y * DISPLAY_SCALE + H_SIZE,
              width:  Math.max(0, box.w * DISPLAY_SCALE - H_SIZE * 2),
              height: Math.max(0, box.h * DISPLAY_SCALE - H_SIZE * 2),
              cursor: 'move',
              pointerEvents: 'auto',
            }}
            onMouseDown={e => startDrag(e, 'move')}
          />

          {/* Corner & edge handles */}
          {handles.map(h => (
            <div
              key={h.type}
              onMouseDown={e => startDrag(e, h.type)}
              style={{
                position: 'absolute',
                left:   h.cx - H_SIZE / 2,
                top:    h.cy - H_SIZE / 2,
                width:  H_SIZE,
                height: H_SIZE,
                background: '#fff',
                border: '1.5px solid rgba(0,0,0,0.4)',
                borderRadius: 2,
                cursor: CURSORS[h.type],
                pointerEvents: 'auto',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Info row */}
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
        <span>{Math.round(box.w)}×{Math.round(box.h)}</span>
        <span>at ({Math.round(box.x)}, {Math.round(box.y)})</span>
        <span>·</span>
        <button
          onClick={togglePlay}
          className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
        >
          {isPlaying ? 'Pause template preview' : 'Play on template'}
        </button>
        <span>·</span>
        <button
          onClick={resetBox}
          className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
        >
          Reset
        </button>
        <span>·</span>
        <button
          onClick={centerEverything}
          className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
        >
          Center
        </button>
      </div>

      {/* Recording progress bar */}
      {isRecording && (
        <div className="w-[270px] space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-[#fe2c55] transition-all duration-100"
              style={{ width: `${Math.round(recProgress * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>{recStatus || `Exporting… ${Math.round(recProgress * 100)}%`}</span>
            <button onClick={cancelRecording} className="text-red-400 hover:text-red-300 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Export button */}
      {!isRecording && (
        <button
          onClick={startRecording}
          className="flex items-center gap-2 rounded-lg bg-[#fe2c55] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="12" r="4"/>
          </svg>
          Export Cropped Video
        </button>
      )}

      {/* Hidden video — feeds the canvas draw loop */}
      <video
        ref={videoRef}
        crossOrigin="anonymous"
        preload="auto"
        loop muted playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          // Seek to 1 second and pause by default
          const v = videoRef.current;
          if (v && v.duration > 1) {
            v.currentTime = 1;
          }
        }}
        onProgress={() => {
          // Track loading progress for debugging
          const v = videoRef.current;
          if (v && v.buffered.length > 0) {
            const bufferedEnd = v.buffered.end(v.buffered.length - 1);
            if (v.duration > 0 && bufferedEnd > 0) {
              const percent = (bufferedEnd / v.duration) * 100;
              if (videoId && percent < 100) {
                console.log('[Row ' + (rowNumber + 1) + `] Video ${videoId} buffering: ${percent.toFixed(1)}%`);
              }
            }
          }
        }}
        onCanPlay={() => {
          console.log('[Row ' + (rowNumber + 1) + `] Video ${videoId} can play`);
        }}
        onCanPlayThrough={() => {
          console.log('[Row ' + (rowNumber + 1) + `] Video ${videoId} can play through`);
        }}
        onError={(e) => {
          const video = e.target as HTMLVideoElement;
          const errorCode = video.error?.code;
          const errorMessage = video.error?.message;

          // Skip error handling if there's no actual error (happens when we reset the video element)
          if (!errorCode) {
            return;
          }

          const errorDetails = {
            code: errorCode,
            message: errorMessage,
            src: videoSrc,
            networkState: video.networkState,
            readyState: video.readyState,
            currentSrc: video.currentSrc,
            error: video.error
          };
          console.error('[Row ' + (rowNumber + 1) + '] Video error:', errorDetails);

          // If error code is undefined but error was triggered, it might be a loading issue
          if (errorCode === undefined) {
            setVideoError('Video failed to load. The video URL may be invalid.');
            if (onVideoError) {
              onVideoError();
            }
            return;
          }

          // Set user-friendly error message
          if (errorCode === 4) {
            setVideoError('Video format not supported. Try refreshing the page.');
          } else if (errorCode === 3) {
            setVideoError('Video decode error. The file may be corrupted.');
          } else if (errorCode === 2) {
            setVideoError('Network error. Check your internet connection.');
          } else {
            setVideoError('Failed to load video. The link may be invalid.');
          }
          // Notify parent component so they can re-enable fetch button
          if (onVideoError) {
            onVideoError();
          }
        }}
        style={{ display: 'none' }}
      />
    </div>
  );
});
