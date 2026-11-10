import React, { useCallback, useEffect, useRef, useState } from 'react';
import { advisorApi, describeError } from './api';
import type {
  AdvisorStatus,
  ArchetypeCheck,
  CraftMode,
  DeckCheck,
  MetaView,
  SavedDeck,
  StoredCollection,
} from './api';
import { CollectionPanel } from './CollectionPanel';
import { DeckCheckView } from './DeckCheckView';
import { DeckPaste } from './DeckPaste';
import { MetaBrowser } from './MetaBrowser';
import { loadCollection, saveCollection } from './storage';

type Selection =
  | { kind: 'meta'; format: string; archetypeId: string; list: number }
  | { kind: 'paste'; format: string; deckText: string; title?: string };

interface Result {
  check: DeckCheck;
  context?: ArchetypeCheck;
}

/** Wait this long after the last wildcard keystroke before asking the server again. */
const RECHECK_DELAY_MS = 400;

interface Props {
  /** Overridable so tests do not wait on the debounce. */
  recheckDelayMs?: number;
}

const FORMAT_LABELS: Record<string, string> = { standard: 'Standard', pioneer: 'Pioneer', modern: 'Modern' };

export function AdvisorPage({ recheckDelayMs = RECHECK_DELAY_MS }: Props = {}) {
  const [status, setStatus] = useState<AdvisorStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [collection, setCollection] = useState<StoredCollection | null>(() => loadCollection());
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [tab, setTab] = useState<'meta' | 'paste'>('meta');
  const [metaFormat, setMetaFormat] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaView | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [craft, setCraft] = useState<CraftMode>('inventory');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    advisorApi.status()
      .then(s => {
        setStatus(s);
        setMetaFormat(s.meta[0]?.format ?? null);
        if (s.meta.length === 0) setTab('paste');
      })
      .catch(err => setStatusError(describeError(err)));
  }, []);

  const updateCollection = useCallback((next: StoredCollection | null) => {
    setCollection(next);
    saveCollection(next);
  }, []);

  // The meta list is re-sorted against the collection whenever either changes.
  useEffect(() => {
    if (!metaFormat) return;
    let stale = false;
    const timer = setTimeout(() => {
      advisorApi.meta(metaFormat, collection)
        .then(view => { if (!stale) setMeta(view); })
        .catch(err => { if (!stale) setError(describeError(err)); });
    }, recheckDelayMs);
    return () => { stale = true; clearTimeout(timer); };
  }, [metaFormat, collection, recheckDelayMs]);

  useEffect(() => {
    if (!selection) return;
    let stale = false;
    setBusy(true);
    setError(null);
    const timer = setTimeout(() => {
      const request: Promise<Result> = selection.kind === 'meta'
        ? advisorApi.checkArchetype(selection.format, selection.archetypeId, selection.list, collection, craft)
            .then(context => ({ check: context.check, context }))
        : advisorApi.checkDeck(selection.deckText, selection.format, collection, craft)
            .then(check => ({ check: selection.title && !check.deckName ? { ...check, deckName: selection.title } : check }));
      request
        .then(next => { if (!stale) setResult(next); })
        .catch(err => { if (!stale) { setError(describeError(err)); setResult(null); } })
        .finally(() => { if (!stale) setBusy(false); });
    }, recheckDelayMs);
    return () => { stale = true; clearTimeout(timer); };
  }, [selection, collection, craft, recheckDelayMs]);

  const select = (next: Selection) => {
    setSelection(next);
    setResult(null);
    // Bring the answer into view; on a phone it would otherwise open below the fold.
    setTimeout(() => resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0);
  };

  if (statusError) {
    return <p className="error-banner" role="alert">The deck advisor could not be reached: {statusError}</p>;
  }
  if (!status) return <p className="loading">Loading the card pool…</p>;
  if (!status.ready) {
    return (
      <p className="error-banner" role="alert">
        The deck advisor has no card data on this server yet. Run <code>pnpm data:cards</code> and restart the API.
      </p>
    );
  }

  const sources = status.meta.find(m => m.format === metaFormat)?.sources ?? [];

  return (
    <div className="advisor">
      <section className="advisor-intro">
        <h2>Play the top decks with the cards you have</h2>
        <p>
          Pick a deck from the tournament meta or paste any list. See how much of it you own, what the rest costs in
          wildcards, and the closest cards in your collection for everything you are missing.
        </p>
      </section>

      <CollectionPanel collection={collection} onChange={updateCollection} onSavedDecks={setSavedDecks} />

      <section className="panel" aria-labelledby="deck-heading">
        <div className="panel-head">
          <h2 id="deck-heading">Pick a deck</h2>
          <div className="tabs" role="tablist" aria-label="Where the deck comes from">
            <button type="button" role="tab" aria-selected={tab === 'meta'} className={tab === 'meta' ? 'is-active' : ''} onClick={() => setTab('meta')} disabled={status.meta.length === 0}>
              Meta decks
            </button>
            <button type="button" role="tab" aria-selected={tab === 'paste'} className={tab === 'paste' ? 'is-active' : ''} onClick={() => setTab('paste')}>
              Paste a list{savedDecks.length > 0 ? ` · ${savedDecks.length} saved` : ''}
            </button>
          </div>
        </div>

        {tab === 'meta' && (
          <>
            {status.meta.length > 1 && (
              <div className="format-picker" role="group" aria-label="Format">
                {status.meta.map(m => (
                  <button key={m.format} type="button" className={m.format === metaFormat ? 'is-active' : ''} onClick={() => { setMetaFormat(m.format); setMeta(null); }}>
                    {FORMAT_LABELS[m.format] ?? m.format}
                  </button>
                ))}
              </div>
            )}
            {meta && meta.format === metaFormat ? (
              <MetaBrowser
                meta={meta}
                hasCollection={collection !== null}
                hasWildcards={collection?.wildcards !== undefined}
                onPick={archetype => select({ kind: 'meta', format: meta.format, archetypeId: archetype.id, list: 0 })}
              />
            ) : (
              <p className="loading">Loading the meta…</p>
            )}
            <p className="meta-footnote">
              Historic, Timeless, Alchemy and Brawl have no open tournament data. For those, paste a list.
            </p>
          </>
        )}

        {tab === 'paste' && (
          <DeckPaste
            formats={status.formats}
            savedDecks={savedDecks}
            busy={busy}
            onCheck={(deckText, format, title) => select({ kind: 'paste', deckText, format, title })}
          />
        )}
      </section>

      <div ref={resultRef}>
        {error && <p className="error-banner" role="alert">{error}</p>}
        {selection && !result && !error && <p className="loading">Checking the deck against your collection…</p>}
        {result && (
          <section className="panel">
            <DeckCheckView
              check={result.check}
              context={result.context}
              hasCollection={collection !== null}
              craft={craft}
              onCraftChange={setCraft}
              activeList={selection?.kind === 'meta' ? selection.list : 0}
              onPickList={selection?.kind === 'meta' ? list => setSelection({ ...selection, list }) : undefined}
              busy={busy}
            />
          </section>
        )}
      </div>

      <footer className="attribution">
        <p>
          Card data and functional tags from <a href="https://scryfall.com" target="_blank" rel="noreferrer">Scryfall</a>
          {status.cards?.sourceUpdatedAt && ` (${status.cards.sourceUpdatedAt.slice(0, 10)})`}.
          {sources.map(source => (
            <React.Fragment key={source.url}>
              {' '}<a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>: {source.note}
            </React.Fragment>
          ))}
        </p>
        <p>
          Not affiliated with Wizards of the Coast. Your collection stays in this browser; the server keeps nothing between requests.
        </p>
      </footer>
    </div>
  );
}
