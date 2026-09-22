import { McvvCourseMap } from "./mcvv-course-map";
import { McvvCourseMapLightbox } from "./mcvv-course-map-lightbox";

/** S/C dot center in the map card, measured at 1440px desktop. */
const SC_LEFT_PCT = 83.61;
const SC_TOP_PCT = 88.51;
const START_BOX_RIGHT = "19.5rem";
const SC_HEAD_GAP_PX = 10;

export type McvvCourseMapCardProps = {
  kicker: string;
  title: string;
  address: string;
  alt: string;
  expandLabel: string;
};

function MapFace({
  kicker,
  title,
  address,
  alt,
  showArrow,
}: {
  kicker: string;
  title: string;
  address: string;
  alt: string;
  showArrow: boolean;
}) {
  return (
    <>
      <McvvCourseMap alt={alt} />
      <p className="absolute right-3 top-3 z-10 max-w-[calc(100%-1.5rem)] bg-race-deep/85 px-2.5 py-1.5 text-right font-display text-[10px] font-semibold tracking-[0.14em] text-race-accent sm:text-xs">
        {kicker}
      </p>
      <div className="absolute inset-x-3 bottom-3 z-10 sm:left-3 sm:right-auto sm:w-[16rem]">
        <div className="border-2 border-race-accent bg-race-deep/90 p-3 backdrop-blur sm:p-4">
          <p className="font-display text-base font-semibold text-white sm:text-lg">{title}</p>
          <p className="mt-1 text-xs leading-5 text-race-muted sm:text-sm sm:leading-6">
            {address}
          </p>
        </div>
      </div>
      {showArrow ? (
        <div
          className="pointer-events-none absolute z-10 hidden h-3 -translate-y-1/2 text-race-accent/80 sm:block"
          style={{
            left: START_BOX_RIGHT,
            top: `${SC_TOP_PCT}%`,
            width: `calc(${SC_LEFT_PCT}% - ${START_BOX_RIGHT} - ${SC_HEAD_GAP_PX}px)`,
          }}
          aria-hidden="true"
        >
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 100 12"
            preserveAspectRatio="none"
            fill="none"
          >
            <path
              d="M0 6 H100"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <svg
            className="absolute top-1/2 right-0 h-2.5 w-2.5 -translate-y-1/2 translate-x-[1px] overflow-visible"
            viewBox="0 0 10 8"
            fill="currentColor"
          >
            <path d="M0 0 L10 4 L0 8 Z" />
          </svg>
        </div>
      ) : null}
    </>
  );
}

export function McvvCourseMapCard({
  kicker,
  title,
  address,
  alt,
  expandLabel,
}: McvvCourseMapCardProps) {
  const overlay = { kicker, title, address };
  return (
    <McvvCourseMapLightbox
      expandLabel={expandLabel}
      preview={<MapFace {...overlay} alt="" showArrow={false} />}
      expanded={<MapFace {...overlay} alt={alt} showArrow />}
    />
  );
}
