export const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;

/** How hard the model thinks before it answers or picks a tool. */
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Read a level from configuration. Undefined when the value is unset or is not a level. */
export function parseThinkingLevel(value: string | undefined): ThinkingLevel | undefined {
  const wanted = value?.trim().toLowerCase();
  return THINKING_LEVELS.find(level => level === wanted);
}
