export type ModelAccess =
  | { configured: true; via: 'api-key' | 'vertex-ai' }
  | { configured: false; reason: string };

const truthy = (value: string | undefined): boolean => ['true', '1'].includes((value ?? '').toLowerCase());

/**
 * Whether the environment gives the ADK a way to reach Gemini, decided the way
 * the ADK itself decides (its `geminiInitParams`), so the status endpoint and
 * the first chat message never disagree.
 *
 * `GOOGLE_GENAI_USE_ENTERPRISE` selects Vertex AI and wins over the deprecated
 * `GOOGLE_GENAI_USE_VERTEXAI` whenever it is set at all. Vertex AI needs a
 * project and a location; otherwise an API key is required.
 */
export function detectModelAccess(env: Record<string, string | undefined>): ModelAccess {
  const vertex = env['GOOGLE_GENAI_USE_ENTERPRISE'] !== undefined
    ? truthy(env['GOOGLE_GENAI_USE_ENTERPRISE'])
    : truthy(env['GOOGLE_GENAI_USE_VERTEXAI']);

  if (vertex) {
    const missing = ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION'].filter(name => !env[name]);
    return missing.length
      ? { configured: false, reason: `Vertex AI is selected but ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set` }
      : { configured: true, via: 'vertex-ai' };
  }
  if (env['GOOGLE_GENAI_API_KEY'] || env['GOOGLE_API_KEY'] || env['GEMINI_API_KEY']) {
    return { configured: true, via: 'api-key' };
  }
  return { configured: false, reason: 'no Gemini API key and Vertex AI is not selected' };
}
