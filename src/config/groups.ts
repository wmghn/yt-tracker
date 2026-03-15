/**
 * GROUPS CONFIG
 * =============================================================================
 * Define contribution groups and their weight percentages.
 *
 * Rules:
 *   - weight: integer, unit = %
 *   - Sum of ALL weights MUST equal exactly 100
 *   - key: UPPERCASE, no spaces (used as internal ID)
 *
 * To add a new group:
 *   1. Add a new object to the GROUPS array below
 *   2. Adjust weights so the total stays = 100
 *   3. Run: npm run build
 *
 * Example - adding a Thumbnail group:
 *   { key: "THUMBNAIL", label: "Thumbnail", weight: 15, color: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" } }
 *   Then reduce Editor to 50 and Content to 35
 * =============================================================================
 */

export interface GroupDefinition {
  key:    string;
  label:  string;
  weight: number;
  color: {
    bg:     string;
    text:   string;
    border: string;
  };
}

export const GROUPS: GroupDefinition[] = [
  {
    key:    "EDITOR",
    label:  "Editor",
    weight: 60,
    color: {
      bg:     "bg-blue-50",
      text:   "text-blue-700",
      border: "border-blue-200",
    },
  },
  {
    key:    "CONTENT",
    label:  "Content",
    weight: 40,
    color: {
      bg:     "bg-violet-50",
      text:   "text-violet-700",
      border: "border-violet-200",
    },
  },

  // ── Add new groups below ───────────────────────────────────────────────────
  // {
  //   key:    "THUMBNAIL",
  //   label:  "Thumbnail",
  //   weight: 10,
  //   color: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  // },
  // {
  //   key:    "SEO",
  //   label:  "SEO / Tags",
  //   weight: 5,
  //   color: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  // },
];

// Build-time validation: total weight must equal 100
const _total = GROUPS.reduce((sum, g) => sum + g.weight, 0);
if (_total !== 100) {
  throw new Error(
    `[src/config/groups.ts] Total weight must equal 100, got ${_total}.\n` +
    `Please fix the weight values in GROUPS.`
  );
}

/** Look up a group by key, throws if not found */
export function getGroup(key: string): GroupDefinition {
  const g = GROUPS.find((g) => g.key === key);
  if (!g) throw new Error(`[groups.ts] No group found with key="${key}"`);
  return g;
}

/** key -> weight as decimal (e.g. 0.6 for weight:60) */
export const GROUP_WEIGHTS: Record<string, number> = Object.fromEntries(
  GROUPS.map((g) => [g.key, g.weight / 100])
);
