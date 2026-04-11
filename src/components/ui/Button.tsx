import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-primary-base bg-primary-base text-white hover:border-primary-hover hover:bg-primary-hover hover:ring-4 hover:ring-primary-light focus-visible:ring-4 focus-visible:ring-primary-light",
  secondary:
    "border-border bg-white text-text-primary hover:bg-slate-100 focus-visible:bg-slate-100",
  ghost:
    "border-transparent bg-transparent text-text-primary hover:bg-slate-100 focus-visible:bg-slate-100",
};

export function Button({
  variant = "primary",
  disabled = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-control font-medium outline-none transition-colors duration-200 focus-visible:outline-none",
        fullWidth && "w-full",
        disabled
          ? "cursor-not-allowed border-border bg-slate-200 text-text-secondary shadow-none"
          : variantClasses[variant],
        className
      )}
      {...props}
    >
      {leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
      <span>{children}</span>
      {rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </button>
  );
}
