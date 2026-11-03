import { flagSrc } from "@/lib/runner/nationality";
import { cn } from "@/lib/utils";

/**
 * Vlaječka státu jako obrázek (SVG v `public/flags`, bez externího CDN). Emoji vlaječky
 * Windows nevykreslí – místo nich ukáže dvě písmena (např. „CZ“), proto obrázek.
 * Výška podle písma okolního textu (1em), poměr stran 4 : 3.
 */
export function CountryFlag({
  code,
  label,
  className,
}: {
  code: string | null | undefined;
  /** Textová alternativa (název státu); bez ní je vlaječka jen dekorace vedle textu. */
  label?: string;
  className?: string;
}) {
  const src = flagSrc(code);
  if (!src) {
    return null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- malé statické SVG, next/image nic nepřinese
    <img
      src={src}
      alt={label ?? ""}
      title={label}
      aria-hidden={label ? undefined : true}
      width={16}
      height={12}
      loading="lazy"
      decoding="async"
      className={cn(
        "inline-block h-[0.85em] w-auto shrink-0 align-[-0.05em] shadow-[0_0_0_1px_rgba(0,0,0,0.12)]",
        className,
      )}
      data-testid="country-flag"
    />
  );
}
