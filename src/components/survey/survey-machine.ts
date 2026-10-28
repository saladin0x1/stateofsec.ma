import type { SurveyQuestionsYamlFile } from "@/lib/validators/survey-schema";
import { assign, fromPromise, raise, setup } from "xstate";
import {
  getFirstVisibleQuestionIndex,
  getLastVisibleQuestionIndex,
  getNextVisibleQuestionIndex,
  getPrevVisibleQuestionIndex,
  getSoftCheckMessage,
  getVisibleSectionIndices,
  hasNextVisibleQuestion,
  hasPrevVisibleQuestion,
  pruneHiddenAnswers
} from "@/lib/conditions";
import { goToThanksPage, submitAnswers } from "./utils";

const ERROR_TIMEOUT_MS = 3000;

export interface SurveyContext {
  sections: SurveyQuestionsYamlFile[];
  currentSectionIdx: number;
  currentQuestionIdx: number;
  // Everything the respondent picked, including answers an earlier change now hides, so
  // changing an answer back restores what depended on it
  rawAnswers: Record<string, number | number[] | null | string>;
  // The visible answers only (rawAnswers pruned): drives the form and is what gets submitted
  answers: Record<string, number | number[] | null | string>;
  error: string | null;
  // "Is that right?" message shown for a rare pick, until confirmed or changed
  softCheck: string | null;
  // Picks already confirmed ("questionId:choice"), so the check is not asked twice
  confirmedChecks: string[];
  visibleSectionIndices: number[];
}

export type SurveyEvents
  = | { type: "NEXT" }
    | { type: "BACK" }
    | { type: "SKIP" }
    | {
      type: "ANSWER_CHANGE";
      questionId: string;
      value: number | number[] | null | string;
    }
    | { type: "GO_TO_SECTION"; sectionIdx: number }
    | { type: "GO_TO_QUESTION"; sectionIdx: number; questionIdx: number }
    | { type: "CLEAR_ERROR" }
    | { type: "CONFIRM_SOFT_CHECK" }
    | { type: "DISMISS_SOFT_CHECK" };

// The current question's id and answer
function currentAnswer(context: SurveyContext) {
  const section = context.sections[context.currentSectionIdx];
  const questionId = `${section.label}-q-${context.currentQuestionIdx}`;
  return {
    question: section.questions[context.currentQuestionIdx],
    questionId,
    value: context.answers[questionId]
  };
}

// Identifies a confirmed soft check: the question and the pick that triggered it
function softCheckKey(context: SurveyContext) {
  const { questionId, value } = currentAnswer(context);
  return `${questionId}:${String(value)}`;
}

export const ERRORS = {
  none: null,
  required: "Please select an option.",
  submission: "Error submitting your answers, please try again."
} as const;

const MAX_OTHERS_LENGTH = 200;

// "Other" text as the server takes it: at most 200 UTF-16 units (its limit), cut without
// splitting an emoji in half, and with any lone surrogate replaced: half a character is not
// valid text and would be stored as such
function toOthersText(value: unknown) {
  if (typeof value !== "string")
    return "";
  let text = value.slice(0, MAX_OTHERS_LENGTH);
  const last = text.charCodeAt(text.length - 1);
  if (value.length > MAX_OTHERS_LENGTH && last >= 0xD800 && last <= 0xDBFF)
    text = text.slice(0, -1);
  return text.replace(/\p{Cs}/gu, "�");
}

// Normalize answers for backend submission
function normalizeAnswers(answers: Record<string, number | number[] | null | string | boolean>) {
  const convertedAnswers: Record<string, number | number[] | null | string>
    = {};

  for (const [key, value] of Object.entries(answers)) {
    if (key.endsWith("others")) {
      convertedAnswers[key] = toOthersText(value);
    }
    else if (value === null) {
      convertedAnswers[key] = null;
    }
    else if (Array.isArray(value)) {
      convertedAnswers[key] = value;
    }
    else if (typeof value === "boolean") {
      // skipping a question with multiple choices will return boolean
      convertedAnswers[key] = [];
    }
    else {
      convertedAnswers[key] = value;
    }
  }

  return convertedAnswers;
}

// Scroll to section on mobile
function scrollToSection(selector: string) {
  if (document.body.clientWidth < 600) {
    document.querySelector(selector)?.scrollIntoView?.({ behavior: "smooth" });
  }
}

export const surveyMachine = setup({
  types: {
    context: {} as SurveyContext,
    events: {} as SurveyEvents,
    input: {} as {
      sections: SurveyQuestionsYamlFile[];
      persisted?: Partial<SurveyContext>;
    }
  },
  guards: {
    isRequiredAndEmpty: ({ context }) => {
      const section = context.sections[context.currentSectionIdx];
      const question = section.questions[context.currentQuestionIdx];
      if (!question.required)
        return false;

      const questionId = `${section.label}-q-${context.currentQuestionIdx}`;
      const value = context.answers[questionId];
      return value == null || (Array.isArray(value) && !value.length);
    },
    needsSoftCheck: ({ context }) => {
      const { question, value } = currentAnswer(context);
      return getSoftCheckMessage(question, value, context.answers) !== undefined
        && !context.confirmedChecks.includes(softCheckKey(context));
    },
    isLastQuestion: ({ context }) => {
      const section = context.sections[context.currentSectionIdx];
      return !hasNextVisibleQuestion(
        section.questions,
        context.currentQuestionIdx,
        context.answers
      );
    },
    isNotLastQuestion: ({ context }) => {
      const section = context.sections[context.currentSectionIdx];
      return hasNextVisibleQuestion(
        section.questions,
        context.currentQuestionIdx,
        context.answers
      );
    },
    isLastSection: ({ context }) => {
      return (
        context.currentSectionIdx
        === context.visibleSectionIndices[context.visibleSectionIndices.length - 1]
      );
    },
    isNotLastSection: ({ context }) => {
      return (
        context.currentSectionIdx
        !== context.visibleSectionIndices[context.visibleSectionIndices.length - 1]
      );
    },
    canGoBackInSection: ({ context }) => {
      const section = context.sections[context.currentSectionIdx];
      return hasPrevVisibleQuestion(
        section.questions,
        context.currentQuestionIdx,
        context.answers
      );
    },
    canGoBackToSection: ({ context }) => {
      const section = context.sections[context.currentSectionIdx];
      const hasPrevInSection = hasPrevVisibleQuestion(
        section.questions,
        context.currentQuestionIdx,
        context.answers
      );
      const currentVisibleSectionIdx = context.visibleSectionIndices.indexOf(
        context.currentSectionIdx
      );
      return !hasPrevInSection && currentVisibleSectionIdx > 0;
    }
  },
  actions: {
    computeVisibleIndices: assign({
      visibleSectionIndices: ({ context }) =>
        getVisibleSectionIndices(context.sections, context.answers)
    }),
    updateAnswer: assign(({ context, event }) => {
      if (event.type !== "ANSWER_CHANGE")
        return {};
      const rawAnswers = { ...context.rawAnswers, [event.questionId]: event.value };
      return { rawAnswers, answers: pruneHiddenAnswers(context.sections, rawAnswers) };
    }),
    incrementQuestion: assign({
      currentQuestionIdx: ({ context }) => {
        const section = context.sections[context.currentSectionIdx];
        const next = getNextVisibleQuestionIndex(
          section.questions,
          context.currentQuestionIdx,
          context.answers
        );
        return next ?? context.currentQuestionIdx;
      }
    }),
    decrementQuestion: assign({
      currentQuestionIdx: ({ context }) => {
        const section = context.sections[context.currentSectionIdx];
        const prev = getPrevVisibleQuestionIndex(
          section.questions,
          context.currentQuestionIdx,
          context.answers
        );
        return prev ?? context.currentQuestionIdx;
      }
    }),
    incrementSection: assign({
      currentSectionIdx: ({ context }) => {
        const currentIdx = context.visibleSectionIndices.indexOf(
          context.currentSectionIdx
        );
        const nextVisibleIdx = context.visibleSectionIndices[currentIdx + 1];
        return nextVisibleIdx ?? context.currentSectionIdx;
      },
      currentQuestionIdx: ({ context }) => {
        const currentIdx = context.visibleSectionIndices.indexOf(
          context.currentSectionIdx
        );
        const nextSectionIdx = context.visibleSectionIndices[currentIdx + 1];
        if (nextSectionIdx != null) {
          const nextSection = context.sections[nextSectionIdx];
          const firstVisible = getFirstVisibleQuestionIndex(
            nextSection.questions,
            context.answers
          );
          return firstVisible ?? 0;
        }
        return 0;
      }
    }),
    goToLastQuestionInPreviousSection: assign({
      currentSectionIdx: ({ context }) => {
        const currentIdx = context.visibleSectionIndices.indexOf(
          context.currentSectionIdx
        );
        const prevVisibleIdx = context.visibleSectionIndices[currentIdx - 1];
        return prevVisibleIdx ?? context.currentSectionIdx;
      },
      currentQuestionIdx: ({ context }) => {
        const currentIdx = context.visibleSectionIndices.indexOf(
          context.currentSectionIdx
        );
        const prevSectionIdx = context.visibleSectionIndices[currentIdx - 1];
        if (prevSectionIdx != null) {
          const prevSection = context.sections[prevSectionIdx];
          const lastVisible = getLastVisibleQuestionIndex(
            prevSection.questions,
            context.answers
          );
          return lastVisible ?? 0;
        }
        return 0;
      }
    }),
    setRequiredError: assign({
      error: ERRORS.required
    }),
    setSubmissionError: assign({
      error: ERRORS.submission
    }),
    clearError: assign({
      error: ERRORS.none
    }),
    showSoftCheck: assign({
      softCheck: ({ context }) => {
        const { question, value } = currentAnswer(context);
        return getSoftCheckMessage(question, value, context.answers) ?? null;
      }
    }),
    confirmSoftCheck: assign({
      confirmedChecks: ({ context }) => [...context.confirmedChecks, softCheckKey(context)],
      softCheck: null
    }),
    clearSoftCheck: assign({
      softCheck: null
    }),
    scrollToTop: () => {
      scrollToSection("#steps");
    },
    goToThanksPage,
    goToSection: assign({
      currentSectionIdx: ({ event }) => {
        if (event.type !== "GO_TO_SECTION")
          return 0;
        return event.sectionIdx;
      },
      currentQuestionIdx: ({ context, event }) => {
        if (event.type !== "GO_TO_SECTION")
          return 0;
        const section = context.sections[event.sectionIdx];
        return getFirstVisibleQuestionIndex(section.questions, context.answers) ?? 0;
      }
    }),
    goToQuestion: assign({
      currentSectionIdx: ({ event }) => {
        if (event.type !== "GO_TO_QUESTION")
          return 0;
        return event.sectionIdx;
      },
      currentQuestionIdx: ({ event }) => {
        if (event.type !== "GO_TO_QUESTION")
          return 0;
        return event.questionIdx;
      }
    })
  },
  actors: {
    submitSection: fromPromise(
      async ({
        input
      }: {
        input: { answers: Record<string, number | number[] | null | string>; section: string };
      }) => {
        const normalizedAnswers = normalizeAnswers(input.answers);
        const result = await submitAnswers({ answers: normalizedAnswers, section: input.section });
        if (result.error) {
          throw new Error("Submission failed");
        }
        return result;
      }
    )
  },
  delays: {
    ERROR_TIMEOUT: ERROR_TIMEOUT_MS
  }
}).createMachine({
  id: "survey",
  initial: "answering",
  context: ({ input }) => {
    const sections = input.sections;
    const rawAnswers = input.persisted?.rawAnswers ?? {};
    const answers = pruneHiddenAnswers(sections, rawAnswers);

    return {
      sections,
      currentSectionIdx: input.persisted?.currentSectionIdx ?? 0,
      currentQuestionIdx: input.persisted?.currentQuestionIdx ?? 0,
      rawAnswers,
      answers,
      error: null,
      softCheck: null,
      confirmedChecks: [],
      visibleSectionIndices: getVisibleSectionIndices(sections, answers)
    };
  },
  states: {
    answering: {
      entry: ["computeVisibleIndices"],
      after: {
        ERROR_TIMEOUT: {
          guard: ({ context }) => !!context.error,
          actions: ["clearError"]
        }
      },
      on: {
        CLEAR_ERROR: {
          actions: ["clearError"]
        },
        ANSWER_CHANGE: {
          actions: ["updateAnswer", "computeVisibleIndices", "clearError", "clearSoftCheck"]
        },
        CONFIRM_SOFT_CHECK: {
          actions: ["confirmSoftCheck", raise({ type: "NEXT" })]
        },
        DISMISS_SOFT_CHECK: {
          actions: ["clearSoftCheck"]
        },
        NEXT: [
          {
            guard: "isRequiredAndEmpty",
            target: "answering",
            reenter: true,
            actions: ["setRequiredError"]
          },
          {
            guard: "needsSoftCheck",
            actions: ["showSoftCheck", "clearError"]
          },
          {
            guard: "isLastQuestion",
            target: "submitting",
            actions: ["clearError"]
          },
          {
            guard: "isNotLastQuestion",
            actions: ["incrementQuestion", "scrollToTop", "clearError"]
          }
        ],
        SKIP: [
          {
            guard: "isLastQuestion",
            target: "submitting",
            actions: ["clearError"]
          },
          {
            guard: "isNotLastQuestion",
            actions: ["incrementQuestion", "scrollToTop", "clearError"]
          }
        ],
        BACK: [
          {
            guard: "canGoBackInSection",
            actions: ["decrementQuestion", "scrollToTop", "clearError", "clearSoftCheck"]
          },
          {
            guard: "canGoBackToSection",
            actions: [
              "goToLastQuestionInPreviousSection",
              "scrollToTop",
              "clearError",
              "clearSoftCheck"
            ]
          }
        ],
        GO_TO_SECTION: {
          actions: ["goToSection", "scrollToTop", "clearError", "clearSoftCheck"]
        },
        GO_TO_QUESTION: {
          actions: ["goToQuestion", "scrollToTop", "clearError", "clearSoftCheck"]
        }
      }
    },
    submitting: {
      invoke: {
        src: "submitSection",
        input: ({ context }) => ({
          answers: context.answers,
          section: context.sections[context.currentSectionIdx].label
        }),
        onDone: [
          {
            guard: "isLastSection",
            target: "complete"
          },
          {
            guard: "isNotLastSection",
            target: "answering",
            actions: ["incrementSection", "scrollToTop"]
          }
        ],
        onError: {
          target: "answering",
          actions: ["setSubmissionError"]
        }
      }
    },
    complete: {
      type: "final",
      entry: ["goToThanksPage"]
    }
  }
});
