import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, afterEach, describe, it, expect } from 'vitest';
import { CombosMissingError, loadCombos } from './load';
import { VARIANTS, buildTestFile, oracleId } from './testing/fixtures';

const dir = mkdtempSync(join(tmpdir(), 'combos-load-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const savedPath = process.env['COMBOS_PATH'];
afterEach(() => {
  if (savedPath === undefined) delete process.env['COMBOS_PATH'];
  else process.env['COMBOS_PATH'] = savedPath;
});

describe('loadCombos', () => {
  it('reads a gzipped combos file', () => {
    const path = join(dir, 'combos.json.gz');
    writeFileSync(path, gzipSync(JSON.stringify(buildTestFile())));

    const combos = loadCombos(path);
    expect(combos.size).toBe(VARIANTS.length);
    expect(combos.get('100-200')?.cards).toEqual([oracleId('Heliod, Sun-Crowned'), oracleId('Walking Ballista')]);
  });

  it('reads a plain JSON file too', () => {
    const path = join(dir, 'combos.json');
    writeFileSync(path, JSON.stringify(buildTestFile()));
    expect(loadCombos(path).size).toBe(VARIANTS.length);
  });

  it('takes the path from COMBOS_PATH when none is given', () => {
    const path = join(dir, 'from-env.json');
    writeFileSync(path, JSON.stringify(buildTestFile(VARIANTS.slice(0, 3))));
    process.env['COMBOS_PATH'] = path;
    expect(loadCombos().size).toBe(3);
  });

  it('says how to build the combos when the file is missing', () => {
    const missing = join(dir, 'missing.json.gz');
    expect(() => loadCombos(missing)).toThrow(CombosMissingError);
    expect(() => loadCombos(missing)).toThrow(/pnpm data:combos/);
    expect(() => loadCombos(missing)).toThrow(missing);
  });
});
