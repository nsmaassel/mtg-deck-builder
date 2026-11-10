import React, { useRef, useState } from 'react';
import { shrinkPlayerLog } from '@mtg/collection';
import { advisorApi, describeError } from './api';
import type { ImportResult, SampleProfile, SavedDeck, StoredCollection, Wildcards } from './api';

const PROFILES: Array<{ id: SampleProfile; label: string; hint: string }> = [
  { id: 'newcomer', label: 'Newcomer', hint: 'a few months of free play' },
  { id: 'regular', label: 'Regular', hint: 'a year of steady play' },
  { id: 'veteran', label: 'Veteran', hint: 'years of play' },
];

const WILDCARD_FIELDS: Array<keyof Wildcards> = ['common', 'uncommon', 'rare', 'mythic'];

interface Props {
  collection: StoredCollection | null;
  onChange: (collection: StoredCollection | null) => void;
  onSavedDecks: (decks: SavedDeck[]) => void;
}

/** Player.log files run to tens of megabytes; only the login snapshot is worth sending. */
async function readInput(file: File): Promise<string> {
  const text = await file.text();
  return /\.log$/i.test(file.name) || text.includes('[UnityCrossThreadLogger]') ? shrinkPlayerLog(text) : text;
}

function describeImport(result: ImportResult): string {
  const kinds: Record<string, string> = {
    'arena-text': 'card list',
    'grpid-json': 'tracker export',
    'named-json': 'tracker export',
    csv: 'spreadsheet',
    'player-log': 'Player.log',
  };
  return [...new Set(result.formats.map(f => kinds[f] ?? f))].join(' + ');
}

export function CollectionPanel({ collection, onChange, onSavedDecks }: Props) {
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const loadSample = (profile: SampleProfile) =>
    run(async () => {
      const sample = await advisorApi.sample(profile);
      setNotes([]);
      onSavedDecks([]);
      onChange({
        ...sample.collection,
        label: `Sample collection: ${sample.label}`,
        totalCards: sample.totalCards,
        uniqueCards: sample.uniqueCards,
        sample: true,
      });
      setImporting(false);
    });

  const importTexts = (texts: string[]) =>
    run(async () => {
      const result = await advisorApi.importCollection(texts);
      const messages = [...result.warnings];
      if (result.unresolved.count > 0) {
        messages.push(
          `${result.unresolved.count} entr${result.unresolved.count === 1 ? 'y' : 'ies'} matched no card: ${result.unresolved.sample.slice(0, 5).join(', ')}${result.unresolved.count > 5 ? '…' : ''}`,
        );
      }
      setNotes(messages);
      onSavedDecks(result.decks);

      // A Player.log carries wildcards and decks but no cards: keep the cards already loaded.
      const hasCards = result.uniqueCards > 0;
      const base = hasCards ? null : collection;
      onChange({
        cards: hasCards ? result.collection.cards : (base?.cards ?? {}),
        wildcards: result.collection.wildcards ?? base?.wildcards,
        label: hasCards ? `Your collection (${describeImport(result)})` : (base?.label ?? 'Wildcards only'),
        totalCards: hasCards ? result.totalCards : (base?.totalCards ?? 0),
        uniqueCards: hasCards ? result.uniqueCards : (base?.uniqueCards ?? 0),
        sample: hasCards ? false : (base?.sample ?? false),
      });
      setPasted('');
      setImporting(false);
    });

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const texts = await Promise.all([...files].slice(0, 4).map(readInput));
    await importTexts(texts);
    if (fileInput.current) fileInput.current.value = '';
  };

  const setWildcard = (rarity: keyof Wildcards, value: string) => {
    if (!collection) return;
    const count = Math.max(0, Math.min(9999, Number.parseInt(value, 10) || 0));
    const wildcards: Wildcards = { common: 0, uncommon: 0, rare: 0, mythic: 0, ...collection.wildcards, [rarity]: count };
    onChange({ ...collection, wildcards });
  };

  const showImport = !collection || importing;

  return (
    <section className="panel collection-panel" aria-labelledby="collection-heading">
      <div className="panel-head">
        <h2 id="collection-heading">Your collection</h2>
        {collection && !importing && (
          <div className="panel-actions">
            <button type="button" className="btn-quiet" onClick={() => setImporting(true)}>Replace</button>
            <button type="button" className="btn-quiet" onClick={() => { onChange(null); onSavedDecks([]); setNotes([]); }}>Clear</button>
          </div>
        )}
      </div>

      {collection && !importing && (
        <div className="collection-summary">
          <p className="collection-label">
            {collection.label}
            {collection.sample && <span className="tag tag-sample">made-up data</span>}
          </p>
          <p className="collection-counts">
            <strong>{collection.uniqueCards.toLocaleString()}</strong> different cards
            <span className="sep">·</span>
            <strong>{collection.totalCards.toLocaleString()}</strong> copies
          </p>
          <fieldset className="wildcard-editor">
            <legend>Wildcards to spend</legend>
            {WILDCARD_FIELDS.map(rarity => (
              <label key={rarity} className={`wc-input wc-${rarity}`}>
                <span className="wc-gem" aria-hidden="true" />
                <span className="wc-input-name">{rarity}</span>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  inputMode="numeric"
                  value={collection.wildcards?.[rarity] ?? 0}
                  onChange={e => setWildcard(rarity, e.target.value)}
                />
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {showImport && (
        <div className="import">
          {!collection && (
            <p className="lede">
              Load the cards you own and every deck is measured against them: what you already have,
              what is missing, and what you could play instead.
            </p>
          )}

          <div className="import-grid">
            <div className="import-option">
              <h3>Use your own</h3>
              <label htmlFor="collection-paste" className="field-label">
                Paste a collection export
              </label>
              <textarea
                id="collection-paste"
                rows={5}
                placeholder={'4 Lightning Strike (FDN) 199\n2 Steam Vents (EOE) 267\n…or tracker JSON, or CSV'}
                value={pasted}
                onChange={e => setPasted(e.target.value)}
              />
              <div className="import-actions">
                <button type="button" className="btn" disabled={busy || !pasted.trim()} onClick={() => importTexts([pasted])}>
                  {busy ? 'Reading…' : 'Import'}
                </button>
                <label className="btn btn-secondary file-btn">
                  Choose files
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept=".txt,.csv,.json,.log,text/plain,text/csv,application/json"
                    onChange={e => void onFiles(e.target.files)}
                  />
                </label>
              </div>
              <details className="howto">
                <summary>How do I get my collection out of Arena?</summary>
                <p>
                  Arena has no collection export, and its log file stopped listing your cards in 2021.
                  Trackers read them from the running game instead. Any of these work here:
                </p>
                <ul>
                  <li><strong>Untapped.gg Premium:</strong> its “Export Collection to CSV” feature.</li>
                  <li>
                    <strong>A collection exporter</strong> such as MTGA Deck Advisor, MTG Arena Tool or
                    mtga-tracker-daemon: upload its JSON, CSV or text file.
                  </li>
                  <li>
                    <strong>Player.log</strong> adds your wildcards and saved decks (not your cards). Turn on
                    Options → Account → Detailed Logs, restart Arena, then choose
                    <code>%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log</code>. Only the
                    login snapshot leaves your browser.
                  </li>
                </ul>
              </details>
            </div>

            <div className="import-option">
              <h3>Or try a made-up one</h3>
              <p className="field-hint">No export to hand? Pick a typical collection of Standard and Pioneer cards.</p>
              <div className="profile-buttons">
                {PROFILES.map(profile => (
                  <button key={profile.id} type="button" className="btn btn-secondary profile-btn" disabled={busy} onClick={() => loadSample(profile.id)}>
                    <span>{profile.label}</span>
                    <small>{profile.hint}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {importing && (
            <button type="button" className="btn-quiet" onClick={() => setImporting(false)}>Cancel</button>
          )}
        </div>
      )}

      {error && <p className="inline-error" role="alert">{error}</p>}
      {notes.length > 0 && (
        <ul className="import-notes">
          {notes.map((note, i) => <li key={i}>{note}</li>)}
        </ul>
      )}
      {collection && !importing && !collection.wildcards && (
        <p className="field-hint">
          No wildcard counts yet. Enter them above, or add your Player.log, to see which decks you can craft today.
        </p>
      )}
    </section>
  );
}
