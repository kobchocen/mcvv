"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type GuideStep = {
  image: string;
  title: string;
  /** May contain <b> markup from translations (trusted, static). */
  text: string;
  tip?: string;
};

export type McvvGuideStepsProps = {
  steps: GuideStep[];
  copy: { prev: string; next: string; done: string; counter: string; stepLabel: string };
};

function Rich({ html }: { html: string }) {
  // Translations are static repository content; only <b> is used.
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function McvvGuideSteps({ steps, copy }: McvvGuideStepsProps) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const total = steps.length;

  const go = useCallback(
    (next: number) => {
      const value = Math.max(0, Math.min(total - 1, next));
      setIndex(value);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#k${value + 1}`);
      }
    },
    [total],
  );

  useEffect(() => {
    const match = window.location.hash.match(/^#k(\d+)$/);
    if (match) {
      const value = Number.parseInt(match[1]!, 10) - 1;
      if (value > 0 && value < total) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from URL hash once on mount
        setIndex(value);
      }
    }
  }, [total]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const step = steps[index]!;
  const counter = copy.counter.replace("{n}", String(index + 1)).replace("{total}", String(total));

  return (
    <div>
      <div role="tablist" aria-label={copy.stepLabel} className="flex flex-wrap gap-1.5">
        {steps.map((item, k) => (
          <button
            key={item.image}
            type="button"
            role="tab"
            aria-selected={k === index}
            aria-controls="guide-step"
            title={item.title}
            onClick={() => go(k)}
            className={`h-9 min-w-9 rounded-full border px-3 text-sm font-semibold transition ${
              k === index
                ? "border-race-accent bg-race-accent text-white"
                : "border-race-line bg-race-surface text-foreground hover:border-race-accent"
            }`}
          >
            {k + 1}
          </button>
        ))}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-race-line/60" aria-hidden="true">
        <div
          className="h-full bg-race-accent transition-[width] duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      <article
        id="guide-step"
        role="tabpanel"
        className="mt-4 overflow-hidden border border-race-line/60 bg-race-surface"
      >
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block w-full cursor-zoom-in border-b border-race-line/60"
        >
          <Image
            src={`/navod/${step.image}`}
            alt={`${copy.stepLabel} ${index + 1}: ${step.title}`}
            width={1280}
            height={720}
            sizes="(min-width: 1024px) 896px, 100vw"
            className="h-auto w-full"
            priority={index === 0}
          />
        </button>
        <div className="p-5 sm:p-6">
          <h2 className="flex items-center gap-3 font-display text-xl font-semibold text-foreground sm:text-2xl dark:text-white">
            <span className="inline-flex h-8 min-w-8 items-center justify-center bg-race-accent px-2 text-base text-white">
              {index + 1}
            </span>
            {step.title}
          </h2>
          <p className="mt-3 text-base leading-7 text-race-muted">
            <Rich html={step.text} />
          </p>
          {step.tip ? (
            <p className="mt-4 border-l-4 border-race-accent bg-race-accent/10 px-4 py-3 text-sm leading-6 text-foreground dark:text-white">
              <Rich html={step.tip} />
            </p>
          ) : null}
        </div>
      </article>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 border-race-line bg-race-surface"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          ← {copy.prev}
        </Button>
        <span className="text-sm text-race-muted" aria-live="polite">
          {counter}
        </span>
        <Button
          type="button"
          className="h-11 bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
          onClick={() =>
            index === total - 1 ? window.scrollTo({ top: 0, behavior: "smooth" }) : go(index + 1)
          }
        >
          {index === total - 1 ? `${copy.done} ✓` : `${copy.next} →`}
        </Button>
      </div>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-h-[92vh] overflow-auto border-race-line bg-race-deep p-2 sm:max-w-6xl">
          <DialogTitle className="sr-only">{step.title}</DialogTitle>
          <Image
            src={`/navod/${step.image}`}
            alt={step.title}
            width={1280}
            height={720}
            sizes="100vw"
            className="h-auto w-full"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
