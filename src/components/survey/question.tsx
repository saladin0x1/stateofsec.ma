import type { ChangeEvent } from "react";
import type { SurveyQuestion } from "@/lib/validators/survey-schema";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from "react";
import { isOtherChoice } from "@/lib/other-choice";
import { Choice } from "./choice";

const GRID_LAYOUT_THRESHOLD = 10;
// Space between the options box and the pinned Back/Next bar (its mt-3)
const OPTIONS_BOX_GAP = 12;
// About five rows: the box never gets smaller, even on a phone held sideways
const OPTIONS_BOX_MIN_HEIGHT = 240;

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

  // Grouped display: choices under their group header (in group order), ungrouped last.
  // Purely presentational - indices and answers are untouched.
  const grouped: Array<{ header?: string; indices: number[] }> = [];
  if (question.groups?.length) {
    const groupedChoices = new Set(question.groups.flatMap(g => g.choices));
    for (const group of question.groups) {
      const indices = group.choices
        .map(choice => choices.indexOf(choice))
        .filter(index => index !== -1 && visibleChoices.includes(index));
      if (indices.length)
        grouped.push({ header: group.label, indices });
    }
    const rest = visibleChoices.filter(index => !groupedChoices.has(choices[index]));
    if (rest.length)
      grouped.push({ indices: rest });
  }
  else {
    grouped.push({ indices: visibleChoices });
  }

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

  // Long lists scroll inside their own box sized to the screen, so the page stays put.
  // Height and fade are set on the DOM directly: no re-render on every scroll
  const optionsRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const othersInputRef = useRef<HTMLTextAreaElement>(null);

  // The fade shows while more options are hidden below (8px slack: the box's own padding plus rounding)
  const updateFade = useCallback(() => {
    const box = optionsRef.current;
    if (box && fadeRef.current)
      fadeRef.current.hidden = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
  }, []);

  useLayoutEffect(() => {
    const fit = () => {
      const box = optionsRef.current;
      const steps = document.getElementById("steps");
      if (!box || !steps)
        return;
      // Where the box sits now (the header is still on screen after a reload), but never higher
      // than with the steps bar at the top of the screen, where every question change scrolls
      const boxTop = box.getBoundingClientRect().top;
      const top = Math.max(boxTop, boxTop - steps.getBoundingClientRect().top);
      const bar = document.getElementById("survey-actions")?.offsetHeight ?? 0;
      box.style.maxHeight = `${Math.max(OPTIONS_BOX_MIN_HEIGHT, window.innerHeight - top - bar - OPTIONS_BOX_GAP)}px`;
      updateFade();
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, { passive: true });
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit);
    };
  }, [updateFade]);

  // The list grows or shrinks with the answers ("Other" field, choices hidden by earlier answers)
  useEffect(() => {
    updateFade();
  }, [updateFade, visibleChoices.length, showOtherInput]);

  // "Other" opens its text field at the end of the box: bring it into view
  useEffect(() => {
    if (showOtherInput)
      othersInputRef.current?.scrollIntoView({ block: "nearest" });
  }, [showOtherInput]);

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
      {/* Pinned while a long list scrolls under it, so only the options move (Back/Next is pinned at the bottom) */}
      <p className="sticky top-0 z-20 mb-3 border-b-2 border-border bg-background py-3 text-base font-medium">
        <label id={questionLabelId} className="block mb-1">
          {`${number}. ${label}`}
        </label>
        <span className="font-normal text-xs text-muted-foreground">
          {question.multiple ? (question.max ? `Pick up to ${question.max}` : "Pick all that apply") : ""}
          {question.multiple && !question.required ? " · " : ""}
          {!question.required ? "Optional - skip if not applicable" : ""}
        </span>
      </p>
      <div
        ref={optionsRef}
        role="group"
        aria-labelledby={questionLabelId}
        aria-required={question.required ?? true}
        onScroll={updateFade}
        // -m-1 p-1 leaves room for the checked ring and the hover nudge inside the scroll box
        className={`-m-1 p-1 overflow-y-auto overflow-x-hidden overscroll-contain ${
          // Column gap only: rows keep the same spacing as short lists (each choice has its own margin)
          // auto-rows-max: a capped box must not shrink rows (the "Other" field collapsed without it)
          fitContent && !grouped.some(g => g.header) ? "grid auto-rows-max md:grid-cols-2 gap-x-2 grid-cols-1" : ""
        }`}
      >
        {grouped.map((group, groupIndex) => (
          <div key={group.header ?? `ungrouped-${groupIndex}`} className={group.header ? "" : "contents"}>
            {group.header && (
              <div className="mt-4 mb-1.5 first:mt-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.header}
              </div>
            )}
            {group.indices.map(i => (
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
          </div>
        ))}
        {showOtherInput && (
          <textarea
            ref={othersInputRef}
            className="col-span-full mt-4 w-full p-2 bg-card text-foreground border-2 border-input focus:ring-2 focus:ring-ring focus:border-ring placeholder:text-muted-foreground transition-colors"
            placeholder="Please specify... use comma to separate each item (max 200 characters)"
            rows={3}
            maxLength={200}
            value={othersValue || ""}
            onChange={handleOthersChange}
            data-testid={`${sectionId}-q-${index}-others`}
          />
        )}
        {/* Fades the last visible rows while more options are hidden below */}
        <div
          ref={fadeRef}
          aria-hidden="true"
          className="pointer-events-none sticky bottom-0 col-span-full -mt-12 h-12 bg-gradient-to-t from-background to-transparent"
        />
      </div>
    </div>
  );
}
