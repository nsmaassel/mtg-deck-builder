import React from 'react';
import type { BuildDeckResult, Bracket, BracketMethod, Reference } from '../api';
import { DataCredit, POPULARITY_TOOLTIP, popularityLabel } from './DataCredit';

const TOP_PICKS_TOOLTIP = 'Of the cards we would pick for this commander with every card available, the share that is in this deck';
const WIDELY_PLAYED_TOOLTIP =
  "How widely played this deck's spells are across Commander, on average, out of 100 (Scryfall's EDHREC rank). With no Game Changers, tutors or combos to go by, the bracket goes by this.";

interface DeckViewProps {
  result: BuildDeckResult;
  onExplain?: () => void;
  explaining?: boolean;
  explanation?: string;
}

const SLOT_LABELS: Record<string, string> = {
  ramp: '⚡ Ramp',
  draw: '🃏 Card Draw',
  interaction: '🛡️ Interaction',
  winConditions: '🏆 Win Conditions',
  synergy: '✨ Synergy',
  lands: '🏔️ Lands',
  flex: '🔄 Flex',
};

const COLOR_SYMBOLS: Record<string, string> = {
  W: '☀️', U: '💧', B: '💀', R: '🔥', G: '🌲',
};

const BRACKET_COLORS: Record<Bracket, string> = {
  1: '#5a8a5a',  // muted green
  2: '#4a7a9a',  // blue
  3: '#9a8a3a',  // gold
  4: '#9a5a2a',  // orange
  5: '#8a2a2a',  // red/cEDH
};

export function DeckView({ result, onExplain, explaining, explanation }: DeckViewProps) {
  const { deck, analysis, gaps, powerLevel, bracketTuning } = result;

  return (
    <div className="deck-view">
      <div className="deck-header">
        <h2>🎖️ {deck.commander.name}</h2>
        <p className="deck-stats">
          {deck.totalCards} cards · Avg CMC: {analysis.averageCmc.toFixed(1)} ·{' '}
          <span title={TOP_PICKS_TOOLTIP}>Top picks: {analysis.topPicksCoveragePercent.toFixed(0)}%</span>
        </p>
        {analysis.themes.length > 0 && (
          <p className="deck-themes">
            Built around:{' '}
            {analysis.themes.map((theme, i) => (
              <React.Fragment key={theme.slug}>
                {i > 0 && ' · '}
                <span title={`A commander that ${theme.because}`}>{theme.name}</span>
              </React.Fragment>
            ))}
          </p>
        )}
        <div className="color-identity">
          {Object.entries(analysis.colorDistribution).map(([color]) => (
            <span key={color} className={`color-pip color-${color.toLowerCase()}`}>
              {COLOR_SYMBOLS[color] ?? color}
            </span>
          ))}
        </div>
      </div>

      {/* Power Level Badge */}
      <div className="power-level-badge" style={{ borderColor: BRACKET_COLORS[powerLevel.bracket] }}>
        <div className="power-level-header">
          <span className="bracket-label" style={{ color: BRACKET_COLORS[powerLevel.bracket] }}>
            Bracket {powerLevel.bracket} — {powerLevel.label}
          </span>
          <span className="power-score">{powerLevel.score}/10</span>
        </div>

        <div className="power-signals">
          {powerLevel.signals.gameChangers.length > 0 && (
            <span className="signal-chip signal-red" title={powerLevel.signals.gameChangers.join(', ')}>
              ⚡ {powerLevel.signals.gameChangers.length} Game Changer{powerLevel.signals.gameChangers.length > 1 ? 's' : ''}
            </span>
          )}
          {powerLevel.signals.massLandDenial.length > 0 && (
            <span className="signal-chip signal-red" title={powerLevel.signals.massLandDenial.join(', ')}>
              Mass land denial
            </span>
          )}
          {powerLevel.signals.extraTurns.length > 0 && (
            <span className="signal-chip signal-orange" title={powerLevel.signals.extraTurns.join(', ')}>
              {powerLevel.signals.extraTurns.length} extra turn{powerLevel.signals.extraTurns.length > 1 ? 's' : ''}
            </span>
          )}
          {powerLevel.signals.tutors.length > 0 && (
            <span className="signal-chip signal-orange" title={powerLevel.signals.tutors.join(', ')}>
              🔍 {powerLevel.signals.tutors.length} cheap tutor{powerLevel.signals.tutors.length > 1 ? 's' : ''}
            </span>
          )}
          {powerLevel.signals.twoCardComboCount > 0 && (
            <span className="signal-chip signal-red">
              ♾️ {powerLevel.signals.twoCardComboCount} Combo{powerLevel.signals.twoCardComboCount > 1 ? 's' : ''}
            </span>
          )}
          {powerLevel.signals.avgCmc > 0 && (
            <span className="signal-chip signal-neutral">
              CMC {powerLevel.signals.avgCmc.toFixed(1)}
            </span>
          )}
          <span className="signal-chip signal-neutral" title={WIDELY_PLAYED_TOOLTIP}>
            Widely played {powerLevel.signals.averagePopularity}/100
          </span>
        </div>

        <details className="power-explanation">
          <summary>Why this bracket?</summary>
          <ul>
            {(powerLevel.findings ?? powerLevel.explanation.map(text => ({ text, basis: undefined }))).map((finding, i) => (
              <li key={i}>
                {finding.basis && (
                  <span className={`finding-basis finding-${finding.basis}`}>
                    {finding.basis === 'rule' ? 'Bracket rule' : 'Our estimate'}
                  </span>
                )}
                {finding.text}
              </li>
            ))}
          </ul>
        </details>

        {result.bracketMethod && <BracketMethodNote method={result.bracketMethod} />}

        {bracketTuning && (
          <div className="bracket-tuning">
            <strong>
              {bracketTuning.reached === bracketTuning.target
                ? `Built for Bracket ${bracketTuning.target}`
                : `Aimed at Bracket ${bracketTuning.target}; the closest this build gets is Bracket ${bracketTuning.reached}`}
            </strong>
            {bracketTuning.untuned === bracketTuning.target && (
              <p>The best cards for this commander already make a Bracket {bracketTuning.target} deck, so nothing was changed.</p>
            )}
            {bracketTuning.untuned !== bracketTuning.target &&
              bracketTuning.leftOut.length === 0 && bracketTuning.added.length === 0 && !bracketTuning.fewerStaples && (
              <p>
                Without a target this deck is Bracket {bracketTuning.untuned}, and nothing this build may use moves it
                {bracketTuning.untuned < bracketTuning.target ? ' up' : ' down'}.
              </p>
            )}
            {bracketTuning.leftOut.length > 0 && (
              <p className="tuning-left-out">
                Left out: {bracketTuning.leftOut.map((card, i) => (
                  <span key={card.name}>{i > 0 && ', '}<strong>{card.name}</strong> <small>({card.reason})</small></span>
                ))}
              </p>
            )}
            {bracketTuning.added.length > 0 && (
              <p className="tuning-added">
                Put in: {bracketTuning.added.map((card, i) => (
                  <span key={card.name}>{i > 0 && ', '}<strong>{card.name}</strong> <small>({card.reason})</small></span>
                ))}
              </p>
            )}
            {bracketTuning.fewerStaples && (
              <p className="tuning-staples">
                Widely played staples gave way to cards fewer decks play, the ones that do nothing for this commander first.
              </p>
            )}
          </div>
        )}

        {powerLevel.targetBracket !== undefined && powerLevel.targetBracket !== powerLevel.bracket && (
          <div className="target-suggestions">
            {powerLevel.targetSuggestions && powerLevel.targetSuggestions.length > 0 ? (
              <>
                <strong>💡 Suggestions to reach Bracket {powerLevel.targetBracket}:</strong>
                {powerLevel.targetSuggestions.map((swap, i) => (
                  <div key={i} className="swap-suggestion">
                    <div className="swap-remove">
                      ✂️ <strong>{swap.remove}</strong>
                      <span className="swap-reason"> — {swap.removeReason}</span>
                    </div>
                    {swap.alternatives.length > 0 && (
                      <div className="swap-alternatives">
                        <span className="swap-alt-label">↪ Replace with:</span>
                        {swap.alternatives.map(alt => (
                          <span key={alt.name} className="swap-alt-chip">
                            {alt.name}
                            <em title={POPULARITY_TOOLTIP}>{popularityLabel(alt.popularity)}</em>
                            {alt.synergy != null && alt.synergy > 0.1 && (
                              <span className="swap-alt-synergy" title="How well it works with this commander">
                                ⚡{Math.round(alt.synergy * 100)}%
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <p className="no-suggestions-hint">
                💡 Bracket {powerLevel.targetBracket} targeted, but no specific swaps are needed —
                this deck reaches Bracket {powerLevel.bracket} on widely played cards alone, not through
                Game Changers, tutors or combos. Consider replacing its strongest cards manually.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="deck-slots">
        {Object.entries(deck.slots).map(([slotName, cards]) => (
          <section key={slotName} className="slot-section">
            <h3>{SLOT_LABELS[slotName] ?? slotName} ({cards.length})</h3>
            <ul>
              {cards.map((card, i) => (
                <li
                  // Basic lands repeat, so the name alone is not a key.
                  key={`${card.name}-${i}`}
                  className={`card-item${card.ownedInCollection ? '' : ' card-unowned'}`}
                  title={card.reasons.join(' · ')}
                >
                  <span className="card-name">
                    {!card.ownedInCollection && <span className="unowned-dot" title="Not in collection">○</span>}
                    {card.name}
                  </span>
                  <span className="card-meta">CMC {card.cmc}</span>
                  {card.usdPrice != null && (
                    <span className="card-price">${card.usdPrice.toFixed(2)}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {gaps.missingCards.length > 0 && (
        <section className="gaps-section">
          <h3>📋 Cards to Get ({gaps.missingCards.length})</h3>
          <ul>
            {gaps.missingCards.slice(0, 10).map(card => (
              <li key={card.name}>
                <span className="card-name">
                  {card.name}
                  {card.reasons[0] && <small className="card-reason">{card.reasons[0]}</small>}
                </span>
                <span className="card-meta">
                  <span title={POPULARITY_TOOLTIP}>{popularityLabel(card.popularity)}</span> · {card.wouldFillSlot}
                </span>
                {card.usdPrice != null && (
                  <span className="card-price">${card.usdPrice.toFixed(2)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="ai-section">
        <button
          onClick={onExplain}
          disabled={explaining}
          className="explain-btn"
        >
          {explaining ? 'Analyzing...' : '🤖 Explain this deck (AI)'}
        </button>
        {explanation && (
          <div className="explanation">
            <h3>AI Analysis</h3>
            <p>{explanation}</p>
          </div>
        )}
      </div>

      <DataCredit />
    </div>
  );
}

function SourceLink({ source }: { source: Reference }) {
  return <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>;
}

/** How brackets are worked out here, with a link to where each part comes from. The text is the API's, not this page's. */
function BracketMethodNote({ method }: { method: BracketMethod }) {
  return (
    <details className="bracket-method">
      <summary>How brackets are worked out</summary>

      <h4>The brackets, as Wizards of the Coast publishes them</h4>
      <table className="bracket-method-table">
        <tbody>
          {method.official.brackets.map(row => (
            <tr key={row.bracket}>
              <th scope="row">{row.bracket} · {row.label}</th>
              <td>{row.allows}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{method.official.note}</p>
      <p className="bracket-method-sources">
        Read the rules themselves:{' '}
        {method.official.sources.map((source, i) => (
          <React.Fragment key={source.url}>{i > 0 && ' · '}<SourceLink source={source} /></React.Fragment>
        ))}
      </p>

      <h4>What we look at in a deck</h4>
      <ul className="bracket-method-signals">
        {method.signals.map(signal => (
          <li key={signal.name}>
            <span className={`finding-basis finding-${signal.basis}`}>
              {signal.basis === 'rule' ? 'Bracket rule' : 'Our estimate'}
            </span>
            <strong>{signal.name}.</strong> {signal.how}{' '}
            {signal.name === 'Game Changers' && method.gameChangerCount !== undefined && (
              <>There are {method.gameChangerCount} in our card data{method.cardDataDate ? ` of ${method.cardDataDate}` : ''}. </>
            )}
            <SourceLink source={signal.source} />
          </li>
        ))}
      </ul>

      <h4>Where the rules stop and our estimate starts</h4>
      <ul>
        {method.estimate.map((line, i) => <li key={i}>{line}</li>)}
      </ul>

      <h4>What it was checked against</h4>
      <ul>
        {method.checkedAgainst.map((check, i) => (
          <li key={i}>{check.what} <SourceLink source={check.source} /></li>
        ))}
      </ul>
    </details>
  );
}
