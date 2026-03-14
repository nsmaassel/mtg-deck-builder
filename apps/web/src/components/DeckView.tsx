import React from 'react';
import type { BuildDeckResult } from '../api';

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

export function DeckView({ result, onExplain, explaining, explanation }: DeckViewProps) {
  const { deck, analysis, gaps } = result;

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

      <div className="deck-slots">
        {Object.entries(deck.slots).map(([slotName, cards]) => (
          <section key={slotName} className="slot-section">
            <h3>{SLOT_LABELS[slotName] ?? slotName} ({cards.length})</h3>
            <ul>
              {cards.map(card => (
                <li key={card.name} className="card-item">
                  <span className="card-name">{card.name}</span>
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
