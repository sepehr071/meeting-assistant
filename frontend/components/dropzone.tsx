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
  className?: string;
}

export function Dropzone({ onFilePicked, disabled, className }: DropzoneProps) {
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

  return (
    <div
      {...getRootProps({
        className: cn(
          "group flex h-full min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-input bg-card/40 p-6 text-center transition-all",
          "hover:border-primary/50 hover:bg-primary/5",
          isDragActive && "border-primary bg-primary/10 ring-3 ring-primary/15",
          isDragReject && "border-destructive bg-destructive/5",
          disabled && "cursor-not-allowed opacity-60",
          className,
        ),
      })}
    >
      <input {...getInputProps()} />
      <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">
        <Upload className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          فایل صوتی را اینجا بکشید یا کلیک کنید
        </p>
        <p className="text-[11px] text-muted-foreground">
          MP3 · WAV · M4A · WEBM · OGG · MP4 — تا ۵۰۰ مگابایت
        </p>
      </div>
    </div>
  );
}
