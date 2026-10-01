"use client";

import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

const MAX_SIZE_BYTES = 500 * 1024 * 1024;

const ACCEPT = {
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/x-m4a": [".m4a"],
  "audio/mp4": [".m4a", ".mp4"],
  "audio/webm": [".webm"],
  "audio/ogg": [".ogg", ".oga"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
};

export interface DropzoneProps {
  onFilePicked: (file: File) => void;
  disabled?: boolean;
  /** When set, the zone shows an upload progress bar instead of the prompt. */
  uploading?: boolean;
  /** 0–100; 100 (or null while uploading) renders the "finalizing" state. */
  progress?: number | null;
  className?: string;
}

export function Dropzone({
  onFilePicked,
  disabled,
  uploading,
  progress,
  className,
}: DropzoneProps) {
  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        const first = rejections[0];
        const code = first.errors[0]?.code;
        if (code === "file-too-large") {
          toast.error("حجم فایل بیش از حد مجاز است (حداکثر ۵۰۰ مگابایت)");
        } else if (code === "file-invalid-type") {
          toast.error("نوع فایل پشتیبانی نمی‌شود");
        } else {
          toast.error("فایل قابل قبول نیست");
        }
        return;
      }
      const file = accepted[0];
      if (file) onFilePicked(file);
    },
    [onFilePicked],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: ACCEPT,
      maxSize: MAX_SIZE_BYTES,
      maxFiles: 1,
      multiple: false,
      disabled,
    });

  const pct = Math.max(0, Math.min(100, progress ?? 0));
  const finalizing = uploading && pct >= 100;

  return (
    <div
      {...getRootProps({
        className: cn(
          "group flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-line bg-bg-soft p-4 text-center transition-all sm:p-6",
          !uploading && "cursor-pointer hover:border-brand/50 hover:bg-brand-soft",
          isDragActive && "border-brand bg-brand-soft ring-3 ring-brand/15",
          isDragReject && "border-destructive bg-destructive/5",
          uploading && "cursor-default border-brand/40 bg-brand-soft",
          disabled && !uploading && "cursor-not-allowed opacity-60",
          className,
        ),
      })}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <div className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
            <Upload className="size-5 animate-pulse" />
          </div>
          <div className="w-full space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-ink-3">
              <span>
                {finalizing ? "در حال نهایی‌سازی…" : "در حال بارگذاری…"}
              </span>
              <span className="tabular-nums font-medium text-ink-2">{pct}٪</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
              <div
                className={cn(
                  "h-full rounded-full bg-brand transition-[width] duration-200",
                  finalizing && "animate-pulse",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[11px] text-ink-3">
              {finalizing
                ? "بارگذاری کامل شد، در حال آماده‌سازی جلسه…"
                : "لطفاً تا پایان بارگذاری صبر کنید و صفحه را نبندید."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid size-12 place-items-center rounded-full bg-bg-soft text-ink-3 transition-colors group-hover:bg-brand-soft group-hover:text-brand">
            <Upload className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">
              فایل صوتی را اینجا بکشید یا کلیک کنید
            </p>
            <p className="text-[11px] text-ink-3">
              MP3 · WAV · M4A · WEBM · OGG · MP4 — تا ۵۰۰ مگابایت
            </p>
          </div>
        </>
      )}
    </div>
  );
}
