import React from 'react';
import type { Wildcards } from './api';

const RARITIES = ['mythic', 'rare', 'uncommon', 'common'] as const;
const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

/** `{1}{R}` as small round symbols, front face only. */
export function ManaCost({ cost }: { cost: string }) {
  const front = cost.split(' // ')[0] ?? '';
  const symbols = [...front.matchAll(/\{([^}]+)\}/g)].map(m => m[1]!);
  if (symbols.length === 0) return null;
  return (
    <span className="mana-cost" aria-label={`Mana cost ${front}`}>
      {symbols.map((symbol, i) => {
        const color = /^[WUBRG]$/.test(symbol) ? symbol : symbol.includes('/') ? 'hybrid' : 'generic';
        return (
          <span key={i} className={`mana mana-${color}`} aria-hidden="true">
            {symbol.replace('/', '')}
          </span>
        );
      })}
    </span>
  );
}

export function ColorPips({ colors }: { colors: string[] }) {
  if (colors.length === 0) return <span className="mana mana-generic" title="Colourless">C</span>;
  return (
    <span className="mana-cost" aria-label={colors.map(c => COLOR_NAMES[c]).join(', ')}>
      {colors.map(c => (
        <span key={c} className={`mana mana-${c}`} aria-hidden="true">{c}</span>
      ))}
    </span>
  );
}

/** Wildcards by rarity, rarest first; rarities at zero are left out. */
export function WildcardRow({ wildcards, empty = 'None' }: { wildcards: Wildcards; empty?: string }) {
  const parts = RARITIES.filter(r => wildcards[r] > 0);
  if (parts.length === 0) return <span className="wc-none">{empty}</span>;
  return (
    <span className="wc-row">
      {parts.map(rarity => (
        <span key={rarity} className={`wc wc-${rarity}`} title={`${wildcards[rarity]} ${rarity} wildcard${wildcards[rarity] === 1 ? '' : 's'}`}>
          <span className="wc-gem" aria-hidden="true" />
          {wildcards[rarity]}
          <span className="sr-only"> {rarity}</span>
        </span>
      ))}
    </span>
  );
}

export function RarityDot({ rarity }: { rarity?: string }) {
  if (!rarity) return null;
  return <span className={`wc wc-${rarity} wc-dot`} title={`${rarity} wildcard`}><span className="wc-gem" aria-hidden="true" /><span className="sr-only">{rarity}</span></span>;
}

export function Meter({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);
  return (
    <span className="meter" role="img" aria-label={`${label}: ${percent}%`}>
      <span className="meter-fill" style={{ width: `${percent}%` }} />
    </span>
  );
}

export const percent = (value: number, digits = 0): string => `${(value * 100).toFixed(digits)}%`;

export function scryfallUrl(name: string): string {
  return `https://scryfall.com/search?q=${encodeURIComponent(`!"${name.split(' // ')[0]}"`)}`;
}

export function CardLink({ name }: { name: string }) {
  return (
    <a className="card-link" href={scryfallUrl(name)} target="_blank" rel="noreferrer">
      {name}
    </a>
  );
}
