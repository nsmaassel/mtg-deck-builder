import React, { useState, useCallback } from 'react';
import { api } from '../api';
import type { BuildDeckResult } from '../api';

interface BuildFormProps {
  onResult: (result: BuildDeckResult) => void;
  onError: (msg: string) => void;
}

export function BuildForm({ onResult, onError }: BuildFormProps) {
  const [collectionText, setCollectionText] = useState('');
  const [commanderName, setCommanderName] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const [searching, setSearching] = useState(false);

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
      const result = await api.buildDeck(collectionText, commanderName);
      setSuggestions([]);
      onResult(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Build failed');
    } finally {
      setBuilding(false);
    }
  }, [collectionText, commanderName, onResult, onError]);

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

      <button type="submit" disabled={building} className="build-btn">
        {building ? 'Building deck...' : '⚔️ Build Deck'}
      </button>
    </form>
  );
}
