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

const CREATE_TIMEOUT_MS = 5000;

/**
 * Creates `<collection>/<documentId>` only if it does not exist yet: true when this call
 * created it, false when it was already there. Firestore decides atomically, so of many
 * parallel calls with the same id exactly one gets true.
 */
export async function createDocumentOnce(
  collection: string,
  documentId: string,
  fields: Record<string, { timestampValue: string } | { stringValue: string }>
): Promise<boolean> {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${getProjectId()}/databases/(default)/documents/${encodeURIComponent(collection)}`
  );
  url.searchParams.set("documentId", documentId);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields }),
    signal: AbortSignal.timeout(CREATE_TIMEOUT_MS)
  });
  if (response.ok)
    return true;
  // 409 is both ALREADY_EXISTS (the answer we look for) and ABORTED (contention, an error)
  if (response.status === 409) {
    const body = await response.json().catch(() => undefined) as { error?: { status?: string } } | undefined;
    if (body?.error?.status === "ALREADY_EXISTS")
      return false;
  }
  throw new Error(`Firestore create failed with status ${response.status}`);
}
