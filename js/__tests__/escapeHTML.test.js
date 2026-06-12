import { describe, it, expect, beforeAll } from 'vitest';

describe('escapeHTML', () => {
    beforeAll(async () => {
        await import('../utils.js');
    });

    it('should escape basic HTML special characters', () => {
        expect(window.escapeHTML('&')).toBe('&amp;');
        expect(window.escapeHTML('<')).toBe('&lt;');
        expect(window.escapeHTML('>')).toBe('&gt;');
        expect(window.escapeHTML('"')).toBe('&quot;');
        expect(window.escapeHTML("'")).toBe('&#39;');
    });

    it('should return empty string for null, undefined, and empty string', () => {
        expect(window.escapeHTML(null)).toBe('');
        expect(window.escapeHTML(undefined)).toBe('');
        expect(window.escapeHTML('')).toBe('');
    });

    it('should convert number to string and escape', () => {
        expect(window.escapeHTML(42)).toBe('42');
        expect(window.escapeHTML(0)).toBe('0');
    });

    it('should escape ampersands in already-escaped strings (double-escape)', () => {
        expect(window.escapeHTML('&amp;')).toBe('&amp;amp;');
        expect(window.escapeHTML('&lt;div&gt;')).toBe('&amp;lt;div&amp;gt;');
    });

    it('should preserve newlines and Chinese characters', () => {
        expect(window.escapeHTML('hello\nworld')).toBe('hello\nworld');
        expect(window.escapeHTML('你好世界')).toBe('你好世界');
    });

    it('should neutralize XSS payloads by escaping angle brackets', () => {
        const payload = '<img src=x onerror=alert(1)>';
        const escaped = window.escapeHTML(payload);
        expect(escaped).not.toContain('<img');
        expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('should escape mixed content with all special chars', () => {
        expect(window.escapeHTML("a&b<c>d\"e'f")).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
    });
});
