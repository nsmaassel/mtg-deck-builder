import React, { useState } from 'react';
import type { ArchetypeCheck, CraftMode, DeckCardView, DeckCheck, PlanStepView, SubstituteView } from './api';
import { CardLink, ManaCost, Meter, RarityDot, WildcardRow, percent } from './bits';

interface Props {
  check: DeckCheck;
  /** Present when the deck came from the meta: its other lists and where this one was played. */
  context?: ArchetypeCheck;
  hasCollection: boolean;
  craft: CraftMode;
  onCraftChange: (mode: CraftMode) => void;
  onPickList?: (list: number) => void;
  activeList?: number;
  busy: boolean;
}

const BOARD_TITLES: Record<string, string> = {
  commander: 'Commander',
  companion: 'Companion',
  main: 'Main deck',
  sideboard: 'Sideboard',
};

const STATUS_NOTES: Record<string, string> = {
  'not-on-arena': 'Not on Arena',
  'not-legal': 'Not legal in this format',
  unknown: 'Card not recognised',
};

const QUALITY_LABEL: Record<string, string> = { close: 'Close match', partial: 'Partial match', weak: 'Stopgap' };

function SubstituteRow({ substitute }: { substitute: SubstituteView }) {
  return (
    <li className={`sub-row sub-${substitute.quality}`}>
      <div className="sub-main">
        <span className={`quality quality-${substitute.quality}`}>{QUALITY_LABEL[substitute.quality]}</span>
        <CardLink name={substitute.card.name} />
        <ManaCost cost={substitute.card.manaCost} />
        <span className="sub-source">
          {substitute.source === 'owned' ? (
            `you own ${substitute.available >= 4 ? 'a playset' : substitute.available}`
          ) : (
            <>
              craft <RarityDot rarity={substitute.craftRarity} />
            </>
          )}
        </span>
      </div>
      <p className="sub-reasons">{substitute.reasons.join(' · ')}</p>
    </li>
  );
}

function CardRow({ card }: { card: DeckCardView }) {
  const [open, setOpen] = useState(false);
  const complete = card.missing === 0;
  const note = STATUS_NOTES[card.status];
  const canExpand = card.substitutes.length > 0;

  return (
    <li className={`deck-card ${complete ? 'is-owned' : 'is-missing'}`}>
      <div className="deck-card-line">
        <span className="deck-card-count">{card.needed}</span>
        <span className="deck-card-name">
          <CardLink name={card.name} />
          {card.card && <ManaCost cost={card.card.manaCost} />}
        </span>
        {complete ? (
          <span className="own-mark" title="You own every copy"><span className="sr-only">owned</span></span>
        ) : (
          <span className="missing-mark">
            {note ?? (
              <>
                missing {card.missing} <RarityDot rarity={card.craftRarity} />
              </>
            )}
          </span>
        )}
      </div>
      {!complete && canExpand && (
        <>
          <button type="button" className="sub-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Show'} {card.substitutes.length} stand-in{card.substitutes.length === 1 ? '' : 's'}
          </button>
          {open && (
            <ul className="sub-list">
              {card.substitutes.map(s => <SubstituteRow key={`${s.source}:${s.card.oracleId}`} substitute={s} />)}
            </ul>
          )}
        </>
      )}
      {!complete && !canExpand && card.board !== 'commander' && !note && (
        <p className="no-subs">Nothing in your collection does this job in these colours.</p>
      )}
    </li>
  );
}

function StepRow({ step }: { step: PlanStepView }) {
  if (step.action === 'craft') {
    return (
      <li className="step step-craft">
        <span className="step-verb">Craft</span>
        <span className="step-body">
          {step.count}× <CardLink name={step.target} /> <RarityDot rarity={step.craftRarity} />
          <span className="step-note">{step.note}</span>
        </span>
      </li>
    );
  }
  if (step.action === 'substitute' && step.substitute) {
    return (
      <li className={`step step-swap sub-${step.substitute.quality}`}>
        <span className="step-verb">Swap</span>
        <span className="step-body">
          {step.count}× <CardLink name={step.target} /> <span className="arrow" aria-label="for">→</span>{' '}
          <CardLink name={step.substitute.card.name} />
          <span className={`quality quality-${step.substitute.quality}`}>{QUALITY_LABEL[step.substitute.quality]}</span>
          <span className="step-note">{step.substitute.reasons.join(' · ')}</span>
        </span>
      </li>
    );
  }
  return (
    <li className="step step-open">
      <span className="step-verb">Open</span>
      <span className="step-body">
        {step.count}× <CardLink name={step.target} />
        <span className="step-note">{step.note}</span>
      </span>
    </li>
  );
}

export function DeckCheckView({ check, context, hasCollection, craft, onCraftChange, onPickList, activeList = 0, busy }: Props) {
  const [copied, setCopied] = useState(false);
  const { summary, plan } = check;
  const complete = summary.ownedCards === summary.totalCards;
  const boards = ['commander', 'companion', 'main', 'sideboard'].filter(b => check.cards.some(c => c.board === b));
  const missingCount = check.cards.filter(c => c.missing > 0).length;
  const hasWildcards = plan.wildcardsLeft !== undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plan.arenaText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`deck-check ${busy ? 'is-busy' : ''}`}>
      <header className="check-head">
        <div>
          <h2>{check.deckName ?? check.archetype ?? 'Your decklist'}</h2>
          <p className="check-sub">
            {check.format}
            {context && (
              <>
                {' · '}
                <a href={context.list.uri} target="_blank" rel="noreferrer">
                  {context.list.player}, {context.list.result}
                </a>{' '}
                at {context.list.event} ({context.list.date})
              </>
            )}
          </p>
        </div>
        <dl className="check-stats">
          <div>
            <dt>You own</dt>
            <dd>
              {percent(summary.completion)}
              <Meter value={summary.completion} label="Cards owned" />
              <span className="sub">{summary.ownedCards} of {summary.totalCards} cards</span>
            </dd>
          </div>
          <div>
            <dt>To build it exactly</dt>
            <dd>
              <WildcardRow wildcards={summary.wildcardsNeeded} empty={complete ? 'Nothing' : 'No crafts possible'} />
              {summary.craftable === true && !complete && <span className="tag tag-good">Craftable now</span>}
              {summary.wildcardsShort && summary.craftable === false && (
                <span className="sub">short <WildcardRow wildcards={summary.wildcardsShort} /></span>
              )}
            </dd>
          </div>
          {!complete && (
            <div>
              <dt>Playable today</dt>
              <dd>
                {percent(plan.fidelity)}
                <span className="sub">of the original, after swaps</span>
              </dd>
            </div>
          )}
        </dl>
      </header>

      {context && context.archetype.lists.length > 1 && onPickList && (
        <nav className="list-picker" aria-label="Other lists of this deck">
          <span>Lists:</span>
          {context.archetype.lists.map((list, i) => (
            <button key={list.uri} type="button" className={i === activeList ? 'is-active' : ''} onClick={() => onPickList(i)}>
              {list.player} <small>{list.result}</small>
            </button>
          ))}
        </nav>
      )}

      {!hasCollection && (
        <p className="notice">
          No collection loaded, so every card counts as missing. Load one above to see what you own and what could stand in.
        </p>
      )}

      <div className="check-body">
        <section className="check-list" aria-label="Decklist">
          {boards.map(board => (
            <div key={board} className="board">
              <h3>
                {BOARD_TITLES[board]}{' '}
                <span className="board-count">
                  {check.cards.filter(c => c.board === board).reduce((n, c) => n + c.needed, 0)}
                </span>
              </h3>
              <ul>
                {check.cards.filter(c => c.board === board).map(card => (
                  <CardRow key={`${board}:${card.name}`} card={card} />
                ))}
              </ul>
            </div>
          ))}
          {check.unrecognizedLines.length > 0 && (
            <p className="notice">Lines that could not be read: {check.unrecognizedLines.slice(0, 5).join(' / ')}</p>
          )}
        </section>

        <aside className="check-plan" aria-label="A version you can build">
          <h3>{complete ? 'You can build this deck' : 'A version you can build today'}</h3>
          {!complete && (
            <>
              <p className="plan-lede">
                {missingCount} card{missingCount === 1 ? ' is' : 's are'} short. Each is crafted where a wildcard
                matters most, or swapped for the closest card you own.
              </p>
              {hasWildcards && (
                <fieldset className="craft-toggle">
                  <legend className="sr-only">Wildcards</legend>
                  <label>
                    <input type="radio" name="craft" checked={craft === 'inventory'} onChange={() => onCraftChange('inventory')} />
                    Spend my wildcards
                  </label>
                  <label>
                    <input type="radio" name="craft" checked={craft === 'none'} onChange={() => onCraftChange('none')} />
                    Keep them, swaps only
                  </label>
                </fieldset>
              )}
              <ol className="steps">
                {plan.steps.map((step, i) => <StepRow key={i} step={step} />)}
              </ol>
              {hasWildcards && (
                <p className="plan-wildcards">
                  Spends <WildcardRow wildcards={plan.wildcardsSpent} empty="no wildcards" />
                  {plan.wildcardsLeft && <> · leaves <WildcardRow wildcards={plan.wildcardsLeft} empty="none" /></>}
                </p>
              )}
            </>
          )}
          <div className="export">
            <button type="button" className="btn" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy for Arena import'}
            </button>
            <details>
              <summary>Show the list</summary>
              <pre className="arena-text">{plan.arenaText}</pre>
            </details>
          </div>
        </aside>
      </div>
    </div>
  );
}
