// Disclosure metrics, computed on rows exactly as they would be published.
// k of a row = how many rows share its values on a quasi-identifier set (strict: a blank is
// a value of its own, so a blank only hides among other blanks). Every published tuple
// appearing at least k times is the classic k-anonymity of a release.
import type { AnswerValue } from "../../src/lib/conditions";
import type { Row } from "./fields";

export function cellKey(value: AnswerValue | undefined): string {
  if (value == null)
    return "";
  if (Array.isArray(value))
    return [...value].sort((a, b) => a - b).join("+");
  return String(value);
}

export function rowKey(row: Row, fields: readonly string[]): string {
  return fields.map(f => cellKey(row[f])).join("|");
}

export function countKeys(rows: readonly Row[], fields: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = rowKey(row, fields);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** k of every row, against the whole file */
export function kPerRow(rows: readonly Row[], fields: readonly string[]): number[] {
  const counts = countKeys(rows, fields);
  return rows.map(row => counts.get(rowKey(row, fields))!);
}

export interface KSummary {
  rows: number;
  /** share of rows with k = 1 */
  unique: number;
  /** share of rows with k < 3 and k < 5 */
  under3: number;
  under5: number;
  minK: number;
}

export function summarizeK(ks: readonly number[]): KSummary {
  const share = (test: (k: number) => boolean) => (ks.length ? ks.filter(test).length / ks.length : 0);
  return {
    rows: ks.length,
    unique: share(k => k === 1),
    under3: share(k => k < 3),
    under5: share(k => k < 5),
    minK: ks.length ? Math.min(...ks) : Infinity
  };
}

/** k summary over the rows of one stratum; classes are still counted over the whole file */
export function stratumK(rows: readonly Row[], inStratum: readonly boolean[], fields: readonly string[]): KSummary {
  const ks = kPerRow(rows, fields);
  return summarizeK(ks.filter((_, i) => inStratum[i]));
}

export interface LSummary {
  classes: number;
  /** smallest number of distinct values of one sensitive question within one class */
  minL: number;
  /** share of rows sitting in a class where some sensitive question has fewer than l values */
  rowsBelow: number;
  worst?: { key: string; field: string; l: number; size: number };
}

/**
 * Distinct l-diversity of each sensitive question within each class. A blank answer counts
 * as one value (the person did not see or skipped it); a class where nobody answered a
 * question discloses nothing about it and is skipped.
 */
export function lDiversity(
  rows: readonly Row[],
  classOf: (row: Row) => string,
  sensitive: readonly string[],
  l: number
): LSummary {
  const classes = new Map<string, Row[]>();
  for (const row of rows) {
    const key = classOf(row);
    const members = classes.get(key);
    if (members)
      members.push(row);
    else
      classes.set(key, [row]);
  }
  let minL = Infinity;
  let rowsBelow = 0;
  let worst: LSummary["worst"];
  for (const [key, members] of classes) {
    let classMin = Infinity;
    for (const field of sensitive) {
      const values = new Set(members.map(row => cellKey(row[field])));
      if (values.size === 1 && values.has(""))
        continue;
      if (values.size < classMin)
        classMin = values.size;
      if (values.size < minL) {
        minL = values.size;
        worst = { key, field, l: values.size, size: members.length };
      }
    }
    if (classMin < l)
      rowsBelow += members.length;
  }
  return { classes: classes.size, minL, rowsBelow: rows.length ? rowsBelow / rows.length : 0, worst };
}
