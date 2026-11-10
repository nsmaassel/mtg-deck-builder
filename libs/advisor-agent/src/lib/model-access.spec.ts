import { describe, it, expect } from 'vitest';
import { detectModelAccess } from './model-access';

describe('detectModelAccess', () => {
  it('accepts any of the API key names the ADK reads', () => {
    for (const name of ['GOOGLE_GENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']) {
      expect(detectModelAccess({ [name]: 'k' })).toEqual({ configured: true, via: 'api-key' });
    }
  });

  it('reports no access when nothing is set', () => {
    expect(detectModelAccess({})).toEqual({ configured: false, reason: 'no Gemini API key and Vertex AI is not selected' });
  });

  it('accepts Vertex AI through either flag when project and location are set', () => {
    const cloud = { GOOGLE_CLOUD_PROJECT: 'p', GOOGLE_CLOUD_LOCATION: 'us-central1' };
    expect(detectModelAccess({ ...cloud, GOOGLE_GENAI_USE_ENTERPRISE: 'true' })).toEqual({ configured: true, via: 'vertex-ai' });
    expect(detectModelAccess({ ...cloud, GOOGLE_GENAI_USE_VERTEXAI: '1' })).toEqual({ configured: true, via: 'vertex-ai' });
  });

  it('says what Vertex AI is missing instead of claiming to be configured', () => {
    expect(detectModelAccess({ GOOGLE_GENAI_USE_VERTEXAI: 'true' })).toEqual({
      configured: false, reason: 'Vertex AI is selected but GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are not set',
    });
    expect(detectModelAccess({ GOOGLE_GENAI_USE_ENTERPRISE: 'true', GOOGLE_CLOUD_PROJECT: 'p' })).toEqual({
      configured: false, reason: 'Vertex AI is selected but GOOGLE_CLOUD_LOCATION is not set',
    });
  });

  it('does not fall back to an API key when Vertex AI is selected, as the ADK does not', () => {
    expect(detectModelAccess({ GOOGLE_GENAI_USE_ENTERPRISE: 'true', GOOGLE_API_KEY: 'k' }).configured).toBe(false);
  });

  it('lets the new flag overrule the deprecated one', () => {
    const env = { GOOGLE_GENAI_USE_ENTERPRISE: 'false', GOOGLE_GENAI_USE_VERTEXAI: 'true', GOOGLE_CLOUD_PROJECT: 'p', GOOGLE_CLOUD_LOCATION: 'l' };
    expect(detectModelAccess(env)).toEqual({ configured: false, reason: 'no Gemini API key and Vertex AI is not selected' });
    expect(detectModelAccess({ ...env, GEMINI_API_KEY: 'k' })).toEqual({ configured: true, via: 'api-key' });
  });
});
