import { describe, expect, it, vi } from "vitest";
import { InvalidAnswersError, sanitizeAnswers } from "./answers";

vi.mock("@/lib/survey", () => ({
  surveySections: [
    {
      title: "Profile",
      label: "profile",
      position: 1,
      questions: [
        { label: "Age", required: true, multiple: false, choices: ["Under 18", "18-24", "25+"] },
        {
          label: "Experience",
          required: true,
          multiple: false,
          showIf: { question: "profile-q-0", notEquals: 0 },
          choices: ["None", "1-4 years", "12+ years"],
          optionShowIf: [{ options: ["12+ years"], showIf: { question: "profile-q-0", notEquals: 1 } }]
        }
      ]
    },
    {
      title: "Learning",
      label: "learning",
      position: 2,
      questions: [
        {
          label: "Certifications",
          required: true,
          multiple: true,
          choices: ["None yet", "Security+", "CISSP", "Other"],
          exclusive: ["None yet"],
          optionShowIf: [{ options: ["CISSP"], showIf: { question: "profile-q-1", in: [1, 2] } }]
        },
        {
          label: "Seniority",
          required: false,
          multiple: false,
          showIf: { all: [{ question: "profile-q-0", notEquals: 0 }, { question: "profile-q-1", notEquals: 0 }] },
          choices: ["Junior", "Senior"]
        }
      ]
    }
  ]
}));

describe("sanitizeAnswers", () => {
  it("rejects an exclusive choice combined with others", () => {
    expect(() => sanitizeAnswers({ "profile-q-0": 2, "learning-q-0": [0, 1] })).toThrow(InvalidAnswersError);
  });

  it("keeps an exclusive choice picked alone", () => {
    expect(sanitizeAnswers({ "profile-q-0": 2, "learning-q-0": [0] }).toSave["learning-q-0"]).toEqual([0]);
  });

  it("filters picks of choices hidden for this respondent", () => {
    const { toSave } = sanitizeAnswers({ "profile-q-0": 2, "profile-q-1": 0, "learning-q-0": [1, 2] });
    expect(toSave["learning-q-0"]).toEqual([1]);
  });

  it("deletes a required answer whose only pick is now hidden, and what it gated", () => {
    const { toSave, toDelete } = sanitizeAnswers({ "profile-q-0": 1, "profile-q-1": 2, "learning-q-1": 1 });
    expect(toSave).toEqual({ "profile-q-0": 1 });
    expect(toDelete).toEqual(expect.arrayContaining(["profile-q-1", "learning-q-1"]));
  });

  it("drops an empty required answer instead of blocking the whole submit", () => {
    const { toSave, toDelete } = sanitizeAnswers({ "profile-q-0": 2, "learning-q-0": [] });
    expect(toSave).toEqual({ "profile-q-0": 2 });
    expect(toDelete).toContain("learning-q-0");
  });

  it("deletes stored fields the client no longer sends", () => {
    const { toDelete } = sanitizeAnswers({ "profile-q-0": 0 });
    expect(toDelete).toEqual(["profile-q-1", "learning-q-0", "learning-q-0-others", "learning-q-1"]);
  });

  it("evaluates all-of conditions on the server", () => {
    expect(sanitizeAnswers({ "profile-q-0": 2, "profile-q-1": 1, "learning-q-1": 1 }).toSave["learning-q-1"]).toBe(1);
    expect(sanitizeAnswers({ "profile-q-0": 2, "profile-q-1": 0, "learning-q-1": 1 }).toDelete).toContain("learning-q-1");
  });
});
