/**
 * Konfety pro „nový traťový rekord“ – vlastní deterministická simulace pro `<canvas>`
 * (žádná knihovna ani CDN). Poloha každého kousku je funkce času, takže stejný okamžik
 * dá vždy stejný obraz (snímky obrazovky, testy) a nic se nehromadí mezi snímky.
 */

export type Confetto = {
  color: string;
  shape: 0 | 1 | 2;
  w: number;
  h: number;
  rot: number;
  vr: number;
  ph: number;
  sw: number;
  t0: number;
  k: number;
  x0: number;
  y0: number;
  vx0: number;
  vy0: number;
};

export const CONFETTI_COLORS = [
  "#ffd23f",
  "#ffb000",
  "#ff7a2f",
  "#ffffff",
  "#7bdc8b",
  "#f4e3a1",
  "#ff5d5d",
];

/**
 * `n` kousků pro plochu `w × h`. `cannons` = 45 % vystřelí dvě „děla“ z dolních rohů, zbytek
 * prší shora; `small` = menší kousky a krátký déšť (pruh na mobilu).
 */
export function makeConfetti(
  w: number,
  h: number,
  n: number,
  seed: number,
  options: { cannons?: boolean; small?: boolean } = {},
): Confetto[] {
  const { cannons = true, small = false } = options;
  let s = Math.max(1, Math.floor(seed)) % 2147483647;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const scale = small ? 0.7 : 1;
  const out: Confetto[] = [];
  for (let i = 0; i < n; i++) {
    const cannon = cannons && i < n * 0.45;
    const left = i % 2 === 0;
    const shapeRoll = r();
    const base = {
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      shape: (shapeRoll < 0.18 ? 2 : shapeRoll < 0.3 ? 1 : 0) as 0 | 1 | 2,
      w: (6 + r() * 8) * scale,
      h: (10 + r() * 12) * scale,
      rot: r() * 6.28,
      vr: (r() - 0.5) * 12,
      ph: r() * 6.28,
      sw: 20 + r() * 50,
    };
    if (cannon) {
      const ang = ((25 + r() * 50) * Math.PI) / 180;
      const v = h * (1.4 + r());
      out.push({
        ...base,
        x0: left ? -10 : w + 10,
        y0: h * 0.95,
        vx0: Math.cos(ang) * v * (left ? 1 : -1) * (w / h) * 0.55,
        vy0: -Math.sin(ang) * v,
        k: 1.7,
        t0: r() * 0.35,
      });
    } else {
      out.push({
        ...base,
        x0: r() * w,
        y0: -20 - r() * h * 0.15,
        vx0: (r() - 0.5) * 40,
        vy0: 40 + r() * 80,
        k: 3.2,
        t0: (small ? 0 : 0.3) + r() * (small ? 0.5 : 2.8),
      });
    }
  }
  return out;
}

export type ConfettoPose = { x: number; y: number; a: number; flip: number } | null;

/** Poloha kousku v čase `t` (s): lineární odpor vzduchu + gravitace; null = ještě nevyletěl. */
export function confettoAt(p: Confetto, t: number, h: number): ConfettoPose {
  const tt = t - p.t0;
  if (tt < 0) return null;
  const g = h * 1.1;
  const e = (1 - Math.exp(-p.k * tt)) / p.k;
  return {
    x: p.x0 + p.vx0 * e + Math.sin(p.ph + tt * 2.6) * p.sw * Math.min(1, tt),
    y: p.y0 + p.vy0 * e + (g / p.k) * (tt - e),
    a: p.rot + p.vr * tt,
    flip: Math.cos(p.ph + tt * 9),
  };
}

/** Vykreslí konfety v čase `t` (s) s průhledností `alpha`. */
export function drawConfetti(
  ctx: CanvasRenderingContext2D,
  pieces: readonly Confetto[],
  t: number,
  alpha: number,
): void {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = alpha;
  for (const p of pieces) {
    const pose = confettoAt(p, t, H);
    if (!pose || pose.y > H + 40) continue;
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.a);
    ctx.fillStyle = p.color;
    if (p.shape === 1) {
      ctx.beginPath();
      ctx.arc(0, 0, p.w * 0.45, 0, 6.28);
      ctx.fill();
    } else if (p.shape === 2) {
      ctx.fillRect(-p.w * 0.2, -p.h, p.w * 0.4, p.h * 2);
    } else {
      ctx.scale(1, Math.abs(pose.flip) * 0.9 + 0.1);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
