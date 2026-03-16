import React from 'react';
import type { BuildDeckResult, Bracket } from '../api';

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
  const { deck, analysis, gaps, powerLevel } = result;

  return (
    <div className="deck-view">
      <div className="deck-header">
        <h2>🎖️ {deck.commander.name}</h2>
        <p className="deck-stats">
          {deck.totalCards} cards · Avg CMC: {analysis.averageCmc.toFixed(1)} ·
          Staples: {analysis.staplesCoveragePercent.toFixed(0)}%
        </p>
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
          {powerLevel.signals.tierATutors.length > 0 && (
            <span className="signal-chip signal-orange" title={powerLevel.signals.tierATutors.join(', ')}>
              🔍 {powerLevel.signals.tierATutors.length} Tutor{powerLevel.signals.tierATutors.length > 1 ? 's' : ''}
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
          <span className="signal-chip signal-neutral">
            {powerLevel.signals.staplesCoverage}% Staples
          </span>
        </div>

        <details className="power-explanation">
          <summary>Why this bracket?</summary>
          <ul>
            {powerLevel.explanation.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>

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
                          <span key={alt.name} className="swap-alt-chip" title={`${alt.inclusion}% inclusion${alt.synergy != null ? ` · ${Math.round(alt.synergy * 100)}% synergy` : ''}`}>
                            {alt.name}
                            <em>{alt.inclusion}%</em>
                            {alt.synergy != null && alt.synergy > 0.1 && (
                              <span className="swap-alt-synergy">⚡{Math.round(alt.synergy * 100)}%</span>
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
                this deck reaches Bracket {powerLevel.bracket} through staples coverage rather than
                Game Changers or tutors. Consider replacing high-impact staples manually.
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
              {cards.map(card => (
                <li key={card.name} className={`card-item${card.ownedInCollection ? '' : ' card-unowned'}`}>
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

      {gaps.missingStaples.length > 0 && (
        <section className="gaps-section">
          <h3>📋 Missing Staples ({gaps.missingStaples.length})</h3>
          <ul>
            {gaps.missingStaples.slice(0, 10).map(card => (
              <li key={card.name}>
                <span className="card-name">{card.name}</span>
                <span className="card-meta">{card.edhrec_inclusion}% inclusion · {card.wouldFillSlot}</span>
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
    </div>
  );
}
