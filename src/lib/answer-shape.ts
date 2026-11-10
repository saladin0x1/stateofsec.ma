import type { Answers } from "@/lib/conditions";

// Bounds well above the survey (under 100 answer fields, ids under 30 characters, at most
// 16 choices per question), so a real client never meets them
export const MAX_ANSWER_FIELDS = 256;
export const MAX_KEY_LENGTH = 128;
export const MAX_TEXT_LENGTH = 200;
export const MAX_CHOICES = 64;

function isAnswerValue(value: unknown): boolean {
  if (value === null || typeof value === "number")
    return true;
  if (typeof value === "string")
    return value.length <= MAX_TEXT_LENGTH;
  if (Array.isArray(value))
    return value.length <= MAX_CHOICES && value.every(item => typeof item === "number");
  return false;
}

/**
 * The shape of submitted answers, checked in one pass that stops at the first problem.
 * A zod record of unions checked every value and built an error per union option, so a
 * 64 KB body of wrong values cost hundreds of milliseconds of CPU and a multi-megabyte
 * error response, before the session was even checked. sanitizeAnswers does the rest.
 */
export function isAnswersShape(value: unknown): value is Answers {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const keys = Object.keys(value);
  if (keys.length > MAX_ANSWER_FIELDS)
    return false;
  for (const key of keys) {
    if (key.length > MAX_KEY_LENGTH || !isAnswerValue((value as Record<string, unknown>)[key]))
      return false;
  }
  return true;
}
