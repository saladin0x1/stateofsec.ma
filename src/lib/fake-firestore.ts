// Test helper: an in-memory Firestore answering the REST PATCH that saveAnswers sends.
// It follows the update-mask rules: a masked field present in the body is set, a masked
// field absent from the body is deleted, an unmasked field is left alone. Anything the real
// API would refuse (unquoted field names with dashes, body fields outside the mask, unknown
// value kinds) answers 400, so a bug in how saveAnswers builds the request shows up here.
import type { Answers } from "@/lib/conditions";

export type StoredValue = number | string | null | StoredValue[];
export type StoredDocument = Record<string, StoredValue>;

interface FirestoreWrite {
  documentId: string;
  mask: string[];
  fields: StoredDocument;
}

const SIMPLE_FIELD_NAME = /^[a-z_]\w*$/i;

function parseFieldPath(path: string): string {
  if (path.startsWith("`")) {
    if (!path.endsWith("`") || path.length < 2)
      throw new Error(`Unterminated quoted field path ${path}`);
    return path.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  if (!SIMPLE_FIELD_NAME.test(path))
    throw new Error(`Field path ${path} must be backtick-quoted`);
  return path;
}

function decodeValue(value: unknown): StoredValue {
  if (typeof value !== "object" || value === null)
    throw new Error(`Invalid Firestore value ${JSON.stringify(value)}`);
  const entries = Object.entries(value) as Array<[string, unknown]>;
  if (entries.length !== 1)
    throw new Error(`Firestore value must have exactly one kind: ${JSON.stringify(value)}`);
  const [kind, inner] = entries[0];
  switch (kind) {
    case "nullValue":
      return null;
    case "integerValue":
      if (typeof inner !== "string" || !/^-?\d+$/.test(inner))
        throw new Error(`integerValue must be a decimal string, got ${JSON.stringify(inner)}`);
      return Number(inner);
    case "doubleValue":
      if (typeof inner !== "number")
        throw new Error("doubleValue must be a number");
      return inner;
    case "stringValue":
      if (typeof inner !== "string")
        throw new Error("stringValue must be a string");
      return inner;
    case "arrayValue": {
      const values = (inner as { values?: unknown[] }).values ?? [];
      return values.map(decodeValue);
    }
    default:
      throw new Error(`Unsupported Firestore value kind ${kind}`);
  }
}

const DOCUMENT_PATH = /\/documents\/results\/([^/?]+)$/;

export function createFakeFirestore() {
  const documents = new Map<string, StoredDocument>();
  const writes: FirestoreWrite[] = [];

  function applyPatch(url: URL, body: string): FirestoreWrite {
    const match = DOCUMENT_PATH.exec(url.pathname);
    if (!match)
      throw new Error(`Unexpected document path ${url.pathname}`);
    const documentId = decodeURIComponent(match[1]);
    const mask = url.searchParams.getAll("updateMask.fieldPaths").map(parseFieldPath);
    const parsed = JSON.parse(body) as { fields?: Record<string, unknown> };
    const fields: StoredDocument = {};
    for (const [name, value] of Object.entries(parsed.fields ?? {})) {
      if (!mask.includes(name))
        throw new Error(`Field ${name} is in the body but not in the update mask`);
      fields[name] = decodeValue(value);
    }
    const next: StoredDocument = { ...documents.get(documentId) };
    for (const name of mask) {
      if (Object.hasOwn(fields, name))
        next[name] = fields[name];
      else
        delete next[name];
    }
    documents.set(documentId, next);
    return { documentId, mask, fields };
  }

  async function fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (init?.method !== "PATCH")
      return new Response("only PATCH is modelled", { status: 405 });
    try {
      writes.push(applyPatch(url, String(init.body)));
      return new Response("{}", { status: 200 });
    }
    catch (error) {
      return new Response(String(error), { status: 400 });
    }
  }

  return {
    fetch,
    writes,
    // The stored answers of one respondent, without the server's own lastUpdated field.
    // saveAnswers only writes answer values (no nested lists), hence the Answers type
    answersOf(documentId: string): Answers {
      const { lastUpdated: _, ...answers } = documents.get(documentId) ?? {};
      return answers as Answers;
    },
    has(documentId: string) {
      return documents.has(documentId);
    },
    reset() {
      documents.clear();
      writes.length = 0;
    }
  };
}

export type FakeFirestore = ReturnType<typeof createFakeFirestore>;
