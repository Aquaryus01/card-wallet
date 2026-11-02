export interface Merchant {
  id: string;
  name: string;
  aliases: string[];
  /** Used for the favicon download; may be empty. */
  domain: string;
  /** Brand colour; absent for generated entries (a stable colour is derived from the name). */
  color?: string;
  /** OSM `brand` tag value used for the Overpass store lookup */
  osmBrand: string;
  /** Wikidata id (from the name-suggestion-index) */
  wikidata?: string;
  /** NSI category, e.g. "supermarket", "fuel" */
  category?: string;
  /** Mapped locations in Romania when the list was generated */
  stores?: number;
}
