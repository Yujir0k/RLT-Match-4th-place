import { useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { CloudUpload, FileCheck2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

type FileUploadProps = {
  title: string;
  description?: string;
  buttonLabel?: string;
  accept?: string;
  disabled?: boolean;
  file?: File | null;
  onFileSelect?: (file: File) => void;
};

export function FileUpload({
  title,
  description = "Перетащите CSV-файл в область загрузки или нажмите кнопку ниже.",
  buttonLabel = "Выбрать файл",
  accept = ".csv,.xlsx,.xls",
  disabled = false,
  file,
  onFileSelect,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const emitFile = (nextFile?: File) => {
    if (!nextFile || disabled) {
      return;
    }

    onFileSelect?.(nextFile);
  };

  const openNativeFilePicker = () => {
    if (disabled) {
      return;
    }

    inputRef.current?.click();
  };

  const handleZoneClick = () => {
    openNativeFilePicker();
  };

  const handleButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    openNativeFilePicker();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openNativeFilePicker();
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (!disabled) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);

    if (disabled) {
      return;
    }

    emitFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => emitFile(event.target.files?.[0])}
      />

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleZoneClick}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-[300px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-all duration-200",
          disabled && "cursor-not-allowed border-border bg-slate-100 text-text-secondary",
          !disabled &&
            !isDragActive &&
            "cursor-pointer border-border bg-white hover:bg-slate-100",
          !disabled &&
            isDragActive &&
            "border-primary-base bg-primary-light ring-4 ring-primary-light"
        )}
      >
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full",
            disabled ? "bg-slate-200 text-slate-400" : "bg-primary-light text-primary-base"
          )}
        >
          <CloudUpload className="h-8 w-8" />
        </div>

        <p className={cn("mt-5 text-control font-medium", disabled ? "text-text-secondary" : "text-text-primary")}>
          {title}
        </p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">{description}</p>

        <div className="mt-6">
          <Button variant="secondary" disabled={disabled} onClick={handleButtonClick}>
            {buttonLabel}
          </Button>
        </div>

        {file ? (
          <div className="mt-6 flex items-center gap-2 rounded-lg bg-bg-surface px-4 py-3 text-sm text-text-primary">
            <FileCheck2 className="h-4 w-4 text-primary-base" />
            <span className="font-medium">{file.name}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
