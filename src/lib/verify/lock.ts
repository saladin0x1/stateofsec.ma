import type { SurveyModel } from "./model";

// Question ids are positional (<section label>-q-<index>) and stored answers are choice
// indices, so after launch an existing id must keep its meaning: same section, same text,
// same single/multi type and the same choices in the same order. survey/survey.lock.json pins
// them. Before launch ("launched": false) a difference is only reported; after launch any
// change to an existing id fails, and new ids must be locked with `pnpm lock-survey --update`

export interface LockedQuestion {
  section: string;
  label: string;
  multiple: boolean;
  choices: string[];
}

export interface SurveyLock {
  $comment: string;
  launched: boolean;
  questions: Record<string, LockedQuestion>;
}

export interface LockStatus {
  ok: boolean;
  /** Ids whose meaning changed, with what changed */
  changed: string[];
  removed: string[];
  added: string[];
}

const COMMENT = "Positional question ids and their meaning. Rewrite with `pnpm lock-survey --update`. "
  + "Set launched to true when the survey opens: from then on, changing an existing id fails the checks.";

function locked(model: SurveyModel): Record<string, LockedQuestion> {
  return Object.fromEntries(model.questions.map(q => [q.id, {
    section: q.section,
    label: q.label,
    multiple: q.multiple,
    choices: [...q.choices]
  }]));
}

export function buildLock(model: SurveyModel, launched = false): SurveyLock {
  return { $comment: COMMENT, launched, questions: locked(model) };
}

export function checkLock(lock: SurveyLock, model: SurveyModel): LockStatus {
  const current = locked(model);
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [id, before] of Object.entries(lock.questions)) {
    const now = current[id];
    if (!now) {
      removed.push(id);
      continue;
    }
    const what: string[] = [];
    if (now.section !== before.section)
      what.push("section");
    if (now.label !== before.label)
      what.push("label");
    if (now.multiple !== before.multiple)
      what.push("multiple");
    if (JSON.stringify(now.choices) !== JSON.stringify(before.choices)) {
      const first = now.choices.findIndex((c, i) => c !== before.choices[i]);
      what.push(`choices (first difference at index ${first === -1 ? now.choices.length : first})`);
    }
    if (what.length)
      changed.push(`${id}: ${what.join(", ")}`);
  }
  const added = Object.keys(current).filter(id => !Object.hasOwn(lock.questions, id));
  const drift = changed.length + removed.length + added.length > 0;
  return { ok: !lock.launched || !drift, changed, removed, added };
}

/**
 * The lock to write for `--update`. Before launch it is rebuilt from the survey; after
 * launch only new ids are added, and a change to an existing id is refused
 */
export function updateLock(lock: SurveyLock | undefined, model: SurveyModel): { lock?: SurveyLock; refused: string[] } {
  if (!lock || !lock.launched)
    return { lock: buildLock(model, false), refused: [] };
  const status = checkLock(lock, model);
  const refused = [...status.changed, ...status.removed.map(id => `${id}: removed`)];
  if (refused.length)
    return { refused };
  const current = locked(model);
  const questions = { ...lock.questions };
  for (const id of status.added)
    questions[id] = current[id];
  return { lock: { ...lock, questions }, refused: [] };
}
