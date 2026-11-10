import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, it, expect } from 'vitest';
import { CardIndexBuilder } from '@mtg/card-index';
import { CardIndexMissingError } from '@mtg/card-index/node';
import { loadAdvisorData } from './load';

const dir = mkdtempSync(join(tmpdir(), 'advisor-load-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function writeIndex(): string {
  const builder = new CardIndexBuilder();
  builder.addPrinting({
    oracle_id: 'o1', name: 'Shock', layout: 'normal', set: 'tst', rarity: 'common', games: ['arena'],
    legalities: { standard: 'legal' }, type_line: 'Instant', mana_cost: '{R}', cmc: 1,
  });
  const path = join(dir, 'card-index.json.gz');
  writeFileSync(path, gzipSync(JSON.stringify(builder.build())));
  return path;
}

const snapshot = (format: string) => JSON.stringify({ format, archetypes: [], sources: [] });

describe('loadAdvisorData', () => {
  it('loads the card index and every readable meta snapshot', () => {
    const metaDir = join(dir, 'meta-ok');
    mkdirSync(metaDir);
    writeFileSync(join(metaDir, 'standard.json'), snapshot('standard'));
    writeFileSync(join(metaDir, 'pioneer.json'), snapshot('pioneer'));

    const { data, warnings } = loadAdvisorData({ cardIndexPath: writeIndex(), metaDir });
    expect(data.index.byName('Shock')?.oracleId).toBe('o1');
    expect([...data.meta.keys()].sort()).toEqual(['pioneer', 'standard']);
    expect(warnings).toEqual([]);
  });

  it('skips a snapshot that is cut short or is not one, and says so', () => {
    const metaDir = join(dir, 'meta-bad');
    mkdirSync(metaDir);
    writeFileSync(join(metaDir, 'standard.json'), snapshot('standard'));
    writeFileSync(join(metaDir, 'pioneer.json'), '{"format":"pioneer","archetypes":[');
    writeFileSync(join(metaDir, 'modern.json'), '{"hello":"world"}');

    const { data, warnings } = loadAdvisorData({ cardIndexPath: writeIndex(), metaDir });
    expect([...data.meta.keys()]).toEqual(['standard']);
    expect(warnings).toHaveLength(2);
    expect(warnings.join('\n')).toMatch(/Skipped meta snapshot modern\.json: not a meta snapshot/);
    expect(warnings.join('\n')).toMatch(/Skipped meta snapshot pioneer\.json/);
  });

  it('runs without any meta directory', () => {
    const { data } = loadAdvisorData({ cardIndexPath: writeIndex(), metaDir: join(dir, 'nowhere') });
    expect(data.meta.size).toBe(0);
  });

  it('says how to build the card index when it is missing', () => {
    expect(() => loadAdvisorData({ cardIndexPath: join(dir, 'missing.json.gz') })).toThrow(CardIndexMissingError);
    expect(() => loadAdvisorData({ cardIndexPath: join(dir, 'missing.json.gz') })).toThrow(/pnpm data:cards/);
  });
});
