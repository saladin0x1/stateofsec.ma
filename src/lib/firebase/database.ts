import { getAccessToken, getProjectId } from "./server";

type AnswerValue = number | string | number[] | null;

interface Answers {
  [key: string]: AnswerValue;
}

type FirestoreValue
  = | { nullValue: null }
    | { integerValue: string }
    | { doubleValue: number }
    | { stringValue: string }
    | { arrayValue: { values: FirestoreValue[] } };

function toFirestoreValue(value: AnswerValue): FirestoreValue {
  if (value === null)
    return { nullValue: null };
  if (typeof value === "string")
    return { stringValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  return Number.isInteger(value)
    ? { integerValue: value.toString() }
    : { doubleValue: value };
}

// Names outside [A-Za-z_][A-Za-z0-9_]*, like "profile-q-0", must be backtick-quoted
function toFieldPath(name: string) {
  return /^[a-z_]\w*$/i.test(name)
    ? name
    : `\`${name.replace(/[`\\]/g, "\\$&")}\``;
}

// PATCH with an update mask behaves like set(..., { merge: true }): fields outside
// the mask are left untouched and the document is created if it does not exist.
// Fields listed in the mask but absent from the body are deleted.
export async function saveAnswers(userId: string, answers: Answers, fieldsToDelete: string[] = []) {
  const data: Answers = {
    ...answers,
    lastUpdated: new Date().toISOString()
  };

  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${getProjectId()}/databases/(default)/documents/results/${encodeURIComponent(userId)}`
  );
  for (const name of [...Object.keys(data), ...fieldsToDelete])
    url.searchParams.append("updateMask.fieldPaths", toFieldPath(name));

  const fields = Object.fromEntries(
    Object.entries(data).map(([name, value]) => [name, toFirestoreValue(value)])
  );

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });
  if (!response.ok)
    throw new Error(`Firestore write failed with status ${response.status}`);
}
