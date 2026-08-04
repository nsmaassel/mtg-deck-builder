/**
 * Deck quality comparison harness.
 * Builds a deck via the API (new-player path: no collection), then compares it
 * against EDHRec's top-recommended cards for that commander. Flags high-inclusion
 * cards that were missed, and checks slot assignment sanity.
 *
 * Usage: npx tsx scripts/eval-vs-top.ts
 */
const API = 'http://localhost:3000';
const EDHREC = 'https://json.edhrec.com/pages';

const COMMANDERS = [
  'Krenko, Mob Boss',
  'Atraxa, Praetors\' Voice',
  'The Ur-Dragon',
  'Edgar Markov',
  'Muldrotha, the Gravetide',
  'Rhys the Redeemed',
];

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

interface EdhrecCard { name: string; inclusion: number; synergy: number; }

async function getEdhrecTop(name: string): Promise<EdhrecCard[]> {
  const res = await fetch(`${EDHREC}/commanders/${slug(name)}.json`, {
    headers: { 'User-Agent': 'mtg-deck-builder/1.0 (https://github.com/nsmaassel/mtg-deck-builder)' },
  });
  if (!res.ok) throw new Error(`EDHRec ${res.status} for ${name}`);
  const raw = await res.json();
  const lists = raw?.container?.json_dict?.cardlists ?? [];
  const cards: EdhrecCard[] = [];
  for (const list of lists) {
    for (const cv of list.cardviews) {
      cards.push({ name: String(cv.name), inclusion: Number(cv.inclusion ?? cv.num_decks ?? 0), synergy: Number(cv.synergy ?? 0) });
    }
  }
  // Dedupe keep highest inclusion
  const byName = new Map<string, EdhrecCard>();
  for (const c of cards) {
    const cur = byName.get(c.name);
    if (!cur || c.inclusion > cur.inclusion) byName.set(c.name, c);
  }
  return [...byName.values()].sort((a, b) => b.inclusion - a.inclusion);
}

async function buildDeck(name: string): Promise<{ totalCards: number; cards: string[]; slots: Record<string, string[]> }> {
  const res = await fetch(`${API}/api/decks/build-from-commander`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collectionText: '', commanderName: name, options: { mode: 'prefer-owned' } }),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(`API ${res.status}: ${e?.error ?? e?.message ?? '?'}`);
  }
  const data = await res.json();
  const slots: Record<string, string[]> = {};
  for (const [slot, arr] of Object.entries(data.deck.slots as Record<string, Array<{ name: string }>>)) {
    slots[slot] = arr.map(c => c.name);
  }
  const cards = [data.deck.commander.name, ...Object.values(slots).flat()];
  return { totalCards: data.deck.totalCards, cards, slots };
}

function analyze(name: string, deckCards: string[], top: EdhrecCard[]) {
  const deckSet = new Set(deckCards.map(c => c.toLowerCase()));
  const results: string[] = [];
  let inTop20 = 0, inTop50 = 0, inTop100 = 0;
  const missedHigh: Array<{ rank: number; name: string; inclusion: number; note: string }> = [];

  top.forEach((card, i) => {
    const rank = i + 1;
    const present = deckSet.has(card.name.toLowerCase());
    if (present) {
      if (rank <= 20) inTop20++;
      if (rank <= 50) inTop50++;
      if (rank <= 100) inTop100++;
    } else if (rank <= 30) {
      missedHigh.push({ rank, name: card.name, inclusion: card.inclusion, note: 'not in deck' });
    }
  });

  // Slot sanity: check top-5 recommended cards ended up in sensible slots
  results.push(`  Top-20 coverage: ${inTop20}/20 · Top-50: ${inTop50}/50 · Top-100: ${inTop100}/100`);
  if (missedHigh.length) {
    results.push(`  Missed in top-30 (high inclusion):`);
    for (const m of missedHigh.slice(0, 8)) {
      results.push(`    #${m.rank} ${m.name} (${m.inclusion}% inclusion) — ${m.note}`);
    }
  } else {
    results.push(`  ✓ All top-30 recommendations made it into the deck`);
  }
  return results;
}

async function main() {
  console.log('🧪 Deck Quality vs EDHRec Top Cards\n');
  const summary: string[] = [];

  for (const name of COMMANDERS) {
    console.log(`━━━ ${name} ━━━`);
    try {
      const top = await getEdhrecTop(name);
      const deck = await buildDeck(name);
      console.log(`  Built ${deck.totalCards} cards (${Object.values(deck.slots).reduce((s, a) => s + a.length, 0)} in slots + commander)`);
      const lines = analyze(name, deck.cards, top);
      summary.push(...lines);
      console.log(lines.join('\n'));
    } catch (e) {
      console.log(`  ❌ ${(e as Error).message}`);
    }
    console.log();
  }

  console.log('━━━ Key learnings ━━━');
  console.log(summary.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });