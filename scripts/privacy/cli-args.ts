import type { Thresholds } from "./release";
import process from "node:process";
import { THRESHOLDS } from "./release";

export function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(a => a.startsWith(prefix))?.slice(prefix.length);
}

export function numbers(name: string, fallback: number[]): number[] {
  const value = arg(name);
  return value ? value.split(",").map(Number) : fallback;
}

/** Threshold overrides (--k-s2, --k-s3, --k-minors, --l-flaw, --max-suppression), for what-if runs */
export function thresholdsFromArgs(): Thresholds {
  const pick = (name: string, fallback: number) => (arg(name) === undefined ? fallback : Number(arg(name)));
  return {
    kS2: pick("k-s2", THRESHOLDS.kS2),
    kS3: pick("k-s3", THRESHOLDS.kS3),
    kMinors: pick("k-minors", THRESHOLDS.kMinors),
    lFlaw: pick("l-flaw", THRESHOLDS.lFlaw),
    maxSuppression: pick("max-suppression", THRESHOLDS.maxSuppression)
  };
}
