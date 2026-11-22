/** Vyhlazený profil tratě MCVV (stejná data a vyhlazení jako logo 2A). */

export type CoursePoint = readonly [number, number];

export function smoothElevations(pts: readonly CoursePoint[], win: number): number[] {
  const n = pts.length;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const from = Math.max(0, i - win);
    const to = Math.min(n, i + win + 1);
    let sum = 0;
    for (let k = from; k < to; k += 1) {
      sum += pts[k][1];
    }
    out.push(sum / (to - from));
  }
  return out;
}

/** Mapuje vyhlazený profil do obdélníku [x0,x1] × [y0,y1] (y dolů). */
export function profilePoints(
  pts: readonly CoursePoint[],
  win: number,
  y0: number,
  y1: number,
  x0: number,
  x1: number,
  step = 5,
): { x: number; y: number }[] {
  const ys = smoothElevations(pts, win);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < pts.length; k += step) {
    out.push({
      x: x0 + pts[k][0] * (x1 - x0),
      y: y0 + ((ys[k] - lo) / span) * (y1 - y0),
    });
  }
  out.push({
    x: x1,
    y: y0 + ((ys[ys.length - 1] - lo) / span) * (y1 - y0),
  });
  return out;
}
