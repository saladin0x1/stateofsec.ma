import type { Answers } from "../conditions";
import type { Finding, SurveyModel } from "./model";
import * as yaml from "js-yaml";
import { z } from "zod";

// The invariants file (scripts/verify/spec.yml). It names questions by alias (id + the start
// of the question text, both checked) and choices by TEXT, never by index, so it stays
// independent of how the YAML author wrote the conditions

const TextList = z.array(z.string().min(1)).min(1);
const AtomSchema = z.union([TextList, z.object({ not: TextList }).strict()]);
const OptionMap = z.record(z.string(), TextList);

const InvariantSchema = z.object({
  name: z.string().min(3),
  source: z.string().optional(),
  when: z.record(z.string(), AtomSchema).optional(),
  scope: z.enum(["all", "complete"]).optional(),
  hidden: z.array(z.string()).min(1).optional(),
  visible: z.array(z.string()).min(1).optional(),
  hiddenOptions: OptionMap.optional(),
  visibleOptions: OptionMap.optional(),
  exactlyOne: z.array(z.string()).min(2).optional(),
  atMostOne: z.array(z.string()).min(2).optional(),
  atLeastOne: z.array(z.string()).min(2).optional(),
  softCheck: z.object({
    question: z.string(),
    options: TextList,
    fires: z.boolean()
  }).strict().optional()
}).strict();

export const SpecSchema = z.object({
  review: z.object({
    status: z.enum(["pending", "approved"]),
    reviewers: z.array(z.string()),
    date: z.string().optional()
  }).strict(),
  questions: z.record(z.string(), z.object({ id: z.string(), label: z.string().min(3) }).strict()),
  profileLeaf: z.array(z.string()).optional(),
  invariants: z.array(InvariantSchema)
}).strict();

export type SpecFile = z.infer<typeof SpecSchema>;
export type SpecInvariant = z.infer<typeof InvariantSchema>;

/** "The answer to `guard` is one of `values`", or its negation (no answer counts as "not") */
export interface Atom {
  guard: number;
  values: Set<number>;
  negate: boolean;
}

export type Scope = "all" | "complete";

export interface QuestionObligation {
  invariant: string;
  subject: string;
  question: number;
  when: Atom[];
  scope: Scope;
  kind: "hidden" | "visible" | "hiddenOption" | "visibleOption" | "softFires" | "softSilent";
  option: number;
}

export interface SetObligation {
  invariant: string;
  subject: string;
  members: number[];
  when: Atom[];
  scope: Scope;
  kind: "exactlyOne" | "atMostOne" | "atLeastOne";
}

export interface CompiledSpec {
  review: SpecFile["review"];
  invariantCount: number;
  obligations: QuestionObligation[];
  sets: SetObligation[];
  /** Questions whose answers name a profile leaf in the statistics */
  profileLeaf: number[];
  errors: Finding[];
}

export const EMPTY_SPEC: CompiledSpec = {
  review: { status: "pending", reviewers: [] },
  invariantCount: 0,
  obligations: [],
  sets: [],
  profileLeaf: [],
  errors: []
};

export function parseSpec(text: string): SpecFile {
  return SpecSchema.parse(yaml.load(text));
}

export function atomHolds(atom: Atom, answers: Answers, guardId: string): boolean {
  const value = answers[guardId];
  const inSet = typeof value === "number" && atom.values.has(value);
  return atom.negate ? !inSet : inSet;
}

/** Resolves aliases and choice texts against the survey; every mismatch is a spec error */
export function compileSpec(model: SurveyModel, spec: SpecFile): CompiledSpec {
  const errors: Finding[] = [];
  const fail = (subject: string, message: string) =>
    errors.push({ check: "spec-error", subject, message });

  const aliases = new Map<string, number>();
  for (const [alias, ref] of Object.entries(spec.questions)) {
    const q = model.byId.get(ref.id);
    if (!q) {
      fail(`alias ${alias}`, `${ref.id} is not a question of the survey`);
      continue;
    }
    if (!q.label.startsWith(ref.label)) {
      fail(`alias ${alias}`, `${ref.id} reads "${q.label.slice(0, 80)}", not "${ref.label}": the survey moved, review the spec`);
      continue;
    }
    aliases.set(alias, q.index);
  }
  const question = (alias: string, where: string): number | undefined => {
    const index = aliases.get(alias);
    if (index === undefined && !Object.hasOwn(spec.questions, alias))
      fail(where, `unknown question alias "${alias}"`);
    return index;
  };
  const choices = (index: number, texts: string[], where: string): number[] => {
    const q = model.questions[index];
    const resolved: number[] = [];
    for (const text of texts) {
      const i = q.choices.indexOf(text);
      if (i === -1)
        fail(where, `${q.id} has no choice "${text}"`);
      else
        resolved.push(i);
    }
    return resolved;
  };

  const obligations: QuestionObligation[] = [];
  const sets: SetObligation[] = [];
  const names = new Set<string>();

  for (const inv of spec.invariants) {
    const where = `invariant "${inv.name}"`;
    if (names.has(inv.name))
      fail(where, "duplicate invariant name");
    names.add(inv.name);
    const when: Atom[] = [];
    for (const [alias, atom] of Object.entries(inv.when ?? {})) {
      const guard = question(alias, where);
      if (guard === undefined)
        continue;
      if (model.questions[guard].multiple)
        fail(where, `"when" tests ${alias}, a multi-select question`);
      const negate = !Array.isArray(atom);
      const texts = Array.isArray(atom) ? atom : atom.not;
      when.push({ guard, values: new Set(choices(guard, texts, where)), negate });
    }
    const scope: Scope = inv.scope ?? "all";
    const before = (target: number, subject: string) => {
      for (const atom of when.filter(a => a.guard >= target)) {
        fail(where, `"when" tests ${model.questions[atom.guard].id}, which does not come before ${subject}`);
      }
    };
    const add = (kind: QuestionObligation["kind"], alias: string, option = -1, text = "") => {
      const index = question(alias, where);
      if (index === undefined)
        return;
      const subject = option === -1 ? alias : `${alias} option "${text}"`;
      before(index, model.questions[index].id);
      obligations.push({ invariant: inv.name, subject, question: index, when, scope, kind, option });
    };
    let assertions = 0;
    for (const alias of inv.hidden ?? []) {
      add("hidden", alias);
      assertions++;
    }
    for (const alias of inv.visible ?? []) {
      add("visible", alias);
      assertions++;
    }
    for (const [kind, map] of [["hiddenOption", inv.hiddenOptions], ["visibleOption", inv.visibleOptions]] as const) {
      for (const [alias, texts] of Object.entries(map ?? {})) {
        const index = question(alias, where);
        if (index === undefined)
          continue;
        const resolved = choices(index, texts, where);
        resolved.forEach(option => add(kind, alias, option, model.questions[index].choices[option]));
        assertions++;
      }
    }
    if (inv.softCheck) {
      const index = question(inv.softCheck.question, where);
      if (index !== undefined) {
        if (model.questions[index].multiple)
          fail(where, "soft checks need a single-select question");
        for (const option of choices(index, inv.softCheck.options, where)) {
          add(inv.softCheck.fires ? "softFires" : "softSilent", inv.softCheck.question, option, model.questions[index].choices[option]);
        }
      }
      assertions++;
    }
    for (const kind of ["exactlyOne", "atMostOne", "atLeastOne"] as const) {
      const members = inv[kind];
      if (!members)
        continue;
      assertions++;
      const indices = members.map(alias => question(alias, where)).filter((i): i is number => i !== undefined);
      if (indices.length !== members.length)
        continue;
      if (new Set(indices).size !== indices.length)
        fail(where, `${kind} lists a question twice`);
      const sorted = [...indices].sort((a, b) => a - b);
      before(sorted[sorted.length - 1], model.questions[sorted[sorted.length - 1]].id);
      sets.push({ invariant: inv.name, subject: `${kind} [${members.join(", ")}]`, members: sorted, when, scope, kind });
    }
    if (assertions === 0)
      fail(where, "asserts nothing");
  }

  const profileLeaf: number[] = [];
  for (const alias of spec.profileLeaf ?? []) {
    const index = question(alias, "profileLeaf");
    if (index === undefined)
      continue;
    if (model.questions[index].multiple)
      fail("profileLeaf", `${alias} is multi-select`);
    else
      profileLeaf.push(index);
  }
  profileLeaf.sort((a, b) => a - b);

  return { review: spec.review, invariantCount: spec.invariants.length, obligations, sets, profileLeaf, errors };
}
