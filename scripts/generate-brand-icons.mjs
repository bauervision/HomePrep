// Writes static logo/icon SVGs from the shared mark geometry:
//   public/brand/hp-mark.svg  transparent mark (onboarding, docs)
//   src/app/icon.svg          favicon / app icon on a midnight tile
// The raster variants (src/app/favicon.ico, src/app/apple-icon.png,
// public/brand/icon-192.png, icon-512.png) were rendered from src/app/icon.svg;
// re-render them if the mark changes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const mark = JSON.parse(
  readFileSync(
    new URL("../src/components/brand/mark.json", import.meta.url),
    "utf8",
  ),
);
const { paths: p, colors: c } = mark;

function defs() {
  const stops = (cs) =>
    cs
      .map(
        (col, i) =>
          `<stop offset="${i / (cs.length - 1)}" stop-color="${col}"/>`,
      )
      .join("");
  return `<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1">${stops(c.copper)}</linearGradient><linearGradient id="i" x1="0" y1="0" x2="0" y2="1">${stops(c.ivory)}</linearGradient><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">${stops(c.tree)}</linearGradient><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1a22"/><stop offset="1" stop-color="#040a0e"/></linearGradient></defs>`;
}

function body(stroke) {
  return `<g fill="none" stroke="url(#c)" stroke-width="${stroke}" stroke-linejoin="miter" stroke-linecap="square"><path d="${p.roof}"/><path d="${p.leftWall}"/><path d="${p.rightWall}"/></g><path d="${p.tree}" fill="url(#t)"/><g fill="url(#i)"><path d="${p.hStem}"/><path d="${p.hBar}"/><path d="${p.pStem}"/><path d="${p.pBowl}" fill-rule="evenodd"/></g>`;
}

mkdirSync(new URL("../public/brand/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../public/brand/hp-mark.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}">${defs()}${body(5)}</svg>\n`,
);
// Icon tile: mark scaled into a 160x160 rounded midnight square with heavier strokes.
writeFileSync(
  new URL("../src/app/icon.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">${defs()}<rect width="160" height="160" rx="34" fill="url(#bg)"/><rect x="1.5" y="1.5" width="157" height="157" rx="32.5" fill="none" stroke="#c27f45" stroke-opacity=".35" stroke-width="3"/><g transform="translate(12 15)">${body(7)}</g></svg>\n`,
);
console.log("Wrote public/brand/hp-mark.svg and src/app/icon.svg");
