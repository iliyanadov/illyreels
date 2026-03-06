import { describe, it, expect } from 'vitest';

describe('Caption Fallback Logic', () => {
  // This tests the priority: instagramCaption || caption || ''
  function selectCaption(instagramCaption: string, caption: string): string {
    return instagramCaption || caption || '';
  }

  describe('priority: instagramCaption first', () => {
    it('should return instagramCaption when both are present', () => {
      expect(selectCaption('IG caption', 'Regular caption')).toBe('IG caption');
    });

    it('should return instagramCaption when caption is empty', () => {
      expect(selectCaption('IG caption', '')).toBe('IG caption');
    });

    it('should return instagramCaption when caption is null', () => {
      expect(selectCaption('IG caption', null as any)).toBe('IG caption');
    });

    it('should return instagramCaption when caption is undefined', () => {
      expect(selectCaption('IG caption', undefined as any)).toBe('IG caption');
    });
  });

  describe('fallback to caption', () => {
    it('should return caption when instagramCaption is empty', () => {
      expect(selectCaption('', 'Regular caption')).toBe('Regular caption');
    });

    it('should return caption when instagramCaption is null', () => {
      expect(selectCaption(null as any, 'Regular caption')).toBe('Regular caption');
    });

    it('should return caption when instagramCaption is undefined', () => {
      expect(selectCaption(undefined as any, 'Regular caption')).toBe('Regular caption');
    });
  });

  describe('empty result', () => {
    it('should return empty string when both are empty', () => {
      expect(selectCaption('', '')).toBe('');
    });

    it('should return empty string when both are null', () => {
      expect(selectCaption(null as any, null as any)).toBe('');
    });

    it('should return empty string when both are undefined', () => {
      expect(selectCaption(undefined as any, undefined as any)).toBe('');
    });

    it('should return empty string when mixed null/empty/undefined', () => {
      expect(selectCaption('', null as any)).toBe('');
      expect(selectCaption(null as any, undefined as any)).toBe('');
      expect(selectCaption(undefined as any, '')).toBe('');
    });
  });

  describe('special characters', () => {
    it('should handle emojis in instagramCaption', () => {
      expect(selectCaption('🔥 Hot caption 🔥', 'Regular')).toBe('🔥 Hot caption 🔥');
    });

    it('should handle emojis in caption fallback', () => {
      expect(selectCaption('', '✨ Caption with emojis ✨')).toBe('✨ Caption with emojis ✨');
    });

    it('should handle hashtags in instagramCaption', () => {
      expect(selectCaption('Check this out! #viral #trending', 'Regular')).toBe('Check this out! #viral #trending');
    });

    it('should handle mentions in caption', () => {
      expect(selectCaption('', '@username follow us!')).toBe('@username follow us!');
    });
  });

  describe('unicode characters', () => {
    it('should handle Chinese characters', () => {
      expect(selectCaption('这是一个测试', 'Test caption')).toBe('这是一个测试');
    });

    it('should handle Japanese characters', () => {
      expect(selectCaption('', 'これはテストです')).toBe('これはテストです');
    });

    it('should handle Arabic characters', () => {
      expect(selectCaption('هذا اختبار', 'Test')).toBe('هذا اختبار');
    });

    it('should handle emoji sequences', () => {
      expect(selectCaption('👨‍👩‍👧‍👦 Family emoji', 'Regular')).toBe('👨‍👩‍👧‍👦 Family emoji');
    });
  });

  describe('whitespace handling', () => {
    it('should preserve leading/trailing whitespace', () => {
      expect(selectCaption('  spaced caption  ', '')).toBe('  spaced caption  ');
    });

    it('should handle tabs and newlines', () => {
      expect(selectCaption('Line 1\nLine 2\tTabbed', 'Regular')).toBe('Line 1\nLine 2\tTabbed');
    });

    it('should treat empty string as falsy, not whitespace-only string', () => {
      expect(selectCaption('   ', 'Regular')).toBe('   ');
    });
  });

  describe('XSS prevention', () => {
    it('should preserve script tag characters (sanitization happens elsewhere)', () => {
      const captionWithScript = '<script>alert(1)</script>Normal text';
      expect(selectCaption(captionWithScript, '')).toBe(captionWithScript);
    });

    it('should preserve HTML entities', () => {
      const captionWithHtml = '&lt;div&gt;Content&lt;/div&gt;';
      expect(selectCaption(captionWithHtml, '')).toBe(captionWithHtml);
    });
  });

  describe('Instagram character limits', () => {
    it('should handle captions at Instagram limit (2200 chars)', () => {
      const longCaption = 'a'.repeat(2200);
      expect(selectCaption(longCaption, '')).toBe(longCaption);
      expect(longCaption.length).toBe(2200);
    });

    it('should handle captions exceeding Instagram limit', () => {
      const veryLongCaption = 'a'.repeat(3000);
      expect(selectCaption(veryLongCaption, '')).toBe(veryLongCaption);
      expect(veryLongCaption.length).toBe(3000);
    });
  });

  describe('URL handling', () => {
    it('should handle URLs in captions', () => {
      expect(selectCaption('Check https://example.com', '')).toBe('Check https://example.com');
    });

    it('should handle multiple URLs', () => {
      expect(selectCaption('https://link1.com and https://link2.com', '')).toBe('https://link1.com and https://link2.com');
    });
  });
});
