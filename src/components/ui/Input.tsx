import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export function Input({
  label,
  hint,
  error,
  leftIcon,
  rightIcon,
  disabled,
  className,
  ...props
}: InputProps) {
  const hasError = Boolean(error);

  return (
    <label className="flex w-full flex-col gap-2">
      {label ? (
        <span className="text-sm font-medium text-text-primary">{label}</span>
      ) : null}

      <span className="relative flex items-center">
        {leftIcon ? (
          <span className="pointer-events-none absolute left-4 text-text-secondary">
            {leftIcon}
          </span>
        ) : null}

        <input
          disabled={disabled}
          aria-invalid={hasError}
          className={cn(
            "min-h-10 w-full rounded-lg border bg-white px-4 py-2 text-control font-medium text-text-primary outline-none transition-colors duration-200 placeholder:text-text-secondary",
            leftIcon ? "pl-11" : undefined,
            rightIcon ? "pr-11" : undefined,
            hasError
              ? "border-red-600 hover:bg-slate-100 focus:border-red-600"
              : "border-border hover:bg-slate-100 focus:border-slate-300 focus:bg-white",
            disabled &&
              "cursor-not-allowed border-border bg-slate-100 text-text-secondary placeholder:text-text-secondary",
            className
          )}
          {...props}
        />

        {rightIcon ? (
          <span className="pointer-events-none absolute right-4 text-text-secondary">
            {rightIcon}
          </span>
        ) : null}
      </span>

      {error || hint ? (
        <span className={cn("text-sm", hasError ? "text-red-600" : "text-text-secondary")}>
          {error || hint}
        </span>
      ) : null}
    </label>
  );
}
