import React, { useEffect, useState } from 'react';
import { advisorApi, describeError } from './api';
import type { CollectionCombos, ComboCompleterView, ComboView, DeckCombos, StoredCollection } from './api';
import { CardLink, RarityDot } from './bits';

const SPELLBOOK = 'https://commanderspellbook.com';

/** Where combos are most worth looking for first: the Arena formats with the deepest card pools. */
const PREFERRED_FORMATS = ['historic', 'brawl', 'timeless', 'pioneer', 'standard'];

function ComboLine({ combo }: { combo: ComboView }) {
  return (
    <>
      <span className="combo-cards">
        {combo.cards.map((card, i) => (
          <React.Fragment key={card.oracleId}>
            {i > 0 && <span className="combo-plus" aria-hidden="true"> + </span>}
            <CardLink name={card.name} />
          </React.Fragment>
        ))}
      </span>{' '}
      <span className="combo-does">
        {combo.produces.join(' · ')}
        {combo.moreResults > 0 && ` · and ${combo.moreResults} more`}
      </span>{' '}
      {combo.alsoNeeds.length > 0 && <span className="combo-needs">Also needs: {combo.alsoNeeds.join(', ')}</span>}{' '}
      <span className="combo-meta">
        in {combo.popularity.toLocaleString('en-US')} decks ·{' '}
        <a
          href={combo.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`How ${combo.cards.map(c => c.name).join(' + ')} works, on Commander Spellbook`}
        >
          how it works
        </a>
      </span>
    </>
  );
}

function CompleterRow({ completer, hasCollection }: { completer: ComboCompleterView; hasCollection: boolean }) {
  const [first] = completer.combos;
  return (
    <li className="combo-row">
      <span className="combo-cards">
        <CardLink name={completer.card.name} />{' '}
        <span className="combo-own">
          {hasCollection && completer.owned > 0 ? (
            `you own ${completer.owned >= 4 ? 'a playset' : completer.owned}`
          ) : (
            <>
              craft <RarityDot rarity={completer.card.arenaRarity} />
            </>
          )}
        </span>
      </span>{' '}
      <span className="combo-meta">
        finishes {completer.finishes} combo{completer.finishes === 1 ? '' : 's'}
        {first && completer.finishes > 1 ? ', the most played:' : first ? ':' : ''}
      </span>{' '}
      {first && <span className="combo-example"><ComboLine combo={first} /></span>}
    </li>
  );
}

function Credit() {
  return (
    <p className="combo-credit">
      Combos from <a href={SPELLBOOK} target="_blank" rel="noreferrer">Commander Spellbook</a>, where each one&apos;s
      prerequisites and steps are: most need mana or a board state as well as the cards. Deck counts are theirs and
      come mostly from Commander, so they say how well known a combo is, not how strong it is here.
    </p>
  );
}

/** Combos in one list, and the single cards that would add one. Nothing is rendered when there are neither. */
export function DeckCombosSection({ combos, hasCollection }: { combos: DeckCombos; hasCollection: boolean }) {
  if (combos.inDeckTotal === 0 && combos.oneCardAway.length === 0) return null;
  return (
    <section className="combos" aria-label="Combos in this list">
      <h3>Combos</h3>
      <div className="combo-grid">
        {combos.inDeckTotal > 0 && (
          <div>
            <h4>
              In this list{combos.inDeckTotal > combos.inDeck.length ? `: ${combos.inDeck.length} of ${combos.inDeckTotal}, most played first` : ''}
            </h4>
            <ul>
              {combos.inDeck.map(combo => <li key={combo.id} className="combo-row"><ComboLine combo={combo} /></li>)}
            </ul>
          </div>
        )}
        {combos.oneCardAway.length > 0 && (
          <div>
            <h4>One more card would add a combo</h4>
            <ul>
              {combos.oneCardAway.map(completer => (
                <CompleterRow key={completer.card.oracleId} completer={completer} hasCollection={hasCollection} />
              ))}
            </ul>
          </div>
        )}
      </div>
      <Credit />
    </section>
  );
}

interface PanelProps {
  collection: StoredCollection | null;
  formats: Array<{ key: string; label: string; onArena: boolean }>;
}

/**
 * Combos the whole collection holds, by format. It asks the server only once
 * opened: most visitors come for a deck, and a collection is a large request.
 */
export function CombosPanel({ collection, formats }: PanelProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState(() => PREFERRED_FORMATS.find(key => formats.some(f => f.key === key)) ?? formats[0]?.key ?? 'historic');
  const [found, setFound] = useState<(CollectionCombos & { format: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !collection) return;
    let stale = false;
    setError(null);
    advisorApi.combos(format, collection)
      .then(result => { if (!stale) setFound(result); })
      .catch(err => { if (!stale) { setError(describeError(err)); setFound(null); } });
    return () => { stale = true; };
  }, [open, format, collection]);

  const label = formats.find(f => f.key === format)?.label ?? format;
  const current = found && found.format === format ? found : null;

  return (
    <section className="panel combos-panel" aria-labelledby="combos-heading">
      <div className="panel-head">
        <h2 id="combos-heading">Combos you own</h2>
        {!open && (
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)} disabled={!collection}>
            Find them
          </button>
        )}
      </div>
      {!collection && <p className="field-hint">Load a collection above to see the combos it already holds.</p>}
      {open && collection && (
        <>
          <div className="paste-actions">
            <label htmlFor="combo-format" className="field-label">Format</label>
            <select id="combo-format" value={format} onChange={e => setFormat(e.target.value)}>
              {formats.map(f => (
                <option key={f.key} value={f.key}>
                  {f.label}{f.onArena ? '' : ' (paper)'}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {!current && !error && <p className="loading">Looking through your collection…</p>}
          {current && (
            <div className="combos">
              <div className="combo-grid">
                <div>
                  <h4>
                    {current.ownedTotal === 0
                      ? `No combo is complete in ${label}`
                      : `You own every card of ${current.ownedTotal.toLocaleString('en-US')} combo${current.ownedTotal === 1 ? '' : 's'} in ${label}`}
                    {current.ownedTotal > current.owned.length ? '. The most played:' : ''}
                  </h4>
                  <ul>
                    {current.owned.map(combo => <li key={combo.id} className="combo-row"><ComboLine combo={combo} /></li>)}
                  </ul>
                </div>
                {current.oneCardAway.length > 0 && (
                  <div>
                    <h4>One card away</h4>
                    <ul>
                      {current.oneCardAway.map(completer => (
                        <CompleterRow key={completer.card.oracleId} completer={completer} hasCollection />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Credit />
            </div>
          )}
        </>
      )}
    </section>
  );
}
