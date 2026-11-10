import { CardIndex, CardIndexBuilder } from '@mtg/card-index';
import type { ScryfallPrinting } from '@mtg/card-index';
import type { Collection, Wildcards } from '../types';

const ARENA_FORMATS = ['standard', 'alchemy', 'historic', 'timeless', 'pioneer', 'brawl', 'standardbrawl', 'commander'];

interface CardSpec {
  name: string;
  cost?: string;
  type: string;
  text?: string;
  rarity?: string;
  tags?: string[];
  /** Formats the card is legal in. Defaults to every Arena format plus Commander. */
  legal?: string[];
  onArena?: boolean;
  identity?: string[];
  produces?: string[];
  rank?: number;
}

const CARDS: CardSpec[] = [
  // Red
  { name: 'Lightning Strike', cost: '{1}{R}', type: 'Instant', text: 'Lightning Strike deals 3 damage to any target.', tags: ['burn', 'removal', 'removal-creature'] },
  { name: 'Shock', cost: '{R}', type: 'Instant', text: 'Shock deals 2 damage to any target.', tags: ['burn', 'removal', 'removal-creature'] },
  { name: 'Abrade', cost: '{1}{R}', type: 'Instant', rarity: 'uncommon', text: 'Choose one — Abrade deals 3 damage to target creature; or destroy target artifact.', tags: ['removal', 'removal-creature', 'removal-artifact'] },
  { name: 'Slickshot Show-Off', cost: '{1}{R}', type: 'Creature — Bird Wizard', rarity: 'rare', text: 'Flying, haste. Whenever you cast a noncreature spell, Slickshot Show-Off gets +2/+0 until end of turn.', tags: ['prowess-like', 'cast-trigger-you'] },
  { name: 'Crackling Cyclops', cost: '{2}{R}', type: 'Creature — Cyclops Wizard', text: 'Whenever you cast a noncreature spell, Crackling Cyclops gets +3/+0 until end of turn.', tags: ['prowess-like', 'cast-trigger-you'] },
  { name: 'Hulking Raptor', cost: '{2}{R}', type: 'Creature — Dinosaur', text: 'Trample.', tags: [] },
  // Blue
  { name: 'Opt', cost: '{U}', type: 'Instant', text: 'Scry 1. Draw a card.', tags: ['cantrip', 'draw'], rank: 300 },
  { name: 'Consider', cost: '{U}', type: 'Instant', text: 'Surveil 1. Draw a card.', tags: ['cantrip', 'draw'], rank: 500 },
  { name: 'Negate', cost: '{1}{U}', type: 'Instant', text: 'Counter target noncreature spell.', tags: ['counterspell'] },
  { name: 'Essence Scatter', cost: '{1}{U}', type: 'Instant', text: 'Counter target creature spell.', tags: ['counterspell'] },
  { name: 'Brainstorm', cost: '{U}', type: 'Instant', text: 'Draw three cards, then put two cards from your hand on top of your library.', tags: ['draw'], legal: ['historic', 'timeless', 'brawl', 'commander'] },
  { name: 'Tempest Angler', cost: '{1}{U/R}{U/R}', type: 'Creature — Turtle Wizard', text: 'Whenever you cast a noncreature spell, put a +1/+1 counter on Tempest Angler.', tags: ['prowess-like', 'cast-trigger-you'] },
  // Black
  { name: 'Go for the Throat', cost: '{1}{B}', type: 'Instant', rarity: 'uncommon', text: 'Destroy target nonartifact creature.', tags: ['removal', 'removal-creature', 'removal-destroy'] },
  { name: 'Cut Down', cost: '{B}', type: 'Instant', rarity: 'uncommon', text: 'Destroy target creature with total power and toughness 5 or less.', tags: ['removal', 'removal-creature', 'removal-destroy'] },
  { name: 'Duress', cost: '{B}', type: 'Sorcery', text: 'Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.', tags: ['hand-disruption'] },
  { name: 'Sheoldred, the Apocalypse', cost: '{2}{B}{B}', type: 'Legendary Creature — Phyrexian Praetor', rarity: 'mythic', text: 'Deathtouch. Whenever you draw a card, you gain 2 life. Whenever an opponent draws a card, they lose 2 life.', tags: ['lifegain', 'opponent-loses-life'] },
  { name: 'Vampire Nighthawk', cost: '{1}{B}{B}', type: 'Creature — Vampire Shaman', rarity: 'uncommon', text: 'Flying, deathtouch, lifelink.', tags: ['lifegain'] },
  { name: 'Gray Merchant', cost: '{3}{B}{B}', type: 'Creature — Zombie', text: 'When this enters, each opponent loses 2 life.', tags: ['opponent-loses-life'] },
  { name: 'Callous Sell-Sword // Burn Together', cost: '{1}{B} // {R}', type: 'Creature — Human Soldier // Sorcery — Adventure', rarity: 'uncommon', text: 'Fling a creature.', tags: ['burn'], identity: ['B', 'R'] },
  // Green and white
  { name: 'Llanowar Elves', cost: '{G}', type: 'Creature — Elf Druid', text: '{T}: Add {G}.', tags: ['ramp', 'mana-dork'], produces: ['G'] },
  { name: 'Elvish Mystic', cost: '{G}', type: 'Creature — Elf Druid', text: '{T}: Add {G}.', tags: ['ramp', 'mana-dork'], produces: ['G'] },
  { name: 'Fyndhorn Elves', cost: '{G}', type: 'Creature — Elf Druid', text: '{T}: Add {G}.', tags: ['ramp', 'mana-dork'], produces: ['G'] },
  { name: 'Sunfall', cost: '{3}{W}{W}', type: 'Sorcery', rarity: 'rare', text: 'Exile all creatures.', tags: ['sweeper', 'removal'] },
  { name: 'Depopulate', cost: '{2}{W}{W}', type: 'Sorcery', rarity: 'rare', text: 'Destroy all creatures.', tags: ['sweeper', 'removal'] },
  // Artifacts
  { name: 'Soul-Guide Lantern', cost: '{1}', type: 'Artifact', rarity: 'uncommon', text: 'Exile target card from a graveyard. Sacrifice this: draw a card.', tags: ['hate-graveyard', 'draw', 'egg'] },
  { name: 'Ghost Vacuum', cost: '{1}', type: 'Artifact', rarity: 'rare', text: '{T}: Exile target card from a graveyard.', tags: ['hate-graveyard'] },
  { name: 'Bagel and Schmear', cost: '{1}', type: 'Artifact — Food', text: 'Sacrifice this: draw a card.', tags: ['draw', 'egg'] },
  { name: 'Mana Crypt', cost: '{0}', type: 'Artifact', rarity: 'mythic', text: '{T}: Add {C}{C}.', tags: ['ramp'], legal: ['commander'], onArena: false },
  // Pioneer-legal on paper, never released on Arena.
  { name: 'Hidden Strings', cost: '{1}{U}', type: 'Sorcery', text: 'You may tap or untap target permanent, then you may tap or untap another target permanent.', tags: [], legal: ['pioneer', 'commander'], onArena: false },
  // Commander
  { name: 'Niv-Mizzet, Parun', cost: '{U}{U}{U}{R}{R}{R}', type: 'Legendary Creature — Dragon Wizard', rarity: 'rare', text: 'Flying. Whenever you draw a card, Niv-Mizzet deals 1 damage to any target.', tags: ['draw'], identity: ['U', 'R'] },
  // Lands
  { name: 'Steam Vents', type: 'Land — Island Mountain', rarity: 'rare', text: '({T}: Add {U} or {R}.) As this enters, you may pay 2 life. If you don\'t, it enters tapped.', tags: ['dual-land', 'conditional-tapland'], identity: ['U', 'R'], produces: ['U', 'R'] },
  { name: 'Spirebluff Canal', type: 'Land', rarity: 'rare', text: 'This enters tapped unless you control two or fewer other lands. {T}: Add {U} or {R}.', tags: ['dual-land', 'conditional-tapland'], identity: ['U', 'R'], produces: ['U', 'R'] },
  { name: 'Izzet Guildgate', type: 'Land — Gate', text: 'This enters tapped. {T}: Add {U} or {R}.', tags: ['dual-land', 'tapland'], identity: ['U', 'R'], produces: ['U', 'R'] },
  { name: 'Swiftwater Cliffs', type: 'Land', text: 'This enters tapped. When it enters, you gain 1 life. {T}: Add {U} or {R}.', tags: ['dual-land', 'tapland'], identity: ['U', 'R'], produces: ['U', 'R'] },
  { name: 'Watery Grave', type: 'Land — Island Swamp', rarity: 'rare', text: '({T}: Add {U} or {B}.)', tags: ['dual-land', 'conditional-tapland'], identity: ['U', 'B'], produces: ['U', 'B'] },
  { name: 'Secluded Courtyard', type: 'Land', rarity: 'uncommon', text: 'Choose a creature type. {T}: Add one mana of any color. Spend it only on that type.', tags: ['rainbow-land', 'restricted-mana'], produces: ['W', 'U', 'B', 'R', 'G'] },
  { name: 'Cavern of Souls', type: 'Land', rarity: 'mythic', text: 'Choose a creature type. {T}: Add one mana of any color. Spend it only on that type.', tags: ['rainbow-land', 'restricted-mana'], produces: ['W', 'U', 'B', 'R', 'G'] },
  { name: 'Mutavault', type: 'Land', rarity: 'rare', text: '{T}: Add {C}. {1}: This becomes a 2/2 creature until end of turn.', tags: ['creatureland'], produces: ['C'] },
  { name: 'Soulstone Sanctuary', type: 'Land', rarity: 'rare', text: '{T}: Add {C}. {4}: This becomes a 3/3 creature.', tags: ['creatureland'], produces: ['C'] },
  { name: 'Island', type: 'Basic Land — Island', identity: ['U'], produces: ['U'] },
  { name: 'Mountain', type: 'Basic Land — Mountain', identity: ['R'], produces: ['R'] },
  { name: 'Swamp', type: 'Basic Land — Swamp', identity: ['B'], produces: ['B'] },
  { name: 'Forest', type: 'Basic Land — Forest', identity: ['G'], produces: ['G'] },
  { name: 'Plains', type: 'Basic Land — Plains', identity: ['W'], produces: ['W'] },
];

function colorsOf(cost: string): string[] {
  return [...new Set([...cost].filter(ch => 'WUBRG'.includes(ch)))];
}

function manaValue(cost: string): number {
  const front = cost.split(' // ')[0] ?? '';
  let total = 0;
  for (const [, symbol = ''] of front.matchAll(/\{([^}]+)\}/g)) total += /^\d+$/.test(symbol) ? Number(symbol) : 1;
  return total;
}

export function oracleId(name: string): string {
  return `id:${name}`;
}

/** A small, hand-written card pool with the shapes the advisor has to cope with. */
export function buildTestIndex(): CardIndex {
  const builder = new CardIndexBuilder();
  const tagged = new Map<string, string[]>();

  CARDS.forEach((spec, i) => {
    const cost = spec.cost ?? '';
    const legal = spec.legal ?? ARENA_FORMATS;
    const printing: ScryfallPrinting = {
      oracle_id: oracleId(spec.name),
      name: spec.name,
      layout: spec.name.includes(' // ') ? 'adventure' : 'normal',
      set: 'tst',
      rarity: spec.rarity ?? 'common',
      games: spec.onArena === false ? ['paper'] : ['paper', 'arena'],
      arena_id: spec.onArena === false ? undefined : 1000 + i,
      mana_cost: cost,
      cmc: manaValue(cost),
      type_line: spec.type,
      oracle_text: spec.text ?? '',
      colors: colorsOf(cost.split(' // ')[0] ?? ''),
      color_identity: spec.identity ?? colorsOf(cost),
      produced_mana: spec.produces,
      legalities: Object.fromEntries(legal.map(f => [f, 'legal'])),
      edhrec_rank: spec.rank,
    };
    builder.addPrinting(printing);
    for (const tag of spec.tags ?? []) tagged.set(tag, [...(tagged.get(tag) ?? []), oracleId(spec.name)]);
  });

  for (const [slug, ids] of tagged) {
    builder.addTag({ id: `tag:${slug}`, slug, taggings: ids.map(oracle_id => ({ oracle_id })) });
  }
  return new CardIndex(builder.build({ builtAt: '2026-01-01T00:00:00Z' }));
}

/** A collection from `{ 'Card Name': copies }`. */
export function collectionOf(cards: Record<string, number>, wildcards?: Wildcards): Collection {
  return {
    owned: new Map(Object.entries(cards).map(([name, count]) => [oracleId(name), count])),
    wildcards,
  };
}
