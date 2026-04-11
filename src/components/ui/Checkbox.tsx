import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
};

export function Checkbox({
  label,
  checked,
  disabled = false,
  className,
  ...props
}: CheckboxProps) {
  return (
    <label
      className={cn(
        "group inline-flex min-h-10 items-center gap-3 rounded-lg p-2",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="sr-only"
        {...props}
      />

      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200",
          checked
            ? "border-primary-base bg-primary-base text-white"
            : "border-slate-300 bg-white text-transparent",
          !disabled && "group-hover:ring-4 group-hover:ring-primary-light",
          disabled && "border-slate-200 bg-slate-100 text-slate-300"
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className={cn(
            "h-3.5 w-3.5 fill-none stroke-current stroke-[3]",
            checked ? "opacity-100" : "opacity-0"
          )}
        >
          <path d="m5 12 4 4 10-10" />
        </svg>
      </span>

      {label ? (
        <span className={cn("text-control font-medium", disabled ? "text-text-secondary" : "text-text-primary")}>
          {label}
        </span>
      ) : null}
    </label>
  );
}
