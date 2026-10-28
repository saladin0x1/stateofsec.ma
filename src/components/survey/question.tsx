import type { ChangeEvent } from "react";
import type { SurveyQuestion } from "@/lib/validators/survey-schema";
import {
  useCallback,
  useMemo
} from "react";
import { isOtherChoice } from "@/lib/other-choice";
import { Choice } from "./choice";

const GRID_LAYOUT_THRESHOLD = 10;

type AnswerValue = number | number[] | null;

interface QuestionProps {
  question: SurveyQuestion;
  // Position in the section file: part of the answer id
  index: number;
  // Number shown to the respondent: position among the questions they see, from 1
  number: number;
  sectionId: string;
  selected: boolean;
  value: AnswerValue | undefined;
  othersValue: string | undefined;
  // Indices of the choices to render; hidden choices keep their index
  visibleChoices: number[];
  // Indices of choices that clear (and are cleared by) every other choice
  exclusiveChoices: number[];
  onAnswerChange: (value: AnswerValue) => void;
  onOthersChange: (value: string) => void;
}

export function Question({
  question,
  index,
  number,
  sectionId,
  selected,
  value,
  othersValue,
  visibleChoices,
  exclusiveChoices,
  onAnswerChange,
  onOthersChange
}: QuestionProps) {
  const { label, choices } = question;
  const fitContent = visibleChoices.length > GRID_LAYOUT_THRESHOLD;

  // Check if "other" options exist
  const othersIndices = useMemo(
    () =>
      choices
        .map((c, i) => ({ text: c, index: i }))
        .filter(({ text }) => isOtherChoice(text))
        .map(({ index }) => index),
    [choices]
  );

  // Derive showOtherInput from value instead of using useEffect
  const showOtherInput = useMemo(() => {
    if (othersIndices.length === 0) {
      return false;
    }

    const valuesArray = Array.isArray(value)
      ? value
      : value !== null && value !== undefined
        ? [value]
        : [];

    return othersIndices.some(idx => valuesArray.includes(idx));
  }, [value, othersIndices]);

  const handleChoiceChange = useCallback(
    (choiceIndex: number, checked: boolean) => {
      if (question.multiple) {
        // Multiple choice: toggle in array; an exclusive choice replaces everything else
        const currentArray = Array.isArray(value) ? value : [];
        const newValue = !checked
          ? currentArray.filter(v => v !== choiceIndex)
          : exclusiveChoices.includes(choiceIndex)
            ? [choiceIndex]
            : [...currentArray.filter(v => !exclusiveChoices.includes(v)), choiceIndex];
        onAnswerChange(newValue);
      }
      else {
        // Single choice: set value
        onAnswerChange(choiceIndex);
      }
    },
    [question.multiple, value, exclusiveChoices, onAnswerChange]
  );

  const handleOthersChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onOthersChange(e.target.value);
    },
    [onOthersChange]
  );

  const isChecked = useCallback(
    (choiceIndex: number) => {
      if (question.multiple) {
        return Array.isArray(value) && value.includes(choiceIndex);
      }
      return value === choiceIndex;
    },
    [question.multiple, value]
  );

  const questionLabelId = `${sectionId}-q-${index}-label`;
  const pickedCount = Array.isArray(value) ? value.length : 0;
  const atLimit = question.max !== undefined && pickedCount >= question.max;

  return (
    <div
      className={`
        grid w-full
        ${selected ? "block animate-fadeIn" : "hidden"}
        mb-6 last:mb-0
      `}
      data-testid={`${sectionId}-q-${index}`}
    >
      <p className="mb-4 text-base font-medium">
        <label id={questionLabelId} className="block mb-2 ">
          {`${number}. ${label}`}
          {" "}
          <br />
        </label>

        <span className="font-normal text-sm pl-2.5">
          {question.multiple ? (question.max ? `- Pick up to ${question.max}` : "- Pick all that apply") : ""}
        </span>
        <span className="font-normal text-sm pl-2.5">
          {question.required ? "" : "- Click skip button if not applicable"}
        </span>
      </p>
      <div
        role="group"
        aria-labelledby={questionLabelId}
        aria-required={question.required ?? true}
        className={fitContent ? "grid md:grid-cols-2 gap-4 grid-cols-1" : ""}
      >
        {visibleChoices.map(i => (
          <Choice
            key={`${sectionId}-q-${index}-${choices[i]}`}
            text={choices[i]}
            id={`${sectionId}-q-${index}-${i}`}
            name={`${sectionId}-q-${index}`}
            index={i}
            required={question.required ?? true}
            multiple={question.multiple ?? false}
            checked={isChecked(i)}
            disabled={atLimit && !isChecked(i) && !exclusiveChoices.includes(i)}
            onChange={handleChoiceChange}
          />
        ))}
        {showOtherInput && (
          <textarea
            className="mt-4 w-full p-2 bg-card text-foreground border-2 border-input focus:ring-2 focus:ring-ring focus:border-ring placeholder:text-muted-foreground transition-colors"
            placeholder="Please specify... use comma to separate each item (max 200 characters)"
            rows={3}
            maxLength={200}
            value={othersValue || ""}
            onChange={handleOthersChange}
            data-testid={`${sectionId}-q-${index}-others`}
          />
        )}
      </div>
    </div>
  );
}
