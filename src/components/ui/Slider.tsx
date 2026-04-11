import { cn } from "../../lib/cn";

type SliderProps = {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
};

export function Slider({
  label,
  min = 0,
  max = 100,
  step = 1,
  value,
  disabled = false,
  onValueChange,
}: SliderProps) {
  const safeValue = Math.max(min, Math.min(max, value));
  const percent = ((safeValue - min) / (max - min)) * 100;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between gap-4">
        {label ? (
          <span className="text-sm font-medium text-text-primary">{label}</span>
        ) : (
          <span />
        )}
        <span className="text-sm text-text-secondary">{safeValue}%</span>
      </div>

      <div className={cn("relative flex h-10 items-center", disabled && "cursor-not-allowed")}>
        <div className="absolute left-0 right-0 h-2 rounded-full bg-slate-100" />
        <div
          className={cn("absolute left-0 h-2 rounded-full", disabled ? "bg-slate-300" : "bg-primary-base")}
          style={{ width: `${percent}%` }}
        />
        <div
          className={cn(
            "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 bg-white shadow-sm",
            disabled ? "border-slate-300" : "border-primary-base"
          )}
          style={{ left: `calc(${percent}% - 10px)` }}
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          disabled={disabled}
          onChange={(event) => onValueChange(Number(event.target.value))}
          className="absolute inset-0 z-10 h-10 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
