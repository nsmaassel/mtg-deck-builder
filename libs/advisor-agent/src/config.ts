/**
 * Start-up configuration, kept apart from the main entry so a server can
 * decide whether to load the agent (and the ADK with it) at all.
 */
export { detectModelAccess } from './lib/model-access';
export type { ModelAccess } from './lib/model-access';
export { THINKING_LEVELS, parseThinkingLevel } from './lib/thinking';
export type { ThinkingLevel } from './lib/thinking';
