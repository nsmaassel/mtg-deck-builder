import React, { useState, useCallback } from 'react';
import { BuildForm } from './components/BuildForm';
import { DeckView } from './components/DeckView';
import { api } from './api';
import type { BuildDeckResult } from './api';

export function App() {
  const [result, setResult] = useState<BuildDeckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | undefined>();
  const [explaining, setExplaining] = useState(false);

  const handleResult = useCallback((r: BuildDeckResult) => {
    setResult(r);
    setError(null);
    setExplanation(undefined);
  }, []);

  const handleExplain = useCallback(async () => {
    if (!result) return;
    setExplaining(true);
    try {
      const exp = await api.explainDeck(result.deck, result.deck.commander.name);
      setExplanation(exp.explanation);
    } catch {
      setExplanation('AI explanation unavailable. Check that ANTHROPIC_API_KEY is configured.');
    } finally {
      setExplaining(false);
    }
  }, [result]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>⚔️ MTG Commander Deck Builder</h1>
        <p>Build an optimized Commander deck from your collection using EDHRec data</p>
      </header>

      <main className="app-main">
        {!result ? (
          <BuildForm onResult={handleResult} onError={setError} />
        ) : (
          <div>
            <button
              className="back-btn"
              onClick={() => { setResult(null); setError(null); }}
            >
              ← Build Another Deck
            </button>
            <DeckView
              result={result}
              onExplain={handleExplain}
              explaining={explaining}
              explanation={explanation}
            />
          </div>
        )}

        {error && (
          <div className="error-banner" role="alert">
            ⚠️ {error}
          </div>
        )}
      </main>
    </div>
  );
}
