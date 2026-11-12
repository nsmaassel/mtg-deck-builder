import React from 'react';

export const POPULARITY_TOOLTIP = "Scryfall's EDHREC rank: how widely played across Commander, not with this commander";

/** A word for a 0..1 popularity. The bands are EDHREC ranks of about 300 and 3,000. */
export function popularityLabel(popularity: number): string {
  if (popularity >= 0.45) return 'widely played';
  if (popularity >= 0.22) return 'often played';
  return 'rarely played';
}

/** Where the Commander Builder's data comes from, shown wherever its picks are. */
export function DataCredit() {
  return (
    <p className="data-credit">
      Card data and tags: <a href="https://scryfall.com" target="_blank" rel="noreferrer">Scryfall</a>.
      {' '}Recommendations are computed from them here; they are not play statistics for your commander.
    </p>
  );
}
