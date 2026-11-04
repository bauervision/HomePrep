import type { Household, LibraryCategoryId, MilestoneKey } from "./types";

export const LIBRARY_CATEGORIES: Record<LibraryCategoryId, string> = {
  water: "Water",
  food: "Food",
  power: "Power",
  sanitation: "Sanitation",
  communications: "Communications",
  shelter: "Shelter",
};

export const isLibraryCategory = (id: string): id is LibraryCategoryId =>
  Object.hasOwn(LIBRARY_CATEGORIES, id);

/** Explicit compatible built-ins. Family plan is not renamed into Shelter. */
const COMPATIBLE: Record<
  LibraryCategoryId,
  Partial<Record<MilestoneKey, string>>
> = {
  water: {
    "72h": "water",
    "7d": "water",
    "30d": "water",
    "60d": "water",
    "90d": "water",
  },
  food: {
    "72h": "food",
    "7d": "food",
    "30d": "food",
    "60d": "food",
    "90d": "food",
  },
  power: {
    "72h": "power",
    "7d": "charging",
    "30d": "energy",
    "60d": "power",
    "90d": "energy",
  },
  sanitation: {
    "72h": "sanitation",
    "7d": "hygiene",
    "30d": "waste",
    "60d": "sanitation",
    "90d": "sanitation",
  },
  communications: { "72h": "comms", "7d": "comms" },
  shelter: {},
};

export function libraryDestination(
  categoryId: LibraryCategoryId,
  milestone: MilestoneKey,
) {
  const builtIn = COMPATIBLE[categoryId][milestone];
  const key = builtIn ?? `library-${categoryId}`;
  return {
    key,
    categoryId,
    milestone,
    label: LIBRARY_CATEGORIES[categoryId],
    builtIn: !!builtIn,
    storageKey: `${milestone}:${key}`,
  };
}

export function savedLibraryDestinations(
  h: Household,
  milestone: MilestoneKey,
) {
  return Object.entries(h.goalDestinations ?? {}).flatMap(([id, saved]) => {
    if (!isLibraryCategory(saved.categoryId) || saved.milestone !== milestone)
      return [];
    const dest = libraryDestination(saved.categoryId, milestone);
    return !dest.builtIn && id === dest.storageKey ? [dest] : [];
  });
}
