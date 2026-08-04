import React, { useState, useCallback } from 'react';
import { api } from '../api';
import type { BuildDeckResult, BuildMode, Bracket } from '../api';

interface BuildFormProps {
  onResult: (result: BuildDeckResult) => void;
  onError: (msg: string) => void;
}

const MODE_LABELS: Record<BuildMode, string> = {
  'prefer-owned': '🃏 Balanced — top recommendations, use your cards when possible',
  'owned-only': '🔒 Only My Cards — use strictly what you own (needs a collection)',
  'budget': '💰 Budget — fill gaps with cheap picks under a price cap',
};

const BRACKET_OPTIONS: Array<{ value: Bracket; label: string }> = [
  { value: 1, label: '1 — Exhibition (kitchen table, precon-lite)' },
  { value: 2, label: '2 — Core (precon-level, few staples)' },
  { value: 3, label: '3 — Enhanced (optimized synergies, some staples)' },
  { value: 4, label: '4 — Optimized (tuned, efficient, may combo)' },
  { value: 5, label: '5 — cEDH (competitive, turn-3 wins)' },
];

export function BuildForm({ onResult, onError }: BuildFormProps) {
  const [collectionText, setCollectionText] = useState('');
  const [commanderName, setCommanderName] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<BuildMode>('prefer-owned');
  const [budgetMaxPrice, setBudgetMaxPrice] = useState(5);
  const [targetBracket, setTargetBracket] = useState<Bracket | undefined>(undefined);
  const [skipCollection, setSkipCollection] = useState(false);

  const handleCommanderSearch = useCallback(async (query: string) => {
    setCommanderName(query);
    if (query.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const result = await api.searchCommanders(query);
      setSuggestions(result.commanders.map(c => c.name));
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleBuild = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    // When skipCollection is true, collection is not required
    if (!skipCollection && !collectionText.trim()) {
      onError('Please paste your collection or select "I\'m new to Commander / Skip collection".');
      return;
    }
    if (!commanderName.trim()) {
      onError('Please enter a commander name.');
      return;
    }
    setBuilding(true);
    try {
      const result = await api.buildDeck(
        skipCollection ? '' : collectionText,
        commanderName,
        mode,
        mode === 'budget' ? budgetMaxPrice : undefined,
        targetBracket,
      );
      setSuggestions([]);
      onResult(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Build failed');
    } finally {
      setBuilding(false);
    }
  }, [collectionText, commanderName, mode, budgetMaxPrice, targetBracket, skipCollection, onResult, onError]);

  // "I'm new / Skip collection" cannot be combined with owned-only mode, which
  // requires a collection to draw from. Switching it on forces a usable mode.
  const handleSkipChange = useCallback((checked: boolean) => {
    setSkipCollection(checked);
    if (checked && mode === 'owned-only') {
      setMode('prefer-owned');
    }
  }, [mode]);

  const availableModes = (Object.keys(MODE_LABELS) as BuildMode[])
    .filter(m => !skipCollection || m !== 'owned-only');

  return (
    <form className="build-form" onSubmit={handleBuild}>
      <section className="onboarding-guide" aria-label="How it works">
        <h2>How it works</h2>
        <ol className="guide-steps">
          <li><strong>Choose your commander</strong> — any legendary creature. Not sure? Search and pick from suggestions.</li>
          <li><strong>Tell us what you own</strong> — paste your MTG Arena collection export. <em>Or</em> check <em>"I'm new to Commander"</em> and we'll build from the best community recommendations, no collection needed.</li>
          <li><strong>Get a full 100-card deck</strong> — with a power level score (Bracket 1–5), missing-staple shopping list, and optional AI walkthrough.</li>
        </ol>
      </section>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={skipCollection}
            onChange={e => handleSkipChange(e.target.checked)}
          />
          <span>I'm new to Commander / Skip collection</span>
        </label>
        <small className="form-hint">Build a deck purely from EDHRec recommendations — no MTG Arena export needed.</small>
      </div>

      {!skipCollection && (
        <div className="form-group">
          <label htmlFor="collection">MTG Arena Collection Export</label>
          <textarea
            id="collection"
            placeholder="Paste your Arena collection export here..."
            value={collectionText}
            onChange={e => setCollectionText(e.target.value)}
            rows={8}
          />
        </div>
      )}

      <div className="form-group commander-group">
        <label htmlFor="commander">Commander Name</label>
        <input
          id="commander"
          type="text"
          placeholder="e.g. Atraxa, Praetors' Voice"
          value={commanderName}
          onChange={e => handleCommanderSearch(e.target.value)}
          autoComplete="off"
        />
        {searching && <span className="searching">Searching...</span>}
        {suggestions.length > 0 && (
          <ul className="suggestions">
            {suggestions.map(name => (
              <li
                key={name}
                onClick={() => { setCommanderName(name); setSuggestions([]); }}
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="mode">Build Mode</label>
        <select
          id="mode"
          value={mode}
          onChange={e => setMode(e.target.value as BuildMode)}
          className="mode-select"
        >
          {availableModes.map(m => (
            <option key={m} value={m}>{MODE_LABELS[m]}</option>
          ))}
        </select>
        {skipCollection && (
          <small className="form-hint">"Only My Cards" is hidden when you skip your collection — there'd be nothing to build from.</small>
        )}
      </div>

      {mode === 'budget' && (
        <div className="form-group budget-group">
          <label htmlFor="budget-price">Max price per unowned card (USD)</label>
          <div className="budget-input">
            <span className="currency">$</span>
            <input
              id="budget-price"
              type="number"
              min={0}
              max={500}
              step={0.5}
              value={budgetMaxPrice}
              onChange={e => setBudgetMaxPrice(parseFloat(e.target.value) || 0)}
            />
          </div>
          <small>Only recommends unowned cards at or below this price.</small>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="target-bracket">Target Power Level <span className="label-hint">(optional)</span></label>
        <select
          id="target-bracket"
          value={targetBracket ?? ''}
          onChange={e => setTargetBracket(e.target.value ? Number(e.target.value) as Bracket : undefined)}
          className="mode-select"
        >
          <option value="">— No target (score only) —</option>
          {BRACKET_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <small className="form-hint">Get suggestions for reaching this bracket after the build.</small>
      </div>

      <button type="submit" disabled={building} className="build-btn">
        {building ? 'Building deck...' : '⚔️ Build Deck'}
      </button>
    </form>
  );
}
