import { describe, it, expect } from 'vitest';

interface VideoData {
  id: string;
  title: string;
  cover: string;
  author: {
    uniqueId: string;
    nickname: string;
    avatarThumb: string;
  };
  play: string;       // SD, no watermark
  wmplay: string;     // SD, with watermark
  hdplay: string;     // HD, no watermark
  duration: number;
  size: number;
  images?: string[];
}

describe('Video URL Selection Logic', () => {
  // This tests the priority: hdplay || play || wmplay || ''
  function selectVideoUrl(data: VideoData | null): string {
    if (!data) return '';
    return data.hdplay || data.play || data.wmplay || '';
  }

  describe('priority: hdplay first', () => {
    it('should return hdplay when all three are present', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: 'https://example.com/sd.mp4',
        wmplay: 'https://example.com/wm.mp4',
        hdplay: 'https://example.com/hd.mp4',
        duration: 15,
        size: 1024,
      };

      expect(selectVideoUrl(data)).toBe('https://example.com/hd.mp4');
    });

    it('should return hdplay even when it is the only URL present', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: '',
        wmplay: '',
        hdplay: 'https://example.com/hd.mp4',
        duration: 15,
        size: 1024,
      };

      expect(selectVideoUrl(data)).toBe('https://example.com/hd.mp4');
    });
  });

  describe('fallback to play', () => {
    it('should return play when hdplay is missing', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: 'https://example.com/sd.mp4',
        wmplay: 'https://example.com/wm.mp4',
        hdplay: '',
        duration: 15,
        size: 1024,
      };

      expect(selectVideoUrl(data)).toBe('https://example.com/sd.mp4');
    });

    it('should return play when only play and wmplay are present', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: 'https://example.com/sd.mp4',
        wmplay: 'https://example.com/wm.mp4',
        hdplay: '',
        duration: 15,
        size: 1024,
      };

      expect(selectVideoUrl(data)).toBe('https://example.com/sd.mp4');
    });
  });

  describe('fallback to wmplay', () => {
    it('should return wmplay when hdplay and play are missing', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: '',
        wmplay: 'https://example.com/wm.mp4',
        hdplay: '',
        duration: 15,
        size: 1024,
      };

      expect(selectVideoUrl(data)).toBe('https://example.com/wm.mp4');
    });

    it('should return wmplay when it is the only URL present', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: '',
        wmplay: 'https://example.com/wm.mp4',
        hdplay: '',
        duration: 15,
        size: 1024,
      };

      expect(selectVideoUrl(data)).toBe('https://example.com/wm.mp4');
    });
  });

  describe('empty result', () => {
    it('should return empty string when all URLs are missing', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: '',
        wmplay: '',
        hdplay: '',
        duration: 15,
        size: 1024,
      };

      expect(selectVideoUrl(data)).toBe('');
    });

    it('should return empty string when data is null', () => {
      expect(selectVideoUrl(null)).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined values gracefully', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: 'https://example.com/sd.mp4',
        wmplay: undefined as any,
        hdplay: undefined as any,
        duration: 15,
        size: 1024,
      };

      // undefined is falsy, so || should still work
      const result = data.hdplay || data.play || data.wmplay || '';
      expect(result).toBe('https://example.com/sd.mp4');
    });

    it('should prioritize truthy values', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: '',
        wmplay: 'https://example.com/wm.mp4',
        hdplay: 'https://example.com/hd.mp4',
        duration: 15,
        size: 1024,
      };

      // Even though play is empty string (falsy), hdplay is truthy
      expect(selectVideoUrl(data)).toBe('https://example.com/hd.mp4');
    });

    it('should handle zero in numeric fields without affecting URL selection', () => {
      const data: VideoData = {
        id: '123',
        title: 'Test',
        cover: 'https://example.com/cover.jpg',
        author: {
          uniqueId: 'user',
          nickname: 'User',
          avatarThumb: 'https://example.com/avatar.jpg',
        },
        play: 'https://example.com/sd.mp4',
        wmplay: '',
        hdplay: '',
        duration: 0,
        size: 0,
      };

      expect(selectVideoUrl(data)).toBe('https://example.com/sd.mp4');
    });
  });
});
