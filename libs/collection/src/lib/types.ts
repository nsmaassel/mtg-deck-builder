export interface OwnedCard {
  name: string;
  normalizedName: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
}

/** key: normalizedName */
export type CollectionMap = Map<string, OwnedCard>;

export interface ParseResult {
  collection: CollectionMap;
  commandersFound: string[];
  totalCards: number;
  uniqueCards: number;
  unrecognizedLines: string[];
}
