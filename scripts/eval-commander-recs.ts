/**
 * Shows what the Commander Builder would recommend, for reading by a person:
 * the themes it detects on each commander and its top picks per slot, with the
 * popularity, synergy and reason behind every card. Runs on the real card
 * index (`pnpm data:cards`), no server and no network.
 *
 * The recommendations are computed from Scryfall's card data and Tagger tags,
 * not from play data per commander, so the lists are meant to be judged by
 * eye: a Magic player should nod at most of each one.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/eval-commander-recs.ts [options] [commander ...]
 *   commander ...     card names, quoted (default: eight commanders across the common archetypes)
 *   --top 12          cards shown per slot; 0 prints the themes only
 *   --slot synergy    show only this slot; repeatable or a comma list
 *   --deck            also build a 100-card deck with an empty collection and check it
 *   --index <path>    card index file (default data/generated/card-index.json.gz)
 */
import type { CardIndex } from '@mtg/card-index';
import { loadCardIndex } from '@mtg/card-index/node';
import { RECOMMENDATION_SLOTS, profileCommander, recommend } from '@mtg/commander-recs';
import type { Recommendation, RecommendationSlot } from '@mtg/commander-recs';
import { parseArenaCollection } from '@mtg/collection';
import { SLOT_TARGETS, TOTAL_DECK_SIZE, buildDeckForCommander } from '@mtg/deck-builder';
import type { DeckCard, SlotName } from '@mtg/deck-builder';

const DEFAULT_COMMANDERS = [
  'Krenko, Mob Boss',
  'Meren of Clan Nel Toth',
  "Atraxa, Praetors' Voice",
  'Talrand, Sky Summoner',
  "Sythis, Harvest's Hand",
  'Edgar Markov',
  'Lathril, Blade of the Elves',
  'Chulane, Teller of Tales',
];

interface Options {
  commanders: string[];
  top: number;
  slots: RecommendationSlot[];
  deck: boolean;
  indexPath?: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { commanders: [], top: 12, slots: [], deck: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === '--top') options.top = Number.parseInt(value(), 10);
    else if (arg === '--slot') {
      for (const slot of value().split(',')) {
        if (!(RECOMMENDATION_SLOTS as readonly string[]).includes(slot)) {
          throw new Error(`Unknown slot "${slot}". Slots: ${RECOMMENDATION_SLOTS.join(', ')}`);
        }
        options.slots.push(slot as RecommendationSlot);
      }
    } else if (arg === '--deck') options.deck = true;
    else if (arg === '--index') options.indexPath = value();
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else options.commanders.push(arg);
  }
  if (options.commanders.length === 0) options.commanders = DEFAULT_COMMANDERS;
  if (options.slots.length === 0) options.slots = [...RECOMMENDATION_SLOTS];
  if (!Number.isFinite(options.top) || options.top < 0) throw new Error('--top needs a number, 0 for themes only');
  return options;
}

const pct = (value: number) => `${Math.round(value * 100)}`.padStart(3);

function printSlot(slot: RecommendationSlot, picks: Recommendation[], top: number): void {
  console.log(`\n  ${slot} (${picks.length} candidates)`);
  console.log('    score  pop  syn  mv  card');
  for (const pick of picks.slice(0, top)) {
    const name = pick.name.split(' // ')[0]!;
    console.log(
      `    ${pct(pick.score)}   ${pct(pick.popularity)}  ${pct(pick.synergy)}  ${String(pick.cmc).padStart(2)}  ${name.padEnd(34)} ${pick.reasons.join(' · ')}`,
    );
  }
}

/** Everything a legal Commander deck has to satisfy that a build could get wrong. */
function checkDeck(index: CardIndex, commanderName: string, identity: string[]): string[] {
  const commander = index.byName(commanderName)!;
  const { deck, analysis } = buildDeckForCommander(index, commander, parseArenaCollection('').collection);
  const cards: DeckCard[] = Object.values(deck.slots).flat();
  const problems: string[] = [];

  if (deck.totalCards !== TOTAL_DECK_SIZE) problems.push(`${deck.totalCards} cards, expected ${TOTAL_DECK_SIZE}`);
  for (const [slot, target] of Object.entries(SLOT_TARGETS) as Array<[SlotName, number]>) {
    const filled = deck.slots[slot].length;
    if (filled !== target) problems.push(`${slot}: ${filled} cards, target ${target}`);
  }

  const seen = new Set<string>([commander.name]);
  for (const card of cards) {
    const indexed = index.byName(card.name);
    if (!indexed) {
      problems.push(`${card.name} is not in the card index`);
      continue;
    }
    if (!indexed.colorIdentity.every(color => identity.includes(color))) {
      problems.push(`${card.name} is outside the colour identity`);
    }
    if (!indexed.legal.includes('commander')) problems.push(`${card.name} is not legal in Commander`);
    if (indexed.isBasicLand) continue;
    if (seen.has(indexed.name)) problems.push(`${card.name} appears more than once`);
    seen.add(indexed.name);
  }

  console.log(`\n  Deck: ${deck.totalCards} cards, average mana value ${analysis.averageCmc}`);
  for (const [slot, slotCards] of Object.entries(deck.slots)) {
    console.log(`    ${slot} (${slotCards.length}): ${slotCards.map(card => card.name.split(' // ')[0]).join(', ')}`);
  }
  console.log(problems.length ? `  Deck problems:\n${problems.map(p => `    - ${p}`).join('\n')}` : '  Deck checks pass');
  return problems;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const index = loadCardIndex(options.indexPath);
  console.log(`Card index: ${index.size} cards, Scryfall data from ${index.cardsUpdatedAt ?? 'an unknown date'}`);
  console.log('pop = Commander-wide popularity from Scryfall\'s EDHREC rank, syn = fit with this commander; both 0-100.');

  let failed = false;
  for (const name of options.commanders) {
    const commander = index.byName(name);
    if (!commander) {
      console.log(`\n━━━ ${name} ━━━\n  Not in the card index.`);
      failed = true;
      continue;
    }
    const profile = profileCommander(index, commander);
    console.log(`\n━━━ ${commander.name.split(' // ')[0]} (${profile.identity.join('') || 'colourless'}) ━━━`);
    if (profile.themes.length === 0) console.log('  No theme detected: recommendations fall back to popularity and shared tags.');
    for (const theme of profile.themes) {
      console.log(`  ${theme.name} ${theme.weight.toFixed(2)}: a commander that ${theme.because}`);
    }

    if (options.top === 0) continue;

    const recommendations = recommend(index, profile);
    for (const slot of options.slots) {
      printSlot(slot, recommendations.filter(r => r.slot === slot), options.top);
    }
    if (options.deck && checkDeck(index, name, profile.identity).length > 0) failed = true;
  }
  if (failed) process.exitCode = 1;
}

main();
