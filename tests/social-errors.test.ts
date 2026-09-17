import { describe, expect, it } from 'vitest';
import { socialLoadNotice } from '../src/lib/social-errors';

describe('social-service error copy', () => {
  it('explains missing backend setup without exposing schema details', () => {
    const message = socialLoadNotice(new Error('Could not find the function public.my_profiles without parameters in the schema cache'));
    expect(message).toContain('setup issue on our side');
    expect(message).not.toMatch(/schema cache|public\.my_profiles|SQL|PGRST/i);
  });

  it('uses calm, actionable copy for other service failures', () => {
    expect(socialLoadNotice(new Error('TypeError: Failed to fetch')))
      .toBe('HexiSpace could not load its social features. Check your connection and try again.');
    expect(socialLoadNotice(null)).toContain('Check your connection');
  });
});
