import React, { useState, useCallback } from 'react';
import { api } from '../api';
import type { BuildDeckResult, BuildMode, Bracket } from '../api';

interface BuildFormProps {
  onResult: (result: BuildDeckResult) => void;
  onError: (msg: string) => void;
}

const MODE_LABELS: Record<BuildMode, string> = {
  'prefer-owned': '🃏 Prefer Owned — fill gaps with top recommendations',
  'owned-only': '🔒 Owned Only — use strictly what you own',
  'budget': '💰 Budget — owned first, fill with cheap picks',
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
    if (!collectionText.trim() || !commanderName.trim()) {
      onError('Please paste your collection and enter a commander name.');
      return;
    }
    setBuilding(true);
    try {
      const result = await api.buildDeck(
        collectionText,
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
  }, [collectionText, commanderName, mode, budgetMaxPrice, targetBracket, onResult, onError]);

  return (
    <form className="build-form" onSubmit={handleBuild}>
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
          {(Object.keys(MODE_LABELS) as BuildMode[]).map(m => (
            <option key={m} value={m}>{MODE_LABELS[m]}</option>
          ))}
        </select>
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
