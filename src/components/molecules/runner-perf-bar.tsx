export type RunnerPerfBarProps = {
  blue: number;
  green: number;
  red: number;
  max: number;
  title: string;
};

export function RunnerPerfBar({ blue, green, red, max, title }: RunnerPerfBarProps) {
  if (max <= 0) {
    return null;
  }

  return (
    <div className="flex h-3 w-full min-w-[5rem] max-w-[14rem]" title={title}>
      {blue > 0 ? (
        <span className="h-full bg-blue-600" style={{ width: `${(blue / max) * 100}%` }} />
      ) : null}
      {green > 0 ? (
        <span className="h-full bg-green-600" style={{ width: `${(green / max) * 100}%` }} />
      ) : null}
      {red > 0 ? (
        <span className="h-full bg-red-500" style={{ width: `${(red / max) * 100}%` }} />
      ) : null}
    </div>
  );
}

export function perfBarSegments(
  time: number,
  personalRecord: number,
  average: number,
  sexRecord: number,
): { blue: number; green: number; red: number } {
  const blue = Math.max(0, personalRecord - sexRecord);
  const green = Math.max(0, Math.min(time, average) - personalRecord);
  const red = Math.max(0, time - average);
  return { blue, green, red };
}
