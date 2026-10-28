import type { ChangeEvent } from "react";

interface ChoiceProps {
  text: string;
  id: string;
  index: number;
  name: string;
  required: boolean;
  multiple: boolean;
  checked: boolean;
  disabled?: boolean;
  onChange: (index: number, checked: boolean) => void;
}

export function Choice({
  text,
  id,
  index,
  name,
  multiple,
  checked,
  disabled = false,
  onChange
}: ChoiceProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(index, e.target.checked);
  };

  const textId = `${id}-text`;

  return (
    // min-h-11: every row stays a 44px tap target (WCAG 2.5.5) even with compact padding
    <div className={`relative w-full min-h-11 overflow-hidden flex items-center bg-card py-2.5 pl-12 pr-3 mb-1.5 transition-all duration-200 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:translate-x-1"}`}>
      <input
        className="peer sr-only"
        type={multiple ? "checkbox" : "radio"}
        id={id}
        name={name}
        value={index}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        // The <label> is an empty click overlay, so the option text names the input
        aria-labelledby={textId}
        data-testid={id}
      />
      <label
        className="absolute inset-0 cursor-[inherit]
          peer-checked:border-primary peer-checked:bg-gradient-to-r peer-checked:from-primary/15 peer-checked:to-primary/5
          peer-checked:ring-2 peer-checked:ring-primary/30 peer-checked:ring-offset-2 peer-checked:ring-offset-background
          border-2 border-input
          hover:border-primary/50
          peer-focus-visible:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/60
          transition-all duration-200"
        htmlFor={id}
      >
      </label>
      <div
        className="absolute pointer-events-none left-3.5 h-4 w-4 border-2 border-input bg-muted
        peer-checked:border-primary peer-checked:bg-primary peer-checked:shadow-md peer-checked:shadow-primary/50
        transition-all duration-200"
      >
      </div>
      <span
        id={textId}
        className="pointer-events-none z-10 text-sm md:text-base text-foreground
        peer-checked:font-medium
        transition-all duration-200"
      >
        {text}
      </span>
    </div>
  );
}
