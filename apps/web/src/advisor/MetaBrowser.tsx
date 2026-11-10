import React, { useState } from 'react';
import type { ArchetypeView, MetaView } from './api';
import { ColorPips, Meter, WildcardRow, percent } from './bits';

interface Props {
  meta: MetaView;
  hasCollection: boolean;
  hasWildcards: boolean;
  onPick: (archetype: ArchetypeView) => void;
}

function BuildStatus({ archetype, hasWildcards }: { archetype: ArchetypeView; hasWildcards: boolean }) {
  const gap = archetype.gap;
  if (!gap) return null;
  if (gap.ownedCards === gap.totalCards) return <span className="tag tag-good">You own it</span>;
  if (gap.craftable) return <span className="tag tag-good">Craftable now</span>;
  if (hasWildcards && gap.wildcardsShort) {
    return (
      <span className="short">
        short <WildcardRow wildcards={gap.wildcardsShort} />
      </span>
    );
  }
  return null;
}

/** A format's archetypes: closest to the collection first, or most played without one. */
export function MetaBrowser({ meta, hasCollection, hasWildcards, onPick }: Props) {
  const [showFringe, setShowFringe] = useState(false);
  const named = meta.archetypes.filter(a => !a.isOther);
  const fringeCount = named.filter(a => a.isFringe).length;
  const decks = showFringe ? named : named.filter(a => !a.isFringe);
  const otherShare = meta.archetypes.filter(a => a.isOther).reduce((sum, a) => sum + a.metaShare, 0);

  return (
    <div className="meta-browser">
      <p className="meta-context">
        {meta.totalDecks.toLocaleString()} tournament lists from {meta.eventCount} events, {meta.from} to {meta.to}.{' '}
        {hasCollection
          ? 'Sorted by how close your collection is.'
          : 'Sorted by how often each deck is played. Load a collection to sort by what you can build.'}
      </p>

      <div className="table-scroll">
        <table className="meta-table">
          <thead>
            <tr>
              <th scope="col">Deck</th>
              <th scope="col" className="num">Meta share</th>
              <th scope="col" className="num">Win rate</th>
              {hasCollection && <th scope="col">You own</th>}
              {hasCollection && <th scope="col">Wildcards to finish</th>}
            </tr>
          </thead>
          <tbody>
            {decks.map(archetype => (
              <tr key={archetype.id}>
                <th scope="row">
                  <button type="button" className="deck-pick" onClick={() => onPick(archetype)}>
                    <ColorPips colors={archetype.colors} />
                    <span className="deck-pick-name">{archetype.name}</span>
                  </button>
                  <span className="key-cards">{archetype.keyCards.join(' · ')}</span>
                </th>
                <td className="num" data-label="Meta share">
                  {percent(archetype.metaShare, 1)}
                  <span className="sub">{archetype.deckCount} lists</span>
                </td>
                <td className="num" data-label="Win rate">
                  {archetype.winRate === undefined ? (
                    <span className="muted" title={`Fewer than ${meta.minMatchesForWinRate} recorded matches`}>—</span>
                  ) : (
                    <>
                      {percent(archetype.winRate, 1)}
                      <span className="sub">{archetype.matches} matches</span>
                    </>
                  )}
                </td>
                {hasCollection && archetype.gap && (
                  <td data-label="You own">
                    <Meter value={archetype.gap.completion} label="Cards owned" />
                    <span className="sub">
                      {archetype.gap.ownedCards} of {archetype.gap.totalCards} cards
                    </span>
                  </td>
                )}
                {hasCollection && archetype.gap && (
                  <td data-label="Wildcards to finish">
                    <WildcardRow wildcards={archetype.gap.wildcardsNeeded} empty="Nothing to craft" />
                    <BuildStatus archetype={archetype} hasWildcards={hasWildcards} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fringeCount > 0 && (
        <button type="button" className="btn-quiet" onClick={() => setShowFringe(!showFringe)}>
          {showFringe ? 'Hide' : 'Show'} {fringeCount} deck{fringeCount === 1 ? '' : 's'} under 1% of the meta
        </button>
      )}

      <p className="meta-footnote">
        Win rates are match records from events that publish standings, not Arena ladder results. Published lists
        lean towards top finishers, so the rates run high
        {meta.fieldWinRate !== undefined && ` (${percent(meta.fieldWinRate, 1)} across all of them)`}: compare decks
        with each other, not with 50%.
        {otherShare > 0 && ` ${percent(otherShare, 0)} of lists fit no named archetype and are left out.`}
      </p>
    </div>
  );
}
