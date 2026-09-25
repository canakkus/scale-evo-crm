/**
 * ============================================================
 * SCOUT-KATEGORIEN -> GOOGLE PLACES TYPEN
 * ============================================================
 * Jeder `includedType` ist gegen die offizielle Table A geprueft
 * (developers.google.com/maps/documentation/places/web-service/place-types,
 * Stand 2026-09-11). Werte aus Table B (z. B. `food`) sind als Filter
 * NICHT erlaubt und fuehren zu INVALID_ARGUMENT.
 *
 * - `includedType` + `strict`: nur wo es genau EINEN sauberen Typ gibt.
 * - Kategorien ohne sauberen Typ (Wimpern, Café & Bar, Imbiss,
 *   Gastronomie) bekommen bewusst KEINEN includedType — ein falscher
 *   strikter Typ wuerde passende Betriebe still verschlucken.
 * - `matchTypes`: kostenloser Nachfilter auf `places.types`. Nur wirksam,
 *   wenn Google Typen liefert — fehlende Typen heissen "unbekannt", nicht
 *   "passt nicht". Eintraege mit fuehrendem "*" sind Suffix-Muster.
 * ============================================================
 */

export type ScoutCategorySearch = {
  /** Suchbegriff OHNE Ort — der Ort wird je nach Umkreis-Modus angehaengt. */
  query: string;
  includedType?: string;
  strict: boolean;
  matchTypes: readonly string[];
  /** Branche laut INDUSTRIES (constants.ts), falls mapIndustry() nichts findet. */
  industry: string | null;
};

const BEAUTY_TYPES = ["beauty_salon", "beautician", "skin_care_clinic", "makeup_artist", "nail_salon", "spa"] as const;
const GASTRO_TYPES = [
  "*_restaurant", "restaurant", "cafe", "coffee_shop", "bar", "wine_bar", "cocktail_bar", "pub", "bistro",
  "cafeteria", "snack_bar", "kebab_shop", "meal_takeaway", "sandwich_shop", "bakery", "tea_house", "food_court",
] as const;

export const SCOUT_CATEGORY_SEARCHES: Record<string, ScoutCategorySearch> = {
  Barber: { query: "Barber", includedType: "barber_shop", strict: true, matchTypes: ["barber_shop", "hair_salon", "hair_care"], industry: "Barber" },
  Friseur: { query: "Friseur", includedType: "hair_salon", strict: true, matchTypes: ["hair_salon", "hair_care", "barber_shop"], industry: "Friseur" },
  "Spa & Wellness": {
    query: "Spa Wellness",
    includedType: "spa",
    strict: false,
    matchTypes: ["spa", "wellness_center", "massage", "massage_spa", "sauna", "public_bath", "beauty_salon"],
    industry: "Massage & Wellness",
  },
  Nagelstudio: { query: "Nagelstudio", includedType: "nail_salon", strict: true, matchTypes: ["nail_salon", "beauty_salon"], industry: "Nagelstudio" },
  Kosmetik: { query: "Kosmetikstudio", includedType: "beauty_salon", strict: false, matchTypes: BEAUTY_TYPES, industry: "Kosmetik & Beauty" },
  Massage: {
    query: "Massage",
    includedType: "massage",
    strict: false,
    matchTypes: ["massage", "massage_spa", "spa", "wellness_center"],
    industry: "Massage & Wellness",
  },
  Wimpern: { query: "Wimpernstudio", strict: false, matchTypes: BEAUTY_TYPES, industry: "Kosmetik & Beauty" },
  Restaurant: { query: "Restaurant", includedType: "restaurant", strict: true, matchTypes: ["restaurant", "*_restaurant"], industry: "Gastronomie" },
  Pizzeria: { query: "Pizzeria", includedType: "pizza_restaurant", strict: true, matchTypes: ["pizza_restaurant", "italian_restaurant", "restaurant"], industry: "Gastronomie" },
  "Café & Bar": {
    query: "Café Bar",
    strict: false,
    matchTypes: ["cafe", "coffee_shop", "bar", "wine_bar", "cocktail_bar", "pub", "bistro", "cafeteria", "tea_house", "bakery"],
    industry: "Gastronomie",
  },
  Imbiss: {
    query: "Imbiss",
    strict: false,
    matchTypes: ["fast_food_restaurant", "snack_bar", "kebab_shop", "meal_takeaway", "sandwich_shop", "hot_dog_stand", "food_court", "*_restaurant", "restaurant"],
    industry: "Gastronomie",
  },
  Gastronomie: { query: "Gastronomie", strict: false, matchTypes: GASTRO_TYPES, industry: "Gastronomie" },
};

/**
 * "Alle" = drei getypte Einzelsuchen statt eines gemischten Textes.
 * Genau drei, weil das Budget pro Lauf drei Places-Listenaufrufe erlaubt
 * (SCOUT_LIMITS.maxPlacesListCalls) — eine vierte Branche wuerde das Limit
 * reissen, eine gemischte Suche liefert nur die prominentesten Betriebe.
 */
export const ALL_CATEGORY_SEARCHES: ScoutCategorySearch[] = [
  { query: "Friseur", includedType: "hair_salon", strict: true, matchTypes: ["hair_salon", "hair_care", "barber_shop"], industry: "Friseur" },
  { query: "Kosmetikstudio", includedType: "beauty_salon", strict: true, matchTypes: BEAUTY_TYPES, industry: "Kosmetik & Beauty" },
  { query: "Restaurant", includedType: "restaurant", strict: true, matchTypes: ["restaurant", "*_restaurant"], industry: "Gastronomie" },
];

/** Suchen fuer eine Kategorie. Unbekannte Kategorien (KI-Tools) = reiner Text, kein Typfilter. */
export function categorySearchesFor(category: string): ScoutCategorySearch[] {
  if (category === "Alle") return ALL_CATEGORY_SEARCHES;
  const known = SCOUT_CATEGORY_SEARCHES[category];
  if (known) return [known];
  return [{ query: category, strict: false, matchTypes: [], industry: null }];
}

/**
 * true = passt, false = passt sicher nicht, null = nicht beurteilbar
 * (keine Typen von Google oder kein Nachfilter fuer die Kategorie).
 */
export function matchesCategoryTypes(types: string[] | undefined, matchTypes: readonly string[]): boolean | null {
  if (!types || types.length === 0 || matchTypes.length === 0) return null;
  return types.some((type) =>
    matchTypes.some((pattern) => (pattern.startsWith("*") ? type.endsWith(pattern.slice(1)) : type === pattern)),
  );
}
