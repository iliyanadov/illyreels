'use client';

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

// Internal canvas resolution (1080p portrait for highest export quality)
export const CANVAS_W = 1080;
export const CANVAS_H = 1920;
// Target width for video fitting (1000px leaves 40px padding on each side)
export const VIDEO_TARGET_W = 1000;
// Display scale so the on-screen canvas isn't huge
const DISPLAY_SCALE = 0.25; // 1080×1920 → 270×480 on screen
const MIN_DIM = 40;
const H_SIZE = 10; // handle square side length

type Handle = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br' | 'move';

interface Box { x: number; y: number; w: number; h: number }

const CURSORS: Record<Handle, string> = {
  tl: 'nw-resize', tc: 'n-resize',  tr: 'ne-resize',
  ml: 'w-resize',                    mr: 'e-resize',
  bl: 'sw-resize', bc: 's-resize',  br: 'se-resize',
  move: 'move',
};

// Header overlay (Twitter/X style) drawn above the video area inside the crop box
const BASE_HEADER_HEIGHT = 110; // Height without caption
const CAPTION_LINE_HEIGHT = 50; // Height per caption line
const CAPTION_TOP_PADDING = 65; // Padding above first caption line
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
  overlayDisplayName?: string;
  overlayHandle?: string;
  overlayDate?: string;
  overlayVerified?: boolean;
  overlayCaption?: string;
  marketData?: MarketData | null;
}

export interface TikTokCanvasRef {
  startDownload: () => Promise<void>;
}

export const TikTokCanvas = forwardRef<TikTokCanvasRef, Props>(function TikTokCanvas({
  videoSrc,
  videoId,
  overlayDisplayName = 'Sonotrade',
  overlayHandle = '@SonotradeHQ',
  overlayDate = 'Jan 22',
  overlayVerified = true,
  overlayCaption = '',
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

  // Pan offset for the underlying video (dragging moves the video, not the crop box)
  const videoOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Video zoom scale
  const videoScaleRef = useRef<number>(1);
  const [videoScale, setVideoScale] = useState(1);

  // Playback state for template preview
  const [isPlaying, setIsPlaying] = useState(false);

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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingCancelledRef = useRef<boolean>(false);

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
      if (vw && vh) {
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
        videoOffsetRef.current = { x: 0, y: 0 };
        videoScaleRef.current = 1;
        setVideoScale(1);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoSrc]);

  // ── Draw loop (black bg + global header + cropped video) ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const v = videoRef.current;
    if (!canvas || !v) return;
    const video = v;
    const ctx = canvas.getContext('2d')!;
    let active = true;

    function drawHeader(cx: number, cy: number, cw: number) {
      const padX = HEADER_PADDING_X + 30; // Shift right by 30px
      const padY = HEADER_PADDING_TOP;
      const lineH = 50;
      const nameFont = '600 44px system-ui, sans-serif';
      const metaFont = '400 40px system-ui, sans-serif';
      const metaColor = 'rgba(113, 118, 123, 1)';
      const nameColor = 'rgb(231, 233, 234)';

      // Calculate number of caption lines to determine dynamic header height
      let captionLines = 0;
      if (overlayCaption) {
        const captionFont = '400 38px system-ui, sans-serif';
        ctx.font = captionFont;
        const maxWidth = cw - padX * 2;
        const words = overlayCaption.split(' ');
        let line = '';
        captionLines = 1;
        
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          
          if (metrics.width > maxWidth && i > 0) {
            captionLines++;
            line = words[i] + ' ';
          } else {
            line = testLine;
          }
        }
      }

      // Dynamic header height based on caption lines
      const headerHeight = overlayCaption 
        ? BASE_HEADER_HEIGHT + CAPTION_TOP_PADDING + (captionLines * CAPTION_LINE_HEIGHT)
        : BASE_HEADER_HEIGHT;

      // Solid header background so the header is above the video, not overlaying it
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
        logo.src = '/templatelogo.png';
        logoImgRef.current = logo;
      }
      
      // Calculate logo width based on aspect ratio, or use default
      let logoWidth = logoHeight; // default to square if image not loaded
      if (logo.complete && logo.width && logo.height) {
        const logoAspectRatio = logo.width / logo.height;
        logoWidth = logoHeight * logoAspectRatio;
        const logoY = textCenterY - logoHeight / 2 - 10; // Move up by 10px
        ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
      }

      // First line: display name + verified badge, to the right of the logo
      let left = logoX + logoWidth + 16;

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
      const handleLeft = logoX + logoWidth + 16;
      ctx.fillText(overlayHandle, handleLeft, handleBaseline);

      // Caption: below the handle if provided
      if (overlayCaption) {
        const captionFont = '400 38px system-ui, sans-serif';
        const captionColor = 'rgb(231, 233, 234)';
        const captionBaseline = handleBaseline + CAPTION_TOP_PADDING;
        const captionLeft = cx + padX;
        
        ctx.font = captionFont;
        ctx.fillStyle = captionColor;
        
        // Wrap caption text if it's too long
        const maxWidth = cw - padX * 2;
        const words = overlayCaption.split(' ');
        let line = '';
        let y = captionBaseline;
        
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
      }

      return headerHeight; // Return the calculated height
    }

    function draw() {
      if (!active) return;
      raf.current = requestAnimationFrame(draw);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const { x, y, w, h } = boxRef.current;
        const { x: ox, y: oy } = videoOffsetRef.current;

        // Calculate header position first to know where to draw it
        // We need to call drawHeader to get the height, but we'll redraw it at the correct position
        
        // First pass: calculate the header height without drawing
        let captionLines = 0;
        if (overlayCaption) {
          const captionFont = '400 38px system-ui, sans-serif';
          ctx.font = captionFont;
          const maxWidth = CANVAS_W - (HEADER_PADDING_X + 30) * 2;
          const words = overlayCaption.split(' ');
          let line = '';
          captionLines = 1;
          
          for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && i > 0) {
              captionLines++;
              line = words[i] + ' ';
            } else {
              line = testLine;
            }
          }
        }
        
        const headerHeight = overlayCaption 
          ? BASE_HEADER_HEIGHT + CAPTION_TOP_PADDING + (captionLines * CAPTION_LINE_HEIGHT)
          : BASE_HEADER_HEIGHT;

        // Header: fixed X, but Y follows the crop box
        const headerY = Math.max(0, y - headerHeight);
        drawHeader(0, headerY, CANVAS_W);

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

        // Draw box below the video
        const boxY = y + h + 30; // 30px gap below video (increased from 10px)
        const boxHeight = 140; // Height of the box (increased for more vertical padding)
        const boxPadding = 60; // Padding from edges (increased from 40px)
        
        // Draw rounded rectangle with black background and gray border
        ctx.fillStyle = '#000';
        ctx.strokeStyle = 'rgba(113, 118, 123, 0.5)'; // thin gray border
        ctx.lineWidth = 1;
        
        // Rounded rectangle path
        const radius = 16; // Increased corner radius
        const boxX = boxPadding;
        const boxWidth = CANVAS_W - boxPadding * 2;
        
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
        
        // Draw market data if available
        if (marketData && marketData.markets && marketData.markets.length > 0) {
          const market = marketData.markets[0]; // Use first market
          const textPadding = 40; // Increased internal padding
          const imageSize = 80; // Increased square image size
          const imageMargin = 25; // Increased gap between image and text
          
          // Load and draw market image if available
          let textStartX = boxX + textPadding;
          if (marketData.imageUrl) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = marketData.imageUrl;
            
            // Only draw if image is loaded
            if (img.complete && img.naturalWidth > 0) {
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
            } else {
              // If image not loaded yet, trigger redraw when it loads
              img.onload = () => {
                draw();
              };
            }
          }
          
          // Calculate max width for text (leave space for odds and banner on right)
          const bannerReservedWidth = 240; // Space reserved for banner column
          const oddsReservedWidth = 150; // Space reserved for odds column
          const maxTextWidth = 420; // Reduced from 450 to make title area slightly narrower
          
          // Event title (white text) - automatically wrap to 1 or 2 rows as needed
          ctx.font = '600 28px system-ui, sans-serif'; // Increased from 26px to 28px
          ctx.fillStyle = 'rgb(231, 233, 234)';
          ctx.textAlign = 'left'; // Ensure left alignment for title
          
          // Check if text fits in one line
          const fullText = marketData.title;
          const fullTextWidth = ctx.measureText(fullText).width;
          
          if (fullTextWidth <= maxTextWidth) {
            // Text fits in one line - center it vertically
            const textY = boxY + boxHeight / 2 + 8; // Vertically centered
            ctx.fillText(fullText, textStartX, textY);
          } else {
            // Text needs wrapping - split into two rows
            const lineHeight = 34; // Increased from 30px to 34px for more spacing
            const totalTextHeight = lineHeight * 2; // Two lines
            const textY = boxY + (boxHeight - totalTextHeight) / 2 + 24; // Center the two-line block
            const words = fullText.split(' ');
            let line1 = '';
            let line2 = '';
            let currentLine = 1;
            
            for (const word of words) {
              const testLine = (currentLine === 1 ? line1 : line2) + (currentLine === 1 && line1 ? ' ' : currentLine === 2 && line2 ? ' ' : '') + word;
              const metrics = ctx.measureText(testLine);
              
              if (metrics.width > maxTextWidth && (currentLine === 1 ? line1 : line2)) {
                currentLine = 2;
                line2 = word;
              } else {
                if (currentLine === 1) {
                  line1 = testLine;
                } else {
                  line2 = testLine;
                }
              }
            }
            
            // Draw the two lines
            ctx.fillText(line1, textStartX, textY);
            if (line2) {
              ctx.fillText(line2, textStartX, textY + 34); // Use updated lineHeight for spacing
            }
          }
          
          // Draw odds (yesBid) on the right side if available
          if (market.yesBid) {
            // Use the same bannerReservedWidth from above
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
            ctx.font = '700 48px system-ui, sans-serif'; // Increased from 44px to 48px
            ctx.fillStyle = 'rgb(231, 233, 234)';
            const oddsY = boxY + boxHeight / 2 - 2; // Slightly above center
            // Center the percentage above the payout line
            const percentageWidth = ctx.measureText(oddsText).width;
            const percentageX = oddsColumnEnd - (payoutLineWidth / 2) + (percentageWidth / 2);
            ctx.textAlign = 'right';
            ctx.fillText(oddsText, percentageX, oddsY);
            
            // Draw payout with mixed colors
            ctx.font = '400 17px system-ui, sans-serif'; // Increased from 16px to 17px
            const payoutY = oddsY + 34; // Reduced from 38 to bring closer
            
            // Measure and draw the full text with green payout
            const greenWidth = ctx.measureText(greenText).width;
            
            // Draw "$X" in green (right-aligned)
            ctx.fillStyle = 'rgb(0, 186, 124)'; // Green color
            ctx.fillText(greenText, oddsColumnEnd, payoutY);
            
            // Draw "$100 → " in gray (to the left of green text)
            ctx.fillStyle = 'rgba(113, 118, 123, 1)';
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
              
              // Draw "Link in bio to start trading" below the banner
              ctx.font = '400 15px system-ui, sans-serif'; // Increased from 14px to 15px
              ctx.fillStyle = 'rgba(113, 118, 123, 1)'; // Gray color
              ctx.textAlign = 'center';
              const textX = bannerX + bannerWidth / 2; // Center text under banner
              const textY = bannerY + bannerHeight + textGap + 10;
              ctx.fillText('Link in bio to start trading', textX, textY);
            }
            
            // Reset text alignment to left (default)
            ctx.textAlign = 'left';
          }
        }
      }
    }
    draw();
    return () => { active = false; cancelAnimationFrame(raf.current); };
  }, [videoSrc, overlayDisplayName, overlayHandle, overlayDate, overlayVerified, overlayCaption, videoScale, marketData]);

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
    function applyDrag(dx: number, dy: number) {
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
          nw = Math.max(MIN_DIM, sb.w + dx); nh = Math.max(MIN_DIM, sb.h + dy); break;
        case 'bl':
          nw = Math.max(MIN_DIM, sb.w - dx); nx = sb.x + sb.w - nw; nh = Math.max(MIN_DIM, sb.h + dy); break;
        case 'tr':
          nw = Math.max(MIN_DIM, sb.w + dx); nh = Math.max(MIN_DIM, sb.h - dy); ny = sb.y + sb.h - nh; break;
        case 'tl':
          nw = Math.max(MIN_DIM, sb.w - dx); nx = sb.x + sb.w - nw; nh = Math.max(MIN_DIM, sb.h - dy); ny = sb.y + sb.h - nh; break;
        case 'tc':
          nh = Math.max(MIN_DIM, sb.h - dy); ny = sb.y + sb.h - nh; break;
        case 'bc':
          nh = Math.max(MIN_DIM, sb.h + dy); break;
        case 'ml':
          nw = Math.max(MIN_DIM, sb.w - dx); nx = sb.x + sb.w - nw; break;
        case 'mr':
          nw = Math.max(MIN_DIM, sb.w + dx); break;
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
      applyDrag(dx, dy);
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
    { type: 'ml', cx: box.x * DISPLAY_SCALE,           cy: (box.y + box.h / 2) * DISPLAY_SCALE },
    { type: 'mr', cx: (box.x + box.w) * DISPLAY_SCALE,   cy: (box.y + box.h / 2) * DISPLAY_SCALE },
    { type: 'bl', cx: box.x * DISPLAY_SCALE,           cy: (box.y + box.h) * DISPLAY_SCALE },
    { type: 'bc', cx: (box.x + box.w / 2) * DISPLAY_SCALE, cy: (box.y + box.h) * DISPLAY_SCALE },
    { type: 'br', cx: (box.x + box.w) * DISPLAY_SCALE,   cy: (box.y + box.h) * DISPLAY_SCALE },
  ];

  // ── MediaRecorder export ─────────────────────────────────────────────────────
  function startRecording(): Promise<void> {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      const video  = videoRef.current;
      if (!canvas || !video || isRecording) {
        reject(new Error('Cannot start recording'));
        return;
      }

      const duration = isFinite(video.duration) && video.duration > 0
        ? video.duration
        : 30;

      // Prefer MP4 if the browser supports it, otherwise fall back to WebM.
      let mimeType = 'video/webm';
      const candidates = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      for (const t of candidates) {
        if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
      }
      const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';

      // Capture video stream from canvas
      const canvasStream = canvas.captureStream(30);
      
      // Create a combined stream with both video and audio
      const combinedStream = new MediaStream();
      
      // Add video tracks from canvas
      canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
      
      // Add audio tracks from video element
      try {
        // @ts-ignore - captureStream exists on HTMLMediaElement but may not be in all type definitions
        const audioStream = video.captureStream ? video.captureStream() : video.mozCaptureStream?.();
        if (audioStream) {
          audioStream.getAudioTracks().forEach((track: MediaStreamTrack) => combinedStream.addTrack(track));
        }
      } catch (e) {
        console.warn('Could not capture audio:', e);
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 8_000_000 });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      
      // Reset cancelled flag at the start of recording
      recordingCancelledRef.current = false;

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        // Only download if recording wasn't cancelled
        if (!recordingCancelledRef.current) {
          const blob = new Blob(chunks, { type: mimeType });
          const url  = URL.createObjectURL(blob);
          Object.assign(document.createElement('a'), {
            href: url,
            download: `tiktok-canvas-${videoId ?? 'export'}.${fileExt}`,
          }).click();
          URL.revokeObjectURL(url);
        }
        setIsRecording(false);
        setRecProgress(0);
        // Mute and pause the video after recording
        video.muted = true;
        video.pause();
        video.currentTime = 0;
        resolve();
      };

      video.currentTime = 0;
      // Unmute video to capture audio
      video.muted = false;
      video.play();
      recorder.start(100);
      setIsRecording(true);

      const t0 = Date.now();
      const iv = setInterval(() => {
        const p = Math.min((Date.now() - t0) / 1000 / duration, 1);
        setRecProgress(p);
        if (p >= 1) { clearInterval(iv); recorder.stop(); }
      }, 100);
    });
  }

  function cancelRecording() {
    const video = videoRef.current;
    // Set the cancelled flag to prevent download
    recordingCancelledRef.current = true;
    recorderRef.current?.stop();
    setIsRecording(false);
    setRecProgress(0);
    // Mute and pause the video after canceling
    if (video) {
      video.muted = true;
      video.pause();
      video.currentTime = 0;
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
      <div className="flex items-center gap-2 text-xs text-zinc-600">
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
      </div>

      {/* Recording progress bar */}
      {isRecording && (
        <div className="w-[270px] space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-[#fe2c55] transition-all duration-100"
              style={{ width: `${recProgress * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Recording… {Math.round(recProgress * 100)}%</span>
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
        src={videoSrc}
        crossOrigin="anonymous"
        loop muted playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          // Auto-play when loaded to ensure canvas can draw
          const v = videoRef.current;
          if (v && v.readyState >= 2) {
            v.play().catch(() => {
              // Ignore autoplay errors
            });
          }
        }}
        onError={(e) => {
          console.error('Video error:', e);
        }}
        style={{ display: 'none' }}
      />
    </div>
  );
});
