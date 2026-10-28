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

  return (
    <div className={`relative w-full overflow-hidden flex items-center bg-card p-3 pl-14 mb-2 transition-all duration-200 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:translate-x-1"}`}>
      <input
        className="peer sr-only"
        type={multiple ? "checkbox" : "radio"}
        id={id}
        name={name}
        value={index}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
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
        className="absolute pointer-events-none left-4 h-5 w-5 border-2 border-input bg-muted
        peer-checked:border-primary peer-checked:bg-primary peer-checked:shadow-md peer-checked:shadow-primary/50
        transition-all duration-200"
      >
      </div>
      <span
        className="pointer-events-none z-10 text-foreground
        peer-checked:font-medium
        transition-all duration-200"
      >
        {text}
      </span>
    </div>
  );
}
