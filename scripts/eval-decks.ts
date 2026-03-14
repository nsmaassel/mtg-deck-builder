/**
 * Deck quality evaluation harness.
 * Runs a battery of test commanders against the live API and scores results
 * against community-accepted Commander deck quality thresholds.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/eval-decks.ts
 *        npx tsx --tsconfig tsconfig.json scripts/eval-decks.ts --json  (machine-readable output)
 */

const API = 'http://localhost:3000';

// ── Rubric thresholds (community consensus from EDHRec / TappedOut research) ──
const RUBRIC = {
  totalCards:        { target: 100, min: 100, max: 100 },
  ramp:              { target: 10,  min: 8,   max: 14  },
  draw:              { target: 10,  min: 8,   max: 14  },
  interaction:       { target: 10,  min: 7,   max: 14  },
  winConditions:     { target: 5,   min: 3,   max: 8   },
  synergy:           { target: 25,  min: 18,  max: 30  },
  lands:             { target: 36,  min: 33,  max: 40  },
  avgCmc:            { target: 3.0, min: 2.2, max: 4.0 },
  staplesCoverage:   { target: 60,  min: 40,  max: 100 },
};

// ── Test suite: diverse commanders across colors, strategies, popularity ──
const TEST_COMMANDERS = [
  // Name                                 | Colors  | Strategy         | Notes
  { name: "Sol'Kanar the Swamp King",     note: 'historic 3-color control' },
  { name: "Krenko, Mob Boss",             note: 'mono-red goblin aggro' },
  { name: "Atraxa, Praetors' Voice",      note: '4-color proliferate (popular)' },
  { name: "The Ur-Dragon",               note: '5-color dragon tribal' },
  { name: "Muldrotha, the Gravetide",    note: 'sultai graveyard value' },
  { name: "Edgar Markov",               note: 'mardu vampire tribal (eminence)' },
  { name: "Heroes in a Half Shell",      note: 'new TMNT 5-color (sparse EDHRec data)' },
  { name: "Rhys the Redeemed",          note: 'selesnya token go-wide' },
];

// Tiny collection — forces mostly non-owned recommendations (tests prefer-owned mode properly)
const SMALL_COLLECTION = `
1 Sol Ring (C21) 263
1 Command Tower (CLB) 279
1 Arcane Signet (C21) 231
1 Cultivate (C21) 168
1 Swords to Plowshares (2X2) 38
1 Cyclonic Rift (2X2) 48
1 Counterspell (AFR) 52
1 Wrath of God (2X2) 4
`.trim();

interface SlotCounts {
  ramp: number; draw: number; interaction: number;
  winConditions: number; synergy: number; lands: number; flex: number;
}

interface EvalResult {
  commander: string;
  note: string;
  ok: boolean;
  error?: string;
  totalCards: number;
  slots: SlotCounts;
  avgCmc: number;
  staplesCoverage: number;
  missingStaples: number;
  flags: string[];
  score: number; // 0–100
}

function flag(label: string, value: number, thresholds: { min: number; max: number; target: number }): string | null {
  if (value < thresholds.min) return `⚠ ${label} too low: ${value} (min ${thresholds.min})`;
  if (value > thresholds.max) return `⚠ ${label} too high: ${value} (max ${thresholds.max})`;
  return null;
}

function score(result: Omit<EvalResult, 'flags' | 'score'>): { flags: string[]; score: number } {
  const flags: string[] = [];
  let points = 100;

  const checks: Array<[string, number, typeof RUBRIC.ramp]> = [
    ['total cards',    result.totalCards,          RUBRIC.totalCards],
    ['ramp',           result.slots.ramp,           RUBRIC.ramp],
    ['draw',           result.slots.draw,           RUBRIC.draw],
    ['interaction',    result.slots.interaction,    RUBRIC.interaction],
    ['win conditions', result.slots.winConditions,  RUBRIC.winConditions],
    ['synergy',        result.slots.synergy,        RUBRIC.synergy],
    ['lands',          result.slots.lands,          RUBRIC.lands],
    ['avg CMC',        result.avgCmc,               RUBRIC.avgCmc],
    ['staples coverage %', result.staplesCoverage,  RUBRIC.staplesCoverage],
  ];

  for (const [label, value, thresholds] of checks) {
    const f = flag(label, value, thresholds);
    if (f) {
      flags.push(f);
      // Deduct proportionally to how far off we are
      const deviation = Math.abs(value - thresholds.target) / thresholds.target;
      points -= Math.min(15, Math.round(deviation * 20));
    }
  }

  return { flags, score: Math.max(0, points) };
}

async function evalCommander(name: string, note: string): Promise<EvalResult> {
  const base: Omit<EvalResult, 'flags' | 'score'> = {
    commander: name, note, ok: false,
    totalCards: 0, slots: { ramp:0, draw:0, interaction:0, winConditions:0, synergy:0, lands:0, flex:0 },
    avgCmc: 0, staplesCoverage: 0, missingStaples: 0,
  };

  try {
    const res = await fetch(`${API}/api/decks/build-from-commander`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionText: SMALL_COLLECTION, commanderName: name }),
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      return { ...base, error: err.error ?? `HTTP ${res.status}`, ...score(base) };
    }

    const data = await res.json() as {
      deck: { totalCards: number; slots: Record<string, unknown[]> };
      analysis: { averageCmc: number; staplesCoveragePercent: number };
      gaps: { missingStaples: unknown[] };
    };

    const filled: Omit<EvalResult, 'flags' | 'score'> = {
      ...base,
      ok: true,
      totalCards: data.deck.totalCards,
      slots: {
        ramp:          data.deck.slots['ramp']?.length          ?? 0,
        draw:          data.deck.slots['draw']?.length          ?? 0,
        interaction:   data.deck.slots['interaction']?.length   ?? 0,
        winConditions: data.deck.slots['winConditions']?.length ?? 0,
        synergy:       data.deck.slots['synergy']?.length       ?? 0,
        lands:         data.deck.slots['lands']?.length         ?? 0,
        flex:          data.deck.slots['flex']?.length          ?? 0,
      },
      avgCmc: data.analysis.averageCmc,
      staplesCoverage: data.analysis.staplesCoveragePercent,
      missingStaples: data.gaps.missingStaples.length,
    };

    return { ...filled, ...score(filled) };
  } catch (e) {
    return { ...base, error: String(e), ...score(base) };
  }
}

function renderTable(results: EvalResult[]) {
  const cols = ['Commander', 'Score', 'Cards', 'Ramp', 'Draw', 'Interact', 'Win', 'Syn', 'Lands', 'CMC', 'Staples%', 'Flags'];
  const rows = results.map(r => [
    r.commander.substring(0, 28),
    r.ok ? String(r.score) : 'ERROR',
    String(r.totalCards),
    String(r.slots.ramp),
    String(r.slots.draw),
    String(r.slots.interaction),
    String(r.slots.winConditions),
    String(r.slots.synergy),
    String(r.slots.lands),
    String(r.avgCmc),
    String(r.staplesCoverage) + '%',
    r.error ? `❌ ${r.error}` : r.flags.length ? r.flags.join(' | ') : '✓',
  ]);

  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => (r[i] ?? '').length)));
  const sep = widths.map(w => '─'.repeat(w + 2)).join('┼');

  const fmt = (row: string[]) => row.map((c, i) => ` ${c.padEnd(widths[i]!)} `).join('│');
  console.log('┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐');
  console.log('│' + fmt(cols) + '│');
  console.log('├' + sep + '┤');
  for (const row of rows) console.log('│' + fmt(row) + '│');
  console.log('└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘');
}

function renderIssues(results: EvalResult[]) {
  console.log('\n── Flags by Commander ──────────────────────────────────────────\n');
  for (const r of results) {
    if (!r.ok) {
      console.log(`  ${r.commander}\n    ❌ ${r.error}\n`);
      continue;
    }
    if (r.flags.length === 0) {
      console.log(`  ${r.commander} [${r.note}]\n    ✓ All checks pass (score ${r.score}/100)\n`);
    } else {
      console.log(`  ${r.commander} [${r.note}] — score ${r.score}/100`);
      for (const f of r.flags) console.log(`    ${f}`);
      console.log();
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const jsonMode = process.argv.includes('--json');

  if (!jsonMode) console.log('\n🧪 MTG Deck Builder — Quality Eval\n');

  const results: EvalResult[] = [];
  for (const { name, note } of TEST_COMMANDERS) {
    if (!jsonMode) process.stdout.write(`  Building: ${name}...`);
    const r = await evalCommander(name, note);
    results.push(r);
    if (!jsonMode) console.log(r.ok ? ` ✓ (score ${r.score})` : ` ❌ ${r.error}`);
    await new Promise(res => setTimeout(res, 400));
  }

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('\n── Summary Table ───────────────────────────────────────────────\n');
    renderTable(results);
    renderIssues(results);
    const passing = results.filter(r => r.ok);
    const avgScore = passing.length
      ? Math.round(passing.reduce((s, r) => s + r.score, 0) / passing.length)
      : 0;
    console.log(`Overall avg score: ${avgScore}/100\n`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
