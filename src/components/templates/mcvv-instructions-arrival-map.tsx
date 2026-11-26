import { McvvArrivalMapDialog } from "@/components/organisms/mcvv-arrival-map";
import type { ArrivalMapContent } from "@/components/templates/mcvv-homepage-content";

/** Mapa příjezdu a parkování v sekci Parkování na Pokynech (stejný dialog jako na úvodu). */
export function InstructionsArrivalMap({ content }: { content?: ArrivalMapContent }) {
  if (!content) return null;
  return (
    <div data-testid="instructions-arrival-map">
      <McvvArrivalMapDialog content={content} />
    </div>
  );
}
