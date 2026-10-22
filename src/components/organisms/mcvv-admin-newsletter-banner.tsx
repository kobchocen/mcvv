"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  BANNER_ERROR_MESSAGES,
  BANNER_MIN_WIDTH,
  bannerChoiceSrc,
  bannerFileIssue,
  bannerImagePath,
  draftBanner,
  type BannerDraft,
  type NewsletterBanner,
} from "@/lib/newsletter/banner";
import { renderNewsletterPreview } from "@/lib/newsletter/core";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Input } from "@/components/ui/input";

/**
 * Živý náhled newsletteru (Q27): pole formuláře a náhled e-mailu nad ním sdílejí neuložený
 * stav (banner, předmět, text). Náhled se skládá stejnou šablonou jako odesílaný e-mail.
 */

/** Neuložený předmět a text (null = beze změny od uložení). */
export type TextDraft = { subject: string; body: string } | null;

type DraftState = {
  draft: BannerDraft;
  saved: BannerDraft;
  setDraft: React.Dispatch<React.SetStateAction<BannerDraft>>;
  text?: TextDraft;
};

/** Prodleva, než se psaní v textu promítne do náhledu (iframe se při změně načítá znovu). */
export const TEXT_PREVIEW_DELAY_MS = 300;

/** Exportováno kvůli testům (neuložený stav bez interakce). */
export const BannerDraftContext = createContext<DraftState | null>(null);

export function McvvNewsletterBannerDraftProvider({
  initial,
  children,
}: {
  initial: BannerDraft;
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<BannerDraft>(initial);
  const [text, setText] = useState<TextDraft>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);
  const value = useMemo(() => ({ draft, saved: initial, setDraft, text }), [draft, initial, text]);

  // Předmět a text čteme z formuláře při psaní (pole zůstávají neřízená, odesílají se jako dřív).
  const onInput = (event: React.FormEvent<HTMLDivElement>) => {
    const field = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (field.name !== "subject" && field.name !== "body") return;
    const form = field.form;
    if (!form) return;
    const read = (name: string) => {
      const input = form.elements.namedItem(name);
      return input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
        ? input.value
        : "";
    };
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(
      () => setText({ subject: read("subject"), body: read("body") }),
      TEXT_PREVIEW_DELAY_MS,
    );
  };

  return (
    <BannerDraftContext.Provider value={value}>
      <div className="contents" onInput={onInput}>
        {children}
      </div>
    </BannerDraftContext.Provider>
  );
}

/** Liší se neuložený banner od uloženého? */
export function bannerDraftDirty(draft: BannerDraft, saved: BannerDraft): boolean {
  return (
    Boolean(draft.uploadSrc) ||
    draft.choice !== saved.choice ||
    draft.alt.trim() !== saved.alt.trim() ||
    draft.link.trim() !== saved.link.trim()
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} kB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Miniatura vybraného banneru (pod výběrem / nahráním) nebo stav „bez banneru“. */
export function McvvNewsletterBannerThumbnail({
  src,
  caption,
  onWidth,
}: {
  src: string | null;
  caption: string;
  onWidth?: (width: number) => void;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src) {
    return (
      <p data-slot="banner-thumbnail" className="text-xs text-race-muted">
        Bez banneru – e-mail začne výchozí tmavou hlavičkou MCVV. Vybraný banner ji nahradí.
      </p>
    );
  }
  return (
    <figure data-slot="banner-thumbnail" className="grid max-w-xl gap-1">
      {failed === src ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Obrázek banneru se nepodařilo načíst.
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="w-full border border-race-line/55 bg-[#0f2a1c] object-contain"
          onLoad={(event) => onWidth?.(event.currentTarget.naturalWidth)}
          onError={() => setFailed(src)}
        />
      )}
      <figcaption className="text-xs text-race-muted">{caption}</figcaption>
    </figure>
  );
}

type UploadInfo = { name: string; size: number };

/** Pole „Banner v hlavičce (volitelné)“ s miniaturou; mění sdílený neuložený stav. */
export function McvvNewsletterBannerFields({
  options,
  initial,
}: {
  options: { value: string; label: string }[];
  initial: BannerDraft;
}) {
  const shared = useContext(BannerDraftContext);
  const [localDraft, setLocalDraft] = useState<BannerDraft>(initial);
  const draft = shared?.draft ?? localDraft;
  const setDraft = shared?.setDraft ?? setLocalDraft;
  const [upload, setUpload] = useState<UploadInfo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Uvolní dočasnou adresu souboru, jakmile ji nahradí jiná (nebo formulář zmizí).
  const uploadSrc = draft.uploadSrc ?? null;
  useEffect(() => {
    return () => {
      if (uploadSrc?.startsWith("blob:")) URL.revokeObjectURL(uploadSrc);
    };
  }, [uploadSrc]);

  const update = (patch: Partial<BannerDraft>) => setDraft({ ...draft, ...patch });

  const onFile = (file: File | undefined) => {
    if (!file) {
      setUpload(null);
      update({ uploadSrc: null, uploadDataUrl: null, uploadError: null });
      return;
    }
    setUpload({ name: file.name, size: file.size });
    const objectUrl = URL.createObjectURL(file);
    const uploadError = bannerFileIssue(file);
    update({ uploadSrc: objectUrl, uploadDataUrl: null, uploadError });
    if (uploadError) return;
    // Náhled e-mailu (sandboxovaný iframe) potřebuje data: URL; miniatura stačí s blob:.
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      setDraft((current) =>
        current.uploadSrc === objectUrl ? { ...current, uploadDataUrl: dataUrl } : current,
      );
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    if (fileRef.current) fileRef.current.value = "";
    onFile(undefined);
  };

  const label = options.find((option) => option.value === draft.choice)?.label ?? "";
  const thumbnailSrc = draft.uploadSrc ?? bannerChoiceSrc(draft.choice);
  const caption =
    draft.uploadSrc && upload
      ? `Nový soubor ${upload.name} (${formatSize(upload.size)}) – nahraje se při uložení a má přednost před výběrem.`
      : label;

  return (
    <fieldset className="grid gap-3 border border-race-line/55 p-4">
      <legend className="px-1 text-sm font-semibold">Banner v hlavičce (volitelné)</legend>
      <label className="grid gap-1 text-sm">
        Připravený nebo dříve nahraný banner
        <select
          name="banner"
          value={draft.choice}
          onChange={(event) => update({ choice: event.target.value })}
          className="h-10 max-w-xl border border-race-line bg-race-surface px-2"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Nebo nahrát nový (JPG, PNG nebo WebP, max. 1 MB, ideálně 1200 × 400 px)
        <input
          ref={fileRef}
          type="file"
          name="bannerFile"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm"
          onChange={(event) => onFile(event.target.files?.[0])}
        />
        <span className="text-xs text-race-muted">
          Nahraný obrázek má přednost před výběrem. Server ho zmenší na šířku 1200 px (ostrý na
          retina displejích), v e-mailu se zobrazí v šířce 600 px a na mobilu se zmenší.
        </span>
      </label>
      {draft.uploadSrc ? (
        <button
          type="button"
          onClick={clearFile}
          className="w-fit text-sm text-race-muted hover:underline"
        >
          Zrušit vybraný soubor (použije se výběr výše)
        </button>
      ) : null}
      <McvvNewsletterBannerThumbnail
        src={thumbnailSrc}
        caption={caption}
        onWidth={(width) => {
          // Šířku nového souboru zná prohlížeč až po načtení; užší by server odmítl.
          if (draft.uploadSrc && !draft.uploadError && width < BANNER_MIN_WIDTH) {
            update({ uploadError: "too_small" });
          }
        }}
      />
      {draft.uploadSrc && draft.uploadError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {BANNER_ERROR_MESSAGES[draft.uploadError]}
        </p>
      ) : null}
      <AdminField
        name="bannerAlt"
        label="Alt text banneru (povinný u nahraného obrázku; u připraveného se jinak použije výchozí)"
      >
        <Input
          id="bannerAlt"
          name="bannerAlt"
          value={draft.alt}
          onChange={(event) => update({ alt: event.target.value })}
          className="h-10 bg-race-surface"
        />
      </AdminField>
      <AdminField
        name="bannerLink"
        label="Odkaz po kliknutí na banner (prázdné = https://mcvv.org)"
      >
        <Input
          id="bannerLink"
          name="bannerLink"
          type="url"
          value={draft.link}
          onChange={(event) => update({ link: event.target.value })}
          className="h-10 bg-race-surface"
        />
      </AdminField>
    </fieldset>
  );
}

export type NewsletterPreviewProps = {
  subject: string;
  body: string;
  /** Absolutní základ URL pro e-mail (AUTH_ORIGIN). */
  origin: string;
  /** Uložený banner: relativní pro náhled, absolutní pro e-mail. */
  savedPreview: NewsletterBanner | null;
  savedEmail: NewsletterBanner | null;
};

/**
 * Sekce „Náhled“: iframe se stejnou šablonou jako e-mail. Banner, předmět i text se mění živě
 * podle formuláře (bez uložení); do e-mailu se dostanou až po „Uložit koncept“.
 */
export function McvvNewsletterEmailPreview(props: NewsletterPreviewProps) {
  const shared = useContext(BannerDraftContext);
  const draft = shared?.draft ?? null;
  const dirty = shared ? bannerDraftDirty(shared.draft, shared.saved) : false;
  const text = shared?.text ?? null;
  const subject = text?.subject ?? props.subject;
  const body = text?.body ?? props.body;
  const textDirty = subject !== props.subject || body !== props.body;
  const preview =
    draft && dirty
      ? draftBanner(
          // Než se data: URL načte (ms), prázdný obrázek – ne dočasně starý výběr.
          { ...draft, uploadSrc: draft.uploadSrc && (draft.uploadDataUrl ?? "about:blank") },
          "",
        )
      : null;
  const email = draft && dirty ? draftBanner(draft, props.origin) : null;
  // Chybný banner se při uložení nezmění → náhled ukazuje dál ten uložený.
  const banner = preview?.ok ? preview.banner : props.savedPreview;
  const emailBanner = email?.ok ? email.banner : props.savedEmail;
  const html = renderNewsletterPreview({
    subject,
    body,
    origin: props.origin,
    banner,
  }).html;
  const changed = [dirty ? "banner" : null, textDirty ? "text" : null].filter(Boolean).join(" a ");

  return (
    <>
      {dirty || textDirty ? (
        <p
          data-slot="banner-draft-hint"
          className="mb-3 border border-amber-500/60 bg-amber-500/10 p-3 text-sm"
        >
          {preview && !preview.ok
            ? `Banner z formuláře nejde uložit: ${BANNER_ERROR_MESSAGES[preview.error]} Náhled ukazuje uložený banner. `
            : ""}
          {`Náhled ukazuje neuložené změny (${changed}) – do e-mailu se dostanou až po „Uložit koncept“.`}
        </p>
      ) : null}
      {emailBanner ? (
        <p className="mb-3 text-sm text-race-muted">
          Banner v e-mailu:{" "}
          {email?.ok && draft?.uploadSrc ? (
            <>
              nový obrázek, po uložení na adrese{" "}
              <code className="break-all">{`${props.origin.replace(/\/$/, "")}${bannerImagePath(0).slice(0, -1)}…`}</code>
            </>
          ) : (
            <code className="break-all">{emailBanner.src}</code>
          )}{" "}
          → odkaz <code className="break-all">{emailBanner.href}</code>
        </p>
      ) : (
        <p className="mb-3 text-sm text-race-muted">Bez banneru v hlavičce.</p>
      )}
      <iframe
        title="Náhled e-mailu"
        srcDoc={html}
        sandbox=""
        className="h-[34rem] w-full max-w-3xl border border-race-line bg-white"
      />
    </>
  );
}
