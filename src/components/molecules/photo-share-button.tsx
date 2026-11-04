"use client";

import { useEffect, useRef, useState } from "react";
import { Share2Icon } from "lucide-react";

import { sharePhotoLink, shareEnvironment, type ShareOutcome } from "@/lib/photos/share-action";

export type PhotoShareToast = "copied" | "failed" | null;

export type PhotoShareButtonViewProps = {
  label: string;
  copiedLabel: string;
  failedLabel: string;
  toast: PhotoShareToast;
  onClick?: () => void;
};

/** Presentational part (rendered in tests): button + small toast above it. */
export function PhotoShareButtonView({
  label,
  copiedLabel,
  failedLabel,
  toast,
  onClick,
}: PhotoShareButtonViewProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        data-slot="photo-share"
        onClick={onClick}
        className="inline-flex items-center gap-2 border border-race-line/60 bg-race-surface px-3 py-2 text-sm font-semibold text-foreground hover:border-race-accent focus-visible:outline-2 focus-visible:outline-race-accent dark:text-white"
      >
        <Share2Icon className="size-4" aria-hidden="true" />
        {label}
      </button>
      <span
        role="status"
        aria-live="polite"
        data-slot="photo-share-toast"
        className={
          toast
            ? "pointer-events-none absolute right-0 bottom-full mb-2 whitespace-nowrap border border-race-line/60 bg-race-deep px-3 py-1.5 text-xs font-semibold text-foreground shadow-lg dark:text-white"
            : "sr-only"
        }
      >
        {toast === "copied" ? copiedLabel : toast === "failed" ? failedLabel : ""}
      </span>
    </span>
  );
}

export type PhotoShareButtonProps = {
  /** Permalink path (`/cs/fotogalerie/foto/123`) or absolute URL. */
  url: string;
  title: string;
  label: string;
  copiedLabel: string;
  failedLabel: string;
};

const TOAST_MS = 2500;

/**
 * "Sdílet": on touch devices opens the native share sheet (navigator.share) with the
 * photo permalink; on desktop (or without Web Share) copies the link and shows a toast.
 */
export function PhotoShareButton({
  url,
  title,
  label,
  copiedLabel,
  failedLabel,
}: PhotoShareButtonProps) {
  const [toast, setToast] = useState<PhotoShareToast>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = async () => {
    const absolute = new URL(url, window.location.origin).toString();
    const outcome: ShareOutcome = await sharePhotoLink(
      { url: absolute, title },
      shareEnvironment(),
    );
    if (outcome !== "copied" && outcome !== "failed") return;
    setToast(outcome);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  return (
    <PhotoShareButtonView
      label={label}
      copiedLabel={copiedLabel}
      failedLabel={failedLabel}
      toast={toast}
      onClick={() => void onClick()}
    />
  );
}
