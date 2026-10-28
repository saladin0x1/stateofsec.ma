import type { Exploration } from "./explore";
import type { SurveyModel } from "./model";
import type { ProfileStats, ScreenStats } from "./paths";

/**
 * The statistics pinned in scripts/verify/golden.json. Any change to the survey's branching
 * shows up here, so a change must be deliberate: `pnpm verify-survey --update-golden`
 */
export interface Golden {
  questions: number;
  /** Classes per guard (spec atoms refine them, so a spec change can move these too) */
  guardClasses: Record<string, number>;
  classStates: { all: number; complete: number };
  paths: { complete: number; all: number };
  screens: ScreenStats;
  profiles: Record<string, ProfileStats>;
}

export function goldenOf(model: SurveyModel, exploration: Exploration): Golden {
  return {
    questions: model.questions.length,
    guardClasses: Object.fromEntries(exploration.guards.map(g => [g.question.id, g.classes.length])),
    classStates: exploration.classStates,
    paths: { complete: exploration.paths.complete, all: exploration.paths.all },
    screens: exploration.paths.screens,
    profiles: exploration.paths.profiles
  };
}

function flatten(value: unknown, prefix: string, out: Map<string, string>) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, inner] of Object.entries(value))
      flatten(inner, prefix ? `${prefix}.${key}` : key, out);
  }
  else {
    out.set(prefix, JSON.stringify(value));
  }
}

/** Differences between the pinned statistics and the current ones, one line each */
export function diffGolden(expected: unknown, actual: Golden): string[] {
  const before = new Map<string, string>();
  const after = new Map<string, string>();
  flatten(expected, "", before);
  flatten(actual, "", after);
  const lines: string[] = [];
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const was = before.get(key);
    const now = after.get(key);
    if (was !== now)
      lines.push(`${key}: ${was ?? "(absent)"} -> ${now ?? "(absent)"}`);
  }
  return lines;
}
