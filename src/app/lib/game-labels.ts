// Universe slugs (product_metadata.game) -> display labels.
// Slugs are assigned from GW's own GameSystemsRoot hierarchy by
// scripts/backfill-universe-tags.mjs and the GW catalogue sync.
export const GAME_LABELS: Record<string, string> = {
  warhammer40k: "Warhammer 40,000",
  killteam: "Kill Team",
  ageofsigmar: "Age of Sigmar",
  warcry: "Warcry",
  underworlds: "Warhammer Underworlds",
  horusheresy: "The Horus Heresy",
  oldworld: "The Old World",
  middleearth: "Middle-Earth",
  necromunda: "Necromunda",
  bloodbowl: "Blood Bowl",
  legionsimperialis: "Legions Imperialis",
  adeptustitanicus: "Adeptus Titanicus",
  warhammerquest: "Warhammer Quest",
  other: "Other",
};

export function gameLabel(slug?: string | null): string {
  if (!slug) return "—";
  return GAME_LABELS[slug] ?? slug;
}
