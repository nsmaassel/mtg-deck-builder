import React, { useState, useCallback, useEffect } from 'react';
import { AdvisorPage } from './advisor/AdvisorPage';
import { BuildForm } from './components/BuildForm';
import { DeckView } from './components/DeckView';
import { api } from './api';
import type { BuildDeckResult } from './api';

type View = 'advisor' | 'commander';

const VIEWS: Array<{ id: View; hash: string; label: string }> = [
  { id: 'advisor', hash: '#/advisor', label: 'Deck Advisor' },
  { id: 'commander', hash: '#/commander', label: 'Commander Builder' },
];

function viewFromHash(): View {
  return window.location.hash.startsWith('#/commander') ? 'commander' : 'advisor';
}

function CommanderBuilder() {
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
    <>
      <p className="view-lede">Build an optimized Commander deck from your collection using EDHRec data</p>
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
    </>
  );
}

export function App() {
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>MTG Deck Builder</h1>
        <nav className="app-nav" aria-label="Tools">
          {VIEWS.map(v => (
            <a key={v.id} href={v.hash} className={v.id === view ? 'is-active' : ''} aria-current={v.id === view ? 'page' : undefined}>
              {v.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {view === 'advisor' ? <AdvisorPage /> : <CommanderBuilder />}
      </main>
    </div>
  );
}
