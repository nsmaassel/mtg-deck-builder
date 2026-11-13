import { assessPowerLevel, comboBracket } from '@mtg/power-level';
import type { Bracket, ComboResult, PowerLevelResult } from '@mtg/power-level';
import { buildDeck, eligible } from './builder';
import type { Candidate } from './builder';
import type { BracketChange, BracketTuning, BuildDeckInput, BuildDeckResult, DeckCard, DeckList } from './types';

/**
 * Each round changes one card, so this is also the most cards a tuned build
 * can differ by on Game Changers, tutors and combo pieces together.
 */
const MAX_ROUNDS = 40;
/**
 * How far staples are eased off, a step at a time, when nothing else holds
 * the bracket up. Up to 1 only cards that do nothing for the commander lose
 * their standing; past it every card does. See `BuildAdjustments.stapleDiscount`.
 */
const STAPLE_DISCOUNTS = [0.3, 0.6, 1, 1.3, 1.6, 2];

type Kind = 'landDenial' | 'combo' | 'gameChanger' | 'tutor' | 'extraTurn';

interface Step extends BracketChange {
  oracleId: string;
}

interface Attempt {
  result: BuildDeckResult;
  power: PowerLevelResult;
}

const nonCommander = (deck: DeckList): DeckCard[] => Object.values(deck.slots).flat();
/** The card the deck leans on least goes first. */
const leastNeeded = (cards: DeckCard[]): DeckCard | undefined =>
  [...cards].sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))[0];

/**
 * Build a deck and steer it to a bracket.
 *
 * The plain build picks the best cards it may use and lets the bracket fall
 * where it falls. This one then changes a card at a time until the assessment
 * agrees with the target:
 *
 * - Too strong: leave out what the assessment counts against the deck. A
 *   piece of a two-card combo, a Game Changer, a cheap tutor or a land-denial card goes, whichever
 *   lands on the target or gets nearest; when none moves the bracket alone,
 *   they go in that order, as long as leaving them all out would move it.
 *   Bracket 4 allows combos, so there Game Changers and tutors go first.
 *   When none of those holds the deck up and it is still above the target on
 *   how widely played its cards are, staples give way to cards fewer decks
 *   play: first the ones that do nothing for the commander, then the rest.
 * - Too weak: put in Game Changers and tutors the build may use (owned ones
 *   in an owned-only build, affordable ones in a budget build).
 *
 * It stops at the target, or when there is nothing left to change; the result
 * says which, and `powerLevel.targetSuggestions` covers the rest of the way.
 * A deck is never pushed above its target to get nearer to it.
 *
 * `combosOf` finds the combo lines in a deck; without it combos are not seen.
 */
export function buildDeckForBracket(
  input: BuildDeckInput,
  target: Bracket,
  combosOf: (deck: DeckList) => ComboResult[] = () => [],
): BuildDeckResult {
  const exclude = new Set<string>();
  const include = new Set<string>();
  let stapleDiscount = 0;
  const leftOut: BracketChange[] = [];
  const added: BracketChange[] = [];

  const attempt = (extra: { exclude?: string | string[]; include?: string; stapleDiscount?: number } = {}): Attempt => {
    const result = buildDeck(input, {
      exclude: extra.exclude ? new Set([...exclude, ...[extra.exclude].flat()]) : exclude,
      include: extra.include ? new Set([...include, extra.include]) : include,
      stapleDiscount: extra.stapleDiscount ?? stapleDiscount,
    });
    return { result, power: assessPowerLevel(result.deck, result.analysis, target, undefined, combosOf(result.deck)) };
  };

  const ids = new Map(input.recommendations.map(card => [card.name, card.oracleId]));
  let current = attempt();
  const untuned = current.power.bracket;
  const lowering = untuned > target;

  const short = () => (lowering ? current.power.bracket > target : current.power.bracket < target);

  let fewerStaples = false;
  let eased = 0;
  const ease = (): boolean => {
    if (eased === STAPLE_DISCOUNTS.length) return false;
    const from = stapleDiscount;
    stapleDiscount = STAPLE_DISCOUNTS[eased++]!;
    fewerStaples = true;
    let next = attempt();
    // A whole step can drop the deck past its target; halve back towards the last setting to land on it.
    let low = from;
    for (let i = 0; i < 4 && next.power.bracket < target; i++) {
      const middle = (low + stapleDiscount) / 2;
      const tried = attempt({ stapleDiscount: middle });
      if (tried.power.bracket > target) low = middle;
      else {
        stapleDiscount = middle;
        next = tried;
      }
    }
    // The cards that come in may bring a Game Changer or a combo of their own; the next round sees them.
    current = next;
    return true;
  };

  for (let round = 0; round < MAX_ROUNDS && short(); round++) {
    const steps = lowering ? cuts(current, target, ids) : additions(current, target, input, exclude);
    if (steps.length === 0) {
      // Nothing left to name. Either the deck is above its target on how widely played its cards are, and
      // staples can give way; or a rule holds it there through a card that stays (the commander), and
      // easing staples would cost the deck its best cards for nothing.
      const ruleFloor = Math.max(1, ...current.power.findings.filter(finding => finding.basis === 'rule').map(finding => finding.bracket));
      if (!lowering || ruleFloor >= current.power.bracket || !ease()) break;
      continue;
    }

    const tried = steps.map(step => ({ step, next: attempt(lowering ? { exclude: step.oracleId } : { include: step.oracleId }) }));
    const now = current.power.bracket;
    const at = (bracket: Bracket) => tried.find(({ next }) => next.power.bracket === bracket);
    const where = (test: (bracket: Bracket) => boolean) => tried.find(({ next }) => test(next.power.bracket));
    // Best first: on the target, part of the way, then (coming down only) past it. Never above the target:
    // a table that asked for Bracket 2 should not be handed a 3.
    let pick =
      at(target) ??
      where(bracket => (lowering ? bracket < now && bracket > target : bracket > now && bracket < target)) ??
      (lowering ? where(bracket => bracket < target) : undefined);
    if (!pick) {
      // No single change moves the bracket. Several together may (two Game Changers and two tutors), so
      // take the first in line, unless the deck would sit where it is without any of them: then they are
      // not what holds it up, and a tutor should not be left out for nothing.
      if (lowering) {
        const without = buildWithout(input, current, target, ids, attempt);
        if (without.power.bracket >= now) {
          if (!ease()) break;
          continue;
        }
      }
      pick = where(bracket => bracket === now);
    }
    if (!pick) break;
    (lowering ? exclude : include).add(pick.step.oracleId);
    (lowering ? leftOut : added).push({ name: pick.step.name, reason: pick.step.reason });
    current = pick.next;
  }

  const bracketTuning: BracketTuning = {
    target,
    reached: current.power.bracket,
    untuned,
    leftOut,
    added,
    fewerStaples,
  };
  return { ...current.result, powerLevel: current.power, bracketTuning };
}

/** The deck with every card the assessment counts against it left out at once: what cutting them all could achieve. */
function buildWithout(
  input: BuildDeckInput,
  current: Attempt,
  target: Bracket,
  ids: ReadonlyMap<string, string>,
  attempt: (extra: { exclude: string[] }) => Attempt,
): Attempt {
  const { signals } = current.power;
  const names = [
    ...signals.gameChangers,
    ...signals.tutors,
    ...(target < 4 ? [...signals.massLandDenial, ...signals.extraTurns] : []),
    ...signals.combos.filter(line => comboBracket(line) >= 3).flatMap(line => line.uses),
  ].filter(name => name !== input.profile.commander.name && name !== current.result.deck.commander.name);
  return attempt({ exclude: names.flatMap(name => ids.get(name) ?? []) });
}

/** One card to leave out per kind of thing the assessment counts, in the order to try them. */
function cuts({ result, power }: Attempt, target: Bracket, ids: ReadonlyMap<string, string>): Step[] {
  const cards = nonCommander(result.deck);
  const byName = new Map(cards.map(card => [card.name, card]));
  const named = (names: string[]) => names.flatMap(name => byName.get(name) ?? []);

  const options: Partial<Record<Kind, Step>> = {};
  const offer = (kind: Kind, card: DeckCard | undefined, reason: string) => {
    const oracleId = card && ids.get(card.name);
    if (card && oracleId) options[kind] = { oracleId, name: card.name, reason };
  };

  // The combo that most stands in the way: Bracket 3 keeps a slow combo and loses a fast one.
  const combo = [...power.signals.combos]
    .filter(line => comboBracket(line) >= 3 && (target >= 4 || comboBracket(line) > target))
    .sort((a, b) => comboBracket(b) - comboBracket(a))[0];
  if (combo) {
    // The commander stays; the combo goes by losing its other half.
    const piece = leastNeeded(named(combo.uses));
    const partner = combo.uses.find(name => name !== piece?.name);
    offer('combo', piece, partner ? `Part of a combo with ${partner}` : 'Part of a combo');
  }
  offer('gameChanger', leastNeeded(named(power.signals.gameChangers)), 'On the Game Changers list');
  offer('tutor', leastNeeded(named(power.signals.tutors)), 'A cheap tutor that finds any card');
  offer('landDenial', leastNeeded(named(power.signals.massLandDenial)), 'Mass land denial');
  offer('extraTurn', leastNeeded(named(power.signals.extraTurns)), 'Takes an extra turn');

  // Bracket 4 allows combos, land denial and chained turns; only what the target rules out is offered.
  // Below Bracket 4 land denial goes first, then the combo: the brackets as published allow three
  // Game Changers at Bracket 3 and neither of those.
  const order: Kind[] =
    target >= 4 ? ['gameChanger', 'tutor', 'combo'] : ['landDenial', 'combo', 'gameChanger', 'tutor', 'extraTurn'];
  return order.flatMap(kind => options[kind] ?? []);
}

/** The best card of each kind that raises a bracket, among those the build may use and has not played. */
function additions({ result, power }: Attempt, target: Bracket, input: BuildDeckInput, excluded: ReadonlySet<string>): Step[] {
  const { profile, recommendations, owned, options } = input;
  const inDeck = new Set(nonCommander(result.deck).map(card => card.name));
  const pool = eligible(
    recommendations,
    profile.commander.oracleId,
    profile.identity,
    owned,
    options?.mode ?? 'prefer-owned',
    options?.budgetMaxPrice ?? 5,
    { exclude: excluded },
  ).filter(candidate => !inDeck.has(candidate.card.name));

  const best = (test: (candidate: Candidate) => boolean, reason: string): Step[] => {
    const candidate = pool.find(test);
    return candidate ? [{ oracleId: candidate.card.oracleId, name: candidate.card.name, reason }] : [];
  };
  // Up to Bracket 2 nothing the brackets name is allowed, so there is no card to put in: only a
  // wider card pool gets a deck there. From Bracket 3 on the list itself says what counts.
  if (target <= 2) return [];
  return [
    ...best(candidate => candidate.card.gameChanger === true, 'On the Game Changers list'),
    // The estimate counts two cheap tutors; a third changes nothing.
    ...(power.signals.tutors.length < 2
      ? best(candidate => candidate.card.traits?.includes('tutor') === true, 'A cheap tutor that finds any card')
      : []),
  ];
}
