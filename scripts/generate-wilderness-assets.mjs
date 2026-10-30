// Generates the Cinematic Wilderness background layers as vector art:
//   public/brand/topo.svg     copper topographic contours for the sky
//   public/brand/horizon.svg  layered mountains, forest and amber horizon glow
// Deterministic (seeded) so output is stable. Run: pnpm assets:wilderness
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../public/brand/", import.meta.url);
mkdirSync(OUT, { recursive: true });

// ---------- seeded noise ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(seed) {
  const r = rng(seed);
  const perm = Array.from({ length: 512 }, () => r());
  const h = (x, y) => perm[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 512];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = h(xi, yi);
    const b = h(xi + 1, yi);
    const c = h(xi, yi + 1);
    const d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function fbm(noise, x, y, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise(x * f, y * f);
    f *= 2;
    amp *= 0.5;
  }
  return v;
}

const r1 = (n) => Math.round(n * 10) / 10;

// ---------- topographic contours (marching squares) ----------
function topo() {
  const W = 1600;
  const H = 900;
  const STEP = 8;
  const nx = W / STEP + 1;
  const ny = H / STEP + 1;
  const noise = valueNoise(7);
  const field = [];
  for (let j = 0; j < ny; j++) {
    const row = [];
    for (let i = 0; i < nx; i++) {
      const x = (i * STEP) / 330;
      const y = (j * STEP) / 330;
      // Domain warp gives the meandering terrain look.
      const wx = x + 0.9 * fbm(noise, x + 3.1, y + 1.7, 3);
      const wy = y + 0.9 * fbm(noise, x + 8.3, y + 2.9, 3);
      row.push(fbm(noise, wx, wy, 4));
    }
    field.push(row);
  }

  const levels = [];
  for (let l = 0.3; l <= 0.72; l += 0.024) levels.push(l);

  const paths = levels.map((level, li) => {
    const segs = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v = [
          field[j][i],
          field[j][i + 1],
          field[j + 1][i + 1],
          field[j + 1][i],
        ];
        const p = [
          [i * STEP, j * STEP],
          [(i + 1) * STEP, j * STEP],
          [(i + 1) * STEP, (j + 1) * STEP],
          [i * STEP, (j + 1) * STEP],
        ];
        const pts = [];
        for (let e = 0; e < 4; e++) {
          const a = v[e];
          const b = v[(e + 1) % 4];
          if (a < level !== b < level) {
            const t = (level - a) / (b - a);
            const [x0, y0] = p[e];
            const [x1, y1] = p[(e + 1) % 4];
            pts.push([r1(x0 + (x1 - x0) * t), r1(y0 + (y1 - y0) * t)]);
          }
        }
        if (pts.length === 2) segs.push(pts);
        else if (pts.length === 4)
          segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
      }
    }
    // Chain segments into polylines.
    const key = (pt) => `${pt[0]},${pt[1]}`;
    const ends = new Map();
    segs.forEach((s, idx) => {
      for (const pt of s) {
        const k = key(pt);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push(idx);
      }
    });
    const used = new Uint8Array(segs.length);
    const lines = [];
    for (let s = 0; s < segs.length; s++) {
      if (used[s]) continue;
      used[s] = 1;
      const line = [...segs[s]];
      for (const dir of [1, -1]) {
        for (;;) {
          const tip = dir === 1 ? line[line.length - 1] : line[0];
          const next = (ends.get(key(tip)) ?? []).find((n) => !used[n]);
          if (next === undefined) break;
          used[next] = 1;
          const [a, b] = segs[next];
          const other = key(a) === key(tip) ? b : a;
          if (dir === 1) line.push(other);
          else line.unshift(other);
        }
      }
      // Drop tiny closed loops; they read as specks rather than terrain.
      const xs = line.map((pt) => pt[0]);
      const ys = line.map((pt) => pt[1]);
      const span = Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      );
      if (line.length >= 6 && span >= 60) lines.push(line);
    }
    // Light simplification: keep every other point.
    const d = lines
      .map((line) => {
        const pts = line.filter((_, k) => k % 2 === 0 || k === line.length - 1);
        return "M" + pts.map(([x, y]) => `${x} ${y}`).join("L");
      })
      .join("");
    const index = li % 5 === 0;
    return `<path d="${d}" stroke-opacity="${index ? 0.55 : 0.3}" stroke-width="${index ? 1.3 : 0.9}"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="#c98a52" stroke-linejoin="round" vector-effect="non-scaling-stroke">${paths.join("")}</g></svg>\n`;
}

// ---------- horizon: ridges, forest, glow ----------
function horizon() {
  const W = 1600;
  const H = 600;
  const noise = valueNoise(21);
  const rand = rng(99);

  const ridge = (base, amp, scale, seedOffset) => (x) =>
    base - amp * fbm(noise, x / scale + seedOffset, seedOffset, 4);

  function ridgePath(yAt, treeMin, treeMax, spacing) {
    let d = `M0 ${H}L0 ${r1(yAt(0))}`;
    for (let x = 0; x <= W; x += spacing) {
      const y = yAt(x);
      if (treeMax > 0) {
        const th = treeMin + rand() * (treeMax - treeMin);
        d += `L${r1(x)} ${r1(y)}L${r1(x + spacing / 2)} ${r1(y - th)}`;
      } else {
        d += `L${r1(x)} ${r1(y)}`;
      }
    }
    return `${d}L${W} ${r1(yAt(W))}L${W} ${H}Z`;
  }

  function conifer(cx, base, h, w) {
    const tiers = Math.max(6, Math.round(h / 16));
    const left = [];
    const right = [];
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const y = base - h * 0.08 - t * h * 0.92;
      const hw = (w / 2) * Math.pow(1 - t, 0.85) * (0.85 + rand() * 0.3);
      const step = (h * 0.92) / tiers;
      left.push([cx - hw, y], [cx - hw * 0.35, y - step * 0.6]);
      right.unshift([cx + hw * 0.35, y - step * 0.6], [cx + hw, y]);
    }
    const trunk = Math.max(1.5, w * 0.05);
    const pts = [
      [cx - trunk, base],
      ...left,
      [cx, base - h],
      ...right,
      [cx + trunk, base],
    ];
    return "M" + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L") + "Z";
  }

  const farY = ridge(470, 170, 240, 1.3);
  const far = ridgePath(farY, 2, 6, 4);
  const SUN_X = 1330;
  const sunY = r1(farY(SUN_X) + 2);
  const mid = ridgePath(ridge(520, 150, 200, 4.2), 3, 10, 4);
  const near = ridgePath(ridge(575, 120, 160, 7.7), 6, 20, 5);

  const trees = [];
  const cluster = (from, to, count, minH, maxH) => {
    for (let k = 0; k < count; k++) {
      const x = from + ((to - from) * (k + rand() * 0.8)) / count;
      const h = minH + rand() * (maxH - minH);
      trees.push(conifer(x, H + 4, h, h * (0.22 + rand() * 0.08)));
    }
  };
  cluster(-30, 260, 11, 150, 440);
  cluster(1380, 1640, 9, 140, 420);
  cluster(240, 420, 4, 60, 140);
  cluster(1250, 1400, 4, 60, 150);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">
<defs>
<radialGradient id="sun" cx="${SUN_X}" cy="${sunY}" r="330" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe2b0" stop-opacity=".95"/><stop offset=".06" stop-color="#f4ac5f" stop-opacity=".72"/><stop offset=".2" stop-color="#d0803c" stop-opacity=".34"/><stop offset=".5" stop-color="#8a4f22" stop-opacity=".1"/><stop offset="1" stop-color="#3a2410" stop-opacity="0"/></radialGradient>
<linearGradient id="far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2523"/><stop offset=".5" stop-color="#111b19"/><stop offset="1" stop-color="#091210"/></linearGradient>
<linearGradient id="mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101b18"/><stop offset="1" stop-color="#08100e"/></linearGradient>
<linearGradient id="near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1512"/><stop offset="1" stop-color="#060c0a"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="0"><stop offset=".55" stop-color="#e09a52" stop-opacity="0"/><stop offset=".85" stop-color="#e09a52" stop-opacity=".22"/><stop offset="1" stop-color="#e09a52" stop-opacity="0"/></linearGradient>
<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d18a48" stop-opacity="0"/><stop offset="1" stop-color="#d18a48" stop-opacity=".16"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sun)"/>
<circle cx="${SUN_X}" cy="${sunY}" r="5" fill="#fff4dc"/>
<path d="${far}" fill="url(#far)"/>
<rect y="300" width="${W}" height="200" fill="url(#haze)"/>
<path d="${mid}" fill="url(#mid)"/>
<path d="${mid}" fill="url(#rim)"/>
<path d="${near}" fill="url(#near)"/>
<g fill="#040907">${trees.map((d) => `<path d="${d}"/>`).join("")}</g>
</svg>
`;
}

writeFileSync(new URL("topo.svg", OUT), topo());
writeFileSync(new URL("horizon.svg", OUT), horizon());
console.log("Wrote public/brand/topo.svg and public/brand/horizon.svg");
