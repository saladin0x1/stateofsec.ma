import type { AnswerValue } from "../../src/lib/conditions";

// Question ids are positional: fields.test.ts checks each id still holds the expected question
export const F = {
  gender: "profile-q-0",
  age: "profile-q-1",
  region: "profile-q-2",
  country: "profile-q-3",
  education: "profile-q-4",
  experience: "profile-q-5",
  employment: "profile-q-6",
  domain: "roles-q-0",
  seniority: "roles-q-1",
  bountyStatus: "roles-q-2",
  certifications: "learning-q-0",
  incomeMad: "work-q-0",
  incomeTjm: "work-q-1",
  incomeUsdYear: "work-q-2",
  incomeUsdDay: "work-q-3",
  orgType: "work-q-4",
  bountyEarnings: "work-q-9",
  flawNoticed: "community-q-3",
  flawReported: "community-q-4",
  flawWhyNot: "community-q-5",
  flawResponse: "community-q-6",
  askedToHide: "community-q-7"
} as const;

export const EXPECTED_LABELS: Record<string, string> = {
  [F.gender]: "gender",
  [F.age]: "age",
  [F.region]: "located",
  [F.country]: "Which country",
  [F.education]: "IT or security education",
  [F.experience]: "How many years have you worked in security",
  [F.employment]: "employment situation",
  [F.domain]: "security domain",
  [F.seniority]: "seniority",
  [F.bountyStatus]: "take part in bug bounty",
  [F.certifications]: "certifications do you hold",
  [F.incomeMad]: "Net monthly income in MAD",
  [F.incomeTjm]: "daily rate (TJM) in MAD",
  [F.incomeUsdYear]: "Gross yearly salary in USD",
  [F.incomeUsdDay]: "daily rate in USD",
  [F.orgType]: "type of organization",
  [F.bountyEarnings]: "Bug bounty earnings",
  [F.flawNoticed]: "have you noticed security flaws",
  [F.flawReported]: "Did you report",
  [F.flawWhyNot]: "Why did you not report",
  [F.flawResponse]: "what did you get back",
  [F.askedToHide]: "has an employer or client asked you to hide"
};

const PAY = [F.incomeMad, F.incomeTjm, F.incomeUsdYear, F.incomeUsdDay];

// Quasi-identifiers: what someone who knows a respondent could already know about them
export const S1 = [F.gender, F.age, F.region];
export const S2 = [...S1, F.education, F.experience, F.employment];
export const S3 = [...S2, F.domain, F.seniority, F.orgType, ...PAY, F.bountyStatus];
// Minors: every identifying field they can answer (no education, experience or job questions)
export const MINOR_QI = [F.gender, F.age, F.region, F.domain, F.bountyStatus, F.bountyEarnings, F.certifications];
// The raw data also has the country of people abroad; the public file never does
export const S1_RAW = [...S1, F.country];

// The sensitive block, published only in the separate flaw file
export const FLAW_BLOCK = [F.flawNoticed, F.flawReported, F.flawWhyNot, F.flawResponse, F.askedToHide];
export const FLAW_AGE = "age-group";
export const FLAW_REGION = "region-group";

export type Row = Record<string, AnswerValue | undefined>;

const ABROAD_REGIONS = new Set([12, 13, 14, 15]);

export function isMinor(raw: Row) {
  return raw[F.age] === 0;
}
export function isAbroad(raw: Row) {
  const region = raw[F.region];
  return typeof region === "number" && ABROAD_REGIONS.has(region);
}

export const STRATA: Record<string, (raw: Row) => boolean> = {
  "all": () => true,
  "minors": isMinor,
  "women": raw => raw[F.gender] === 1,
  "abroad": isAbroad,
  // Management domain or the Head of security / CISO seniority (raw, before the merge)
  "CISO/heads": raw => raw[F.domain] === 9 || raw[F.seniority] === 5
};
