import { describe, expect, it } from 'vitest';
import { firstHttpsUrl, linkifyText, mediaEmbedForUrl, renderMediaEmbed } from '../src/lib/media-embeds';

describe('inline media embeds', () => {
  it('recognizes privacy-friendly YouTube and Vimeo embeds', () => {
    const youtube = mediaEmbedForUrl('https://youtu.be/dQw4w9WgXcQ');
    const vimeo = mediaEmbedForUrl('https://vimeo.com/12345678');
    expect(youtube?.kind).toBe('youtube');
    expect(vimeo?.kind).toBe('vimeo');
    if (youtube?.kind === 'youtube') expect(youtube.embedUrl).toContain('youtube-nocookie.com');
    if (vimeo?.kind === 'vimeo') expect(vimeo.embedUrl).toBe('https://player.vimeo.com/video/12345678');
  });

  it('recognizes direct media files but rejects non-HTTPS embeds', () => {
    expect(mediaEmbedForUrl('https://cdn.example.test/photo.webp')?.kind).toBe('image');
    expect(mediaEmbedForUrl('https://cdn.example.test/clip.mp4')?.kind).toBe('video');
    expect(mediaEmbedForUrl('http://cdn.example.test/clip.mp4')).toBeNull();
    expect(mediaEmbedForUrl('https://user:secret@cdn.example.test/photo.webp')).toBeNull();
  });

  it('does not auto-embed obvious local-network or IP-literal media targets', () => {
    for (const url of [
      'https://localhost/clip.mp4',
      'https://camera.local/stream.mp4',
      'https://router.internal/photo.jpg',
      'https://192.168.1.1/clip.mp4',
      'https://127.1/clip.mp4',
      'https://[::1]/clip.mp4',
      'https://2130706433/clip.mp4',
      'https://nas/clip.mp4'
    ]) expect(mediaEmbedForUrl(url)).toBeNull();
  });

  it('linkifies text without allowing HTML or unsafe protocols', () => {
    const text = '<hello> https://example.test/a?b=1&c=2 javascript:alert(1)';
    expect(firstHttpsUrl(text)).toBe('https://example.test/a?b=1&c=2');
    expect(linkifyText(text)).toContain('&lt;hello&gt;');
    expect(linkifyText(text)).not.toContain('<hello>');
    expect(linkifyText(text)).not.toContain('href="javascript:');
  });

  it('renders embeds with controls and lazy loading', () => {
    const html = renderMediaEmbed(mediaEmbedForUrl('https://cdn.example.test/clip.mp4')!);
    expect(html).toContain('controls');
    expect(html).toContain('preload="metadata"');
  });

  it('keeps third-party embed referrers off the request', () => {
    const html = renderMediaEmbed(mediaEmbedForUrl('https://youtu.be/dQw4w9WgXcQ')!);
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).not.toContain('allow="accelerometer; autoplay;');
  });
});
