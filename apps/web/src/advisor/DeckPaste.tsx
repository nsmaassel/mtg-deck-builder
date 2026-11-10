import React, { useState } from 'react';
import type { AdvisorStatus, SavedDeck } from './api';

interface Props {
  formats: AdvisorStatus['formats'];
  savedDecks: SavedDeck[];
  busy: boolean;
  onCheck: (deckText: string, format: string, title?: string) => void;
}

const EXAMPLE = `Deck
4 Slickshot Show-Off
4 Monastery Swiftspear
4 Lightning Strike
…

Sideboard
2 Negate`;

/** Any decklist from anywhere: a site's "copy to Arena" text, an Arena export, or a typed list. */
export function DeckPaste({ formats, savedDecks, busy, onCheck }: Props) {
  const [deckText, setDeckText] = useState('');
  const [format, setFormat] = useState('standard');

  return (
    <div className="deck-paste">
      <form
        onSubmit={e => {
          e.preventDefault();
          if (deckText.trim()) onCheck(deckText, format);
        }}
      >
        <label htmlFor="deck-text" className="field-label">
          Decklist
          <span className="field-hint-inline">Copy any deck “to Arena” on a deck site and paste it here.</span>
        </label>
        <textarea id="deck-text" rows={12} placeholder={EXAMPLE} value={deckText} onChange={e => setDeckText(e.target.value)} />
        <div className="paste-actions">
          <label htmlFor="deck-format" className="field-label">Format</label>
          <select id="deck-format" value={format} onChange={e => setFormat(e.target.value)}>
            {formats.map(f => (
              <option key={f.key} value={f.key}>
                {f.label}{f.onArena ? '' : ' (paper)'}
              </option>
            ))}
          </select>
          <button type="submit" className="btn" disabled={busy || !deckText.trim()}>
            {busy ? 'Checking…' : 'Check this deck'}
          </button>
        </div>
      </form>

      {savedDecks.length > 0 && (
        <div className="saved-decks">
          <h3>Decks saved in your Arena client</h3>
          <ul>
            {savedDecks.map(deck => (
              <li key={deck.id}>
                <button
                  type="button"
                  className="deck-pick"
                  disabled={!deck.format}
                  title={deck.format ? undefined : `Format ${deck.arenaFormat ?? 'unknown'} is not supported`}
                  onClick={() => deck.format && onCheck(deck.deckText, deck.format, deck.name)}
                >
                  <span className="deck-pick-name">{deck.name}</span>
                </button>
                <span className="sub">{deck.arenaFormat ?? 'unknown format'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
