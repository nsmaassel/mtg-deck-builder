/**
 * Rates reference Commander decks with the bracket assessment, to see how it
 * does on lists it did not build.
 *
 * The reference decks are Wizards' preconstructed Commander decks, as MTGJSON
 * publishes them (https://mtgjson.com, MIT licence). No public set of decks
 * labelled with a bracket exists; precons are the closest thing, because
 * Wizards described Bracket 2 as "the average current preconstructed deck"
 * until October 2025. For a second opinion the script can ask Commander
 * Spellbook's bracket estimator about the same lists (a few requests, one a
 * second, named in the User-Agent).
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/eval-brackets.ts [options]
 *   --since 2023            only decks released from this year on (default: all)
 *   --spellbook 12          also ask Commander Spellbook about this many decks, newest first
 *   --fixtures <file>       write a sample of the decks, in the shape the power-level tests read
 *   --cache .cache/mtgjson  where the downloads are kept
 *   --json                  machine-readable output
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { IndexedCard } from '@mtg/card-index';
import { loadCardIndex } from '@mtg/card-index/node';
import { loadCombos } from '@mtg/combos/node';
import { comboLines, listAsDeck } from '@mtg/deck-builder';
import { assessPowerLevel, comboBracket } from '@mtg/power-level';

const USER_AGENT = 'mtg-deck-builder/1.0 (+https://github.com/nsmaassel/mtg-deck-builder)';
const MTGJSON = 'https://mtgjson.com/api/v5';
const SPELLBOOK = 'https://backend.commanderspellbook.com/estimate-bracket';
const SPELLBOOK_TAGS: Record<string, string> = { E: 'Exhibition', C: 'Core', O: 'Oddball', P: 'Powerful', S: 'Spicy', R: 'Ruthless', B: 'Banned' };

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const cacheDir = resolve(option('cache') ?? '.cache/mtgjson');
const since = Number(option('since') ?? 0);
const askSpellbook = Number(option('spellbook') ?? 0);
const fixturesPath = option('fixtures');
const asJson = args.includes('--json');

interface MtgjsonCard {
  name: string;
  count: number;
  identifiers?: { scryfallOracleId?: string };
}
interface MtgjsonDeck {
  name: string;
  code: string;
  releaseDate: string;
  commander: MtgjsonCard[];
  mainBoard: MtgjsonCard[];
}

async function cached<T>(file: string, url: string): Promise<T> {
  const path = join(cacheDir, file);
  if (!existsSync(path)) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    writeFileSync(path, await response.text());
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  const index = loadCardIndex();
  const combos = loadCombos();

  const list = await cached<{ data: Array<{ name: string; code: string; fileName: string; releaseDate: string | null; type: string }> }>(
    'DeckList.json',
    `${MTGJSON}/DeckList.json`,
  );
  const precons = list.data
    .filter(deck => deck.type === 'Commander Deck' && deck.releaseDate && !/Collector/.test(deck.name))
    .filter(deck => Number(deck.releaseDate!.slice(0, 4)) >= since)
    .sort((a, b) => b.releaseDate!.localeCompare(a.releaseDate!) || a.name.localeCompare(b.name));

  const find = (card: MtgjsonCard): IndexedCard | undefined =>
    (card.identifiers?.scryfallOracleId && index.get(card.identifiers.scryfallOracleId)) || index.byName(card.name);

  const rows = [];
  for (const entry of precons) {
    const { data: deck } = await cached<{ data: MtgjsonDeck }>(`${entry.fileName}.json`, `${MTGJSON}/decks/${entry.fileName}.json`);
    const commander = deck.commander[0] && find(deck.commander[0]);
    if (!commander) continue;
    // A second commander (partner, background) is rated as one of the 99: it is in the deck either way.
    const cards: IndexedCard[] = [];
    let unknown = 0;
    for (const card of [...deck.commander.slice(1), ...deck.mainBoard]) {
      const known = find(card);
      if (!known) unknown += card.count;
      else if (!known.isBasicLand) cards.push(known);
      else for (let i = 0; i < card.count; i++) cards.push(known);
    }
    const shaped = listAsDeck(commander, cards);
    const lines = comboLines(index, combos, shaped.deck);
    const power = assessPowerLevel(shaped.deck, shaped.analysis, undefined, undefined, lines);
    rows.push({ entry, deck, commander, shaped, lines, power, unknown, spellbook: undefined as string | undefined });
  }

  for (const row of rows.slice(0, askSpellbook)) {
    const body = {
      commanders: row.deck.commander.map(card => ({ card: card.name, quantity: 1 })),
      main: row.deck.mainBoard.map(card => ({ card: card.name, quantity: card.count })),
    };
    // Their answer is kept beside the downloads, so a rerun does not ask again.
    const kept = join(cacheDir, `spellbook-${row.entry.fileName}.txt`);
    if (existsSync(kept)) {
      row.spellbook = readFileSync(kept, 'utf8');
      continue;
    }
    const response = await fetch(SPELLBOOK, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      row.spellbook = ((await response.json()) as { bracketTag: string }).bracketTag;
      writeFileSync(kept, row.spellbook);
    } else {
      row.spellbook = `HTTP ${response.status}`;
    }
    await sleep(1000);
  }

  if (fixturesPath) {
    // One ordinary deck a year since 2020: the one in the middle of its year for how widely played its cards are.
    const ordinary: Array<(typeof rows)[number]> = [];
    for (const year of new Set(rows.map(row => row.entry.releaseDate!.slice(0, 4)))) {
      if (Number(year) < 2020) continue;
      const ofYear = rows
        .filter(row => row.entry.releaseDate!.startsWith(year) && row.unknown === 0)
        .sort((a, b) => a.shaped.analysis.averagePopularityPercent - b.shaped.analysis.averagePopularityPercent || a.entry.name.localeCompare(b.entry.name));
      if (ofYear.length > 0) ordinary.push(ofYear[Math.floor(ofYear.length / 2)]!);
    }
    // And the newest deck for each kind of reason that puts a precon above Bracket 2: each is one a person can check.
    const byReason = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (row.power.bracket <= 2 || row.unknown > 0) continue;
      const kind = row.power.findings[0]!.text.replace(/\(.*?\)|\d+/g, '').trim();
      if (!byReason.has(kind)) byReason.set(kind, row);
    }
    const chosen = [...new Set([...ordinary, ...byReason.values()])];
    const fixtures = {
      source: 'Preconstructed Commander decks from MTGJSON (https://mtgjson.com), MIT licence. Card facts from Scryfall; combos from Commander Spellbook.',
      generatedBy: 'scripts/eval-brackets.ts --fixtures',
      cardDataDate: index.builtAt.slice(0, 10),
      decks: chosen.map(row => ({
        name: row.entry.name,
        set: row.entry.code,
        released: row.entry.releaseDate,
        bracket: row.power.bracket,
        averageCmc: row.shaped.analysis.averageCmc,
        averagePopularityPercent: row.shaped.analysis.averagePopularityPercent,
        // name, slot, mana value, then what the card data flags: G = Game Changer, and the traits.
        cards: [row.shaped.deck.commander, ...Object.values(row.shaped.deck.slots).flat()].map(card => [
          card.name,
          card.slot,
          card.cmc,
          ...(card.gameChanger ? ['G'] : []),
          ...(card.traits ?? []),
        ]),
        combos: row.lines.filter(line => comboBracket(line) >= 3),
      })),
    };
    writeFileSync(fixturesPath, `${JSON.stringify(fixtures)}\n`);
    console.error(`Wrote ${chosen.length} decks to ${fixturesPath}`);
  }

  const summary = rows.map(row => ({
    name: row.entry.name,
    set: row.entry.code,
    released: row.entry.releaseDate,
    commander: row.commander.name,
    bracket: row.power.bracket,
    why: row.power.findings.filter(finding => finding.bracket === row.power.bracket).map(finding => finding.text),
    widelyPlayed: row.shaped.analysis.averagePopularityPercent,
    unknownCards: row.unknown,
    spellbook: row.spellbook ? (SPELLBOOK_TAGS[row.spellbook] ?? row.spellbook) : undefined,
  }));
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const byBracket = new Map<number, number>();
  for (const row of summary) byBracket.set(row.bracket, (byBracket.get(row.bracket) ?? 0) + 1);
  console.log(`${summary.length} preconstructed Commander decks, card data of ${index.builtAt.slice(0, 10)}`);
  for (const bracket of [1, 2, 3, 4, 5]) console.log(`  Bracket ${bracket}: ${byBracket.get(bracket) ?? 0}`);
  console.log('\nBy year (decks in Bracket 1 / 2 / 3 / 4 / 5, average "widely played" score):');
  const years = [...new Set(summary.map(row => row.released!.slice(0, 4)))].sort();
  for (const year of years) {
    const ofYear = summary.filter(row => row.released!.startsWith(year));
    const counts = [1, 2, 3, 4, 5].map(bracket => ofYear.filter(row => row.bracket === bracket).length);
    const played = Math.round(ofYear.reduce((sum, row) => sum + row.widelyPlayed, 0) / ofYear.length);
    console.log(`  ${year}: ${counts.join(' / ')}   ${played}`);
  }
  console.log('\nAbove Bracket 2:');
  for (const row of summary.filter(row => row.bracket > 2)) {
    console.log(`  ${row.released} ${row.name} (${row.set}): Bracket ${row.bracket}. ${row.why.join('; ')}`);
  }
  const asked = summary.filter(row => row.spellbook);
  if (asked.length > 0) {
    console.log("\nCommander Spellbook's estimate for the same list:");
    for (const row of asked) console.log(`  ${row.name} (${row.set}): ours Bracket ${row.bracket}, theirs ${row.spellbook}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
