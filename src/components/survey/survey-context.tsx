import type { ReactNode } from "react";
import type { SurveyContext } from "./survey-machine";
import type { SurveyQuestionsYamlFile } from "@/lib/validators/survey-schema";
import { createActorContext } from "@xstate/react";
import { useEffect, useMemo } from "react";
import { surveyMachine } from "./survey-machine";

const STORAGE_KEY = "survey-state";

interface PersistedState {
  version: string;
  currentSectionIdx: number;
  currentQuestionIdx: number;
  // Raw answers, hidden ones included (the machine prunes them on load)
  answers: Record<string, number | number[] | null | string>;
}

// Saved progress is only restored for the exact same questions: any survey edit changes
// question ids and positions, and resuming at a stale position can crash the form
function getStorageVersion(sections: SurveyQuestionsYamlFile[]) {
  const text = JSON.stringify(sections);
  let hash = 0;
  for (let i = 0; i < text.length; i++)
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return hash.toString(36);
}

function loadPersistedState(version: string): Partial<SurveyContext> | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored)
      return null;

    const parsed = JSON.parse(stored) as PersistedState;

    // Version check - clear if outdated
    if (parsed.version !== version) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return {
      currentSectionIdx: parsed.currentSectionIdx,
      currentQuestionIdx: parsed.currentQuestionIdx,
      rawAnswers: parsed.answers
    };
  }
  catch (error) {
    console.error("Failed to load persisted survey state:", error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function persistState(context: SurveyContext, version: string) {
  try {
    const toPersist: PersistedState = {
      version,
      currentSectionIdx: context.currentSectionIdx,
      currentQuestionIdx: context.currentQuestionIdx,
      answers: context.rawAnswers
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  }
  catch (error) {
    console.error("Failed to persist survey state:", error);
  }
}

function clearPersistedState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  }
  catch (error) {
    console.error("Failed to clear persisted survey state:", error);
  }
}

// Create the actor context
export const SurveyMachineContext = createActorContext(surveyMachine);

interface SurveyProviderProps {
  sections: SurveyQuestionsYamlFile[];
  children: ReactNode;
}

export function SurveyProvider({ sections, children }: SurveyProviderProps) {
  const persisted = loadPersistedState(getStorageVersion(sections));

  return (
    <SurveyMachineContext.Provider
      options={{
        input: {
          sections,
          persisted: persisted || undefined
        }
      }}
    >
      <PersistenceHandler />
      {children}
    </SurveyMachineContext.Provider>
  );
}

// Internal component to handle persistence side effects
function PersistenceHandler() {
  const context = SurveyMachineContext.useSelector(state => state.context);
  const value = SurveyMachineContext.useSelector(state => state.value);
  const version = useMemo(() => getStorageVersion(context.sections), [context.sections]);

  useEffect(() => {
    if (value === "complete") {
      clearPersistedState();
    }
    else {
      persistState(context, version);
    }
  }, [context, value, version]);

  return null;
}
