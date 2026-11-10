import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Vite/Vitest aliases for every `@mtg/*` path in tsconfig.base.json, so a new
 * library only has to be registered in one place.
 */
export function workspaceAliases(): Record<string, string> {
  const tsconfig = JSON.parse(readFileSync(resolve(__dirname, 'tsconfig.base.json'), 'utf8')) as {
    compilerOptions: { paths: Record<string, string[]> };
  };
  return Object.fromEntries(
    Object.entries(tsconfig.compilerOptions.paths).map(([name, [target]]) => [name, resolve(__dirname, target!)]),
  );
}
