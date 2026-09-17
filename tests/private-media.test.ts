import { describe, expect, it } from 'vitest';
import { mediaAttributeForProject, privateMediaPolicy, storageObjectPathFromUrl } from '../src/lib/private-media';

const projectUrl = 'https://project.example';
const ownerId = '12345678-1234-4abc-8def-1234567890ab';
const fileId = 'abcdefab-cdef-4abc-8def-1234567890ab';
const locator = `${projectUrl}/storage/v1/object/public/public-media/${ownerId}/${fileId}.png`;

describe('private social media', () => {
  it('recognizes only this project’s stored media locator and returns a safe object path', () => {
    expect(storageObjectPathFromUrl(locator, projectUrl)).toBe(`${ownerId}/${fileId}.png`);
    expect(storageObjectPathFromUrl(locator, 'https://other.example')).toBeNull();
    expect(storageObjectPathFromUrl(locator.replace('/public-media/', '/private-media/'), projectUrl)).toBeNull();
    expect(storageObjectPathFromUrl(`${projectUrl}/storage/v1/object/public/public-media/${ownerId}/%2e%2e%2Fprivate.png`, projectUrl)).toBeNull();
  });

  it('never emits a direct source for project media, while preserving normal HTTPS media links', () => {
    expect(mediaAttributeForProject(locator, projectUrl)).toContain('data-private-media-url=');
    expect(mediaAttributeForProject(locator, projectUrl)).not.toContain('src=');
    expect(mediaAttributeForProject('https://cdn.example/photo.png', projectUrl)).toBe('src="https://cdn.example/photo.png"');
    expect(mediaAttributeForProject('https://cdn.example/photo.png', projectUrl, 'href')).toBe('href="https://cdn.example/photo.png"');
    expect(mediaAttributeForProject('javascript:alert(1)', projectUrl)).toBe('');
  });

  it('fails closed for recognizable media locators from a different or unconfigured project', () => {
    const otherProjectLocator = locator.replace('project.example', 'other-project.supabase.co');
    expect(mediaAttributeForProject(otherProjectLocator, projectUrl)).toContain('data-private-media-url=');
    expect(mediaAttributeForProject(otherProjectLocator, projectUrl)).not.toContain('src=');
    expect(mediaAttributeForProject(otherProjectLocator, 'https://unconfigured.invalid')).not.toContain('href=');
    expect(storageObjectPathFromUrl(otherProjectLocator, projectUrl)).toBeNull();
  });

  it('limits signed-link lifetime so a privacy change has a bounded stale-link window', () => {
    expect(privateMediaPolicy.bucket).toBe('public-media');
    expect(privateMediaPolicy.signedUrlTtlSeconds).toBeLessThanOrEqual(300);
  });
});
