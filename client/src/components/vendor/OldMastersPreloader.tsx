// Old Masters Preloader by Kedhareswer Naidu. Adapted for Apollo.
// https://github.com/Kedhareswer/21stdev-my-components/tree/main/components/old-masters-preloader
// Attribution: THIRD_PARTY_NOTICES.md
"use client";

import * as React from "react";

// Old Masters Preloader
//
// A preloader staged like a classical diorama. The wordmark is the loader:
// it stands in the middle of a black stage as hairline outlines and fills
// with marble from the bottom as the load climbs, inside a slowly turning
// Greek meander. At 100 the stage floods with colour, the word settles to the
// floor, and a cast of statues rises out of the dark in front of it, each on
// its own depth: the photographs are keyed off their black grounds by their
// own luminance (an SVG mask, no cutouts), graded as a two-ink print, lit by
// volumetric shafts and drifting dust. The landing is live: the whole scene
// tilts and parts under the pointer, the nearest figure leans in, letters
// hollow under the cursor, a scroll lifts the stage off the page beneath.
//
// React is the only import. Faces arrive through an injected Google Fonts
// <link> (fontHref={null} loads nothing). Every image is a prop.

export interface OldMastersLink {
  label: string;
  href?: string;
}

export interface OldMastersAside {
  title: string;
  text: string;
}

export interface OldMastersAnnotation {
  /** Left edge, percent of the stage width. */
  x: number;
  /** Top edge, percent of the stage height. */
  y: number;
  label: string;
}

export interface OldMastersFigure {
  /** A statue photographed on a black (or, with subject "dark", a white) ground. */
  src: string;
  alt?: string;
  /** Horizontal centre, percent of the stage width. */
  x: number;
  /** Where the feet stand, percent of the stage height. 100 is the floor. */
  y?: number;
  /** Height, percent of the stage height. */
  h: number;
  /** Parallax and entrance depth. 1 is the stage; more is nearer. */
  depth?: number;
  /** Mirror the photograph. */
  flip?: boolean;
  /** "light": lit marble on a dark ground. "dark": ink on paper. */
  subject?: "light" | "dark";
  /** Luminance, 0–1, where the ground becomes the figure. */
  threshold?: number;
  /** Width of the soft edge round that threshold, 0–1. */
  softness?: number;
  /** Keep this figure on narrow stages. */
  phone?: boolean;
}

export interface OldMastersPalette {
  /** Stage colour once it has flooded. */
  stage: string;
  /** The dark of the stage before the flood, and the deepest shadow of the print. */
  ground: string;
  /** Interface text. */
  text: string;
  /** Secondary text. */
  muted: string;
  /** The meander, the stars, the script initial, the tags. */
  accent: string;
  /** The wordmark. */
  word: string;
  /** Hairlines and outlines. */
  rule: string;
  /** The light: shafts, the flash. */
  glow: string;
  /** The lit marble of the two-ink print. */
  highlight: string;
}

export type OldMastersTone = "noir" | "carmine" | "vellum";
export type OldMastersFace = "didone" | "condensed" | "grotesk";

export interface OldMastersPreloaderProps {
  /** Real progress, 0–100. Leave it out to run a simulated load. */
  paused?: boolean;
  progress?: number;
  /** Length of the simulated load. */
  durationMs?: number;
  /** The word is shown filling at least this long, however fast the load. */
  minLoadMs?: number;
  /** A click, Enter, Space or the Skip control rushes the load to 100. */
  skippable?: boolean;
  /** Open straight on the landing, for repeat visits. */
  skipIntro?: boolean;
  /** The cast. Each one is keyed off its own ground and stands on the floor. */
  figures?: OldMastersFigure[];
  /** A photograph behind everything, darkened and softened. null for none. */
  backdrop?: string | null;
  /** Figures nearer than this stand in front of the word; the rest stand behind it. */
  wordDepth?: number;
  /** Brightness multiplier for the figures once they are up. */
  exposure?: number;
  /** Grade the figures as a two-ink print between ground and glow. Defaults on for carmine. */
  duotone?: boolean;
  /** Volumetric light from above. */
  rays?: boolean;
  /** Dust drifting in the light. */
  dust?: boolean;
  /** How far the scene tilts under the pointer, in degrees. 0 for none. */
  tilt?: number;
  /** The large word. Fitted to the width of the stage. */
  wordmark?: string;
  face?: OldMastersFace;
  /** Set the first letter in a script face, overlapping the rest. */
  scriptInitial?: boolean;
  tagline?: string;
  /** Small line set into the top rule. */
  eyebrow?: string;
  /** The mark in the middle of the nav. */
  brand?: string;
  /** Split left and right of the brand. Hidden on narrow screens. */
  nav?: OldMastersLink[];
  /** Two outlined labels under the nav, left and right. */
  labels?: string[];
  /** Two short columns beside the cast, left and right. Wide screens only. */
  asides?: OldMastersAside[];
  /** Bracketed measurement tags drawn over the scene after the unveil. */
  annotations?: OldMastersAnnotation[];
  /** Plate number, bottom right. */
  plate?: string;
  /** Beside the counter while it loads. */
  loadingLabel?: string;
  cta?: OldMastersLink;
  /** Fired when the call to action is pressed. */
  onEnter?: () => void;
  /** Fired once the landing is up. */
  onLoaded?: () => void;
  /** With children: fired once the stage has lifted off them. */
  onComplete?: () => void;
  /** The page behind the preloader. The stage lifts off it after holdMs, on a scroll, or on the call to action. */
  children?: React.ReactNode;
  /** With children: how long the landing holds before lifting on its own. 0 waits for a scroll or the call to action. */
  holdMs?: number;
  /** With children: a wheel or a swipe lifts the stage. */
  scrollToEnter?: boolean;
  tone?: OldMastersTone;
  /** Partial overrides of the tone's palette. */
  palette?: OldMastersPaletteOverride;
  /** Stylesheet for the faces. null loads nothing. */
  fontHref?: string | null;
  /** Root height. A definite length, never a percentage. */
  height?: string;
  className?: string;
}

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400&family=Jost:wght@400;500&family=Pinyon+Script&display=swap";

const FONT_PROBES = [
  '400 1em "Bodoni Moda"',
  '400 1em "Bebas Neue"',
  '400 1em "Pinyon Script"',
  '400 1em "Jost"',
  '500 1em "Jost"',
];

const FACES = {
  didone: {
    family:
      '"Bodoni Moda", "Didot", "Bodoni 72", "Playfair Display", "Times New Roman", serif',
    weight: 400,
    tracking: -0.01,
  },
  condensed: {
    family: '"Bebas Neue", "Oswald", "Impact", "Arial Narrow", sans-serif',
    weight: 400,
    tracking: 0.02,
  },
  grotesk: {
    family: '"Jost", "Futura", "Helvetica Neue", Arial, sans-serif',
    weight: 500,
    tracking: -0.035,
  },
};

const SCRIPT_FAMILY =
  '"Pinyon Script", "Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive';
const UI_FAMILY = '"Jost", "Futura", "Helvetica Neue", Arial, sans-serif';
const SERIF_FAMILY =
  '"Bodoni Moda", "Didot", "Bodoni 72", "Playfair Display", "Times New Roman", serif';

const TONES = {
  noir: {
    stage: "#0e0c0a",
    ground: "#050403",
    text: "#efe6d6",
    muted: "#9a917f",
    accent: "#d9b25c",
    word: "#f1e9d8",
    rule: "#4a4336",
    glow: "#ffd98a",
    highlight: "#f4ecdc",
  },
  carmine: {
    stage: "#7a1511",
    ground: "#1a0706",
    text: "#f6ead6",
    muted: "#dba79d",
    accent: "#f6ead6",
    word: "#f8eedc",
    rule: "#b2463c",
    glow: "#ffdcb0",
    highlight: "#f0b08f",
  },
  vellum: {
    stage: "#e8ddc6",
    ground: "#d9ccb0",
    text: "#221c16",
    muted: "#7a6d58",
    accent: "#8e2b1d",
    word: "#1f1913",
    rule: "#c7b58f",
    glow: "#fff6e0",
    highlight: "#ffffff",
  },
};

const U = "https://images.unsplash.com/photo-";
const Q = "?q=80&w=1600&auto=format&fit=crop";
// The default cast, all on Unsplash: Nayani Teixeira's Apollo Belvedere,
// Şafak Atalay's Hercules, Clarence E. Hsu's standing figure with flowers.
const DEFAULT_FIGURES = [
  {
    src: U + "1574359587026-daf1bfd26baa" + Q,
    alt: "The Apollo Belvedere, a cloak over one arm",
    x: 58,
    y: 100,
    h: 84,
    depth: 1,
  },
  {
    src: U + "1567522874215-d5e2f1bee83d" + Q,
    alt: "The torso of a marble Hercules",
    x: 24,
    y: 103,
    h: 90,
    depth: 1.25,
  },
  {
    src: U + "1662808141421-54240cbfd45f" + Q,
    alt: "A marble figure holding flowers",
    x: 88,
    y: 100,
    h: 100,
    depth: 0.75,
    flip: true,
    phone: false,
  },
];
// Jack Hunter's David, softened into the ground behind the cast.
const DEFAULT_BACKDROP = U + "1601887389937-0b02c26b602c" + Q;

const DEFAULT_NAV = [
  { label: "Work" },
  { label: "Studio" },
  { label: "Journal" },
  { label: "Contact" },
];
const DEFAULT_LABELS = ["Ars longa", "Vita brevis"];
const DEFAULT_ASIDES = [
  {
    title: "Practice",
    text: "Identity, interface and motion for people who still believe a screen can be composed like a page. Every frame is set by hand.",
  },
  {
    title: "Method",
    text: "Begin with the material. Marble, ink, light: the work borrows its discipline from things that were made to last.",
  },
];
const DEFAULT_ANNOTATIONS = [
  { x: 33, y: 44, label: "0.7324" },
  { x: 66, y: 36, label: "1.1429" },
  { x: 48, y: 58, label: "1.0000" },
];

const UNVEIL_MS = 3000;
const EXIT_MS = 1250;

// #region timeline
// Pure helpers, lifted out and executed by tests/old-masters-preloader.test.mjs.

const OM_CURVE = [
  [0, 0],
  [0.1, 0.14],
  [0.26, 0.2],
  [0.4, 0.52],
  [0.5, 0.56],
  [0.72, 0.84],
  [0.82, 0.88],
  [1, 1],
];

/** A simulated load that surges and stalls, 0–1 in, 0–1 out, never backwards. */
export function omSimulated(t: number) {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  for (let i = 1; i < OM_CURVE.length; i++) {
    const [t0, p0] = OM_CURVE[i - 1];
    const [t1, p1] = OM_CURVE[i];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return p0 + (p1 - p0) * s;
    }
  }
  return 1;
}

/** Progress as the ratio read-out: 0.4700. */
export function omRatio(p: number) {
  const v = Math.min(1, Math.max(0, p));
  return v.toFixed(4);
}

const round2 = (v: number) => Math.round(v * 100) / 100 + 0;

/**
 * A Greek meander (key) engraved round a circle, as one continuous path. Each
 * unit is a hook drawn in band coordinates (u along the ring, v across it) and
 * bent onto the circle: tangential strokes become arcs, radial strokes lines.
 */
export function omMeander(
  cx: number,
  cy: number,
  r: number,
  depth: number,
  units: number,
) {
  const n = Math.max(4, Math.floor(units));
  const unit = (Math.PI * 2) / n;
  const hook = [
    [0, 0],
    [0, 3],
    [4, 3],
    [4, 2],
    [2, 2],
    [2, 0],
    [6, 0],
  ];
  const at = (u: number, v: number) => {
    const a = -Math.PI / 2 + (u / 6) * unit;
    const rr = r + (v / 3 - 0.5) * depth;
    return [
      round2(cx + Math.cos(a) * rr),
      round2(cy + Math.sin(a) * rr),
      round2(rr),
    ];
  };
  let d = "";
  let prevV = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < hook.length; k++) {
      if (i > 0 && k === 0) continue;
      const [hu, hv] = hook[k];
      const [x, y, rr] = at(i * 6 + hu, hv);
      if (i === 0 && k === 0) d = "M" + x + " " + y;
      else if (hv === prevV)
        d += " A" + rr + " " + rr + " 0 0 1 " + x + " " + y;
      else d += " L" + x + " " + y;
      prevV = hv;
    }
  }
  return d;
}

/** The rect an image takes when it covers w × h, anchored at focal [fx, fy]. */
export function omCover(
  iw: number,
  ih: number,
  w: number,
  h: number,
  fx: number,
  fy: number,
) {
  if (!(iw > 0) || !(ih > 0) || !(w > 0) || !(h > 0))
    return { x: 0, y: 0, w: Math.max(0, w), h: Math.max(0, h) };
  const s = Math.max(w / iw, h / ih);
  const cw = iw * s;
  const ch = ih * s;
  const cx = Math.min(1, Math.max(0, fx));
  const cy = Math.min(1, Math.max(0, fy));
  return {
    x: round2((w - cw) * cx),
    y: round2((h - ch) * cy),
    w: round2(cw),
    h: round2(ch),
  };
}

/** Where a figure stands: its box in px from the stage size and its natural aspect. */
export function omFigureBox(
  x: number,
  y: number,
  h: number,
  aspect: number,
  stageW: number,
  stageH: number,
) {
  if (!(stageW > 0) || !(stageH > 0)) return { left: 0, top: 0, w: 0, h: 0 };
  const a = aspect > 0 ? aspect : 0.6;
  const ph = (h / 100) * stageH;
  const pw = ph * a;
  return {
    left: round2((x / 100) * stageW - pw / 2),
    top: round2((y / 100) * stageH - ph),
    w: round2(pw),
    h: round2(ph),
  };
}

/** Font size that sets a word measured at w100 (px at 100px) into avail, capped. */
export function omFit(
  w100: number,
  avail: number,
  maxFs: number,
  minFs: number,
) {
  if (!(w100 > 0) || !(avail > 0)) return minFs;
  const fs = (avail / w100) * 100;
  return Math.max(minFs, Math.min(maxFs, fs));
}

/** A linear transfer that turns luminance into mask coverage round a threshold. */
export function omTransfer(
  threshold: number,
  softness: number,
  subject: "light" | "dark",
) {
  const soft = Math.max(0.02, Math.min(1, softness));
  const th = Math.min(1, Math.max(0, threshold));
  if (subject === "light")
    return {
      slope: round2(1 / soft),
      intercept: round2(-(th - soft / 2) / soft),
    };
  return {
    slope: round2(-1 / soft),
    intercept: round2((th + soft / 2) / soft),
  };
}

/** A small seeded generator so the grain, the dust and the barcode are the same on every mount. */
export function omRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function omHash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

/** Bars of a plate barcode across width: [{ x, w }]. */
export function omBars(seed: number, count: number, width: number) {
  const rnd = omRng(seed);
  const bars: { x: number; w: number }[] = [];
  const pitch = width / Math.max(1, count);
  for (let i = 0; i < count; i++) {
    const w = Math.max(1, Math.round(pitch * (0.25 + rnd() * 0.55)));
    bars.push({ x: round2(i * pitch), w });
  }
  return bars;
}

/** The wordmark split into its script initial and the rest. */
export function omSplit(word: string, script: boolean) {
  const chars = Array.from(word);
  if (!script || chars.length === 0) return { initial: "", rest: chars };
  return { initial: chars[0], rest: chars.slice(1) };
}

/**
 * Where the baseline sits in a line-height: 1 box, as a fraction of the font
 * size from the bottom, given the face's ascent and descent in em. The content
 * area is centred in the line box, so half the leading lands on each side.
 */
export function omBaseline(ascent: number, descent: number) {
  if (!(ascent > 0) || !(descent >= 0)) return 0.2;
  return round2(((1 + descent - ascent) / 2) * 100) / 100;
}

/** Which figure the pointer is nearest, by horizontal centre; -1 when none is close. */
export function omNearest(px: number, centres: number[], reach: number) {
  let best = -1;
  let bestD = reach;
  for (let i = 0; i < centres.length; i++) {
    const d = Math.abs(centres[i] - px);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
// #endregion

const OM_CSS = `
.om-root { position: relative; width: 100%; overflow: hidden; background: var(--om-ground); color: var(--om-text); font-family: var(--om-ui); -webkit-font-smoothing: antialiased; --om-px: 0; --om-py: 0; --om-sx: 50%; --om-sy: 40%; --om-gap: 90px; --om-fill: 0%; --om-lift: 0px; }
.om-root svg, .om-root canvas, .om-root img { max-width: none; }
.om-root a { color: inherit; text-decoration: none; }
.om-root button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; }
.om-root :focus-visible { outline: 1px solid var(--om-accent); outline-offset: 4px; }
.om-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
.om-page { position: absolute; inset: 0; overflow: auto; }
.om-stage { position: absolute; inset: 0; overflow: hidden; background: var(--om-ground); clip-path: inset(0 0 0 0); }
.om-root[data-phase="exit"] .om-stage { clip-path: inset(0 0 100% 0); transition: clip-path 1.2s cubic-bezier(0.76, 0, 0.24, 1); }
.om-root[data-phase="exit"] .om-cast { transform: translate3d(0, -12%, 0); transition: transform 1.2s cubic-bezier(0.76, 0, 0.24, 1); }
.om-root[data-phase="exit"] .om-chrome { opacity: 0; transition: opacity 0.5s ease; }

/* ---- the flood, the backdrop, the light ---------------------------------- */
.om-flood { position: absolute; inset: 0; background: radial-gradient(ellipse 90% 80% at 50% 110%, var(--om-stage-l) 0%, var(--om-stage) 55%, var(--om-stage-d) 100%); clip-path: circle(0% at 50% 56%); }
.om-root[data-phase="unveil"] .om-flood, .om-root[data-phase="landing"] .om-flood, .om-root[data-phase="exit"] .om-flood { clip-path: circle(120% at 50% 56%); transition: clip-path 1.7s cubic-bezier(0.16, 1, 0.3, 1) 0.2s; }
.om-backdrop { position: absolute; display: block; opacity: 0; filter: grayscale(1) contrast(1.15) brightness(0.55) blur(3px); transform: translate3d(calc(var(--om-px) * 4px), calc(var(--om-py) * 3px), 0) scale(1.06); }
.om-root[data-phase="landing"] .om-backdrop, .om-root[data-phase="exit"] .om-backdrop, .om-root[data-phase="unveil"] .om-backdrop { opacity: 0.42; transition: opacity 2.4s ease 0.9s; }
.om-root[data-tone="vellum"] .om-backdrop { filter: grayscale(1) contrast(1.1) brightness(1.15) blur(3px); mix-blend-mode: multiply; }
.om-light { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; mix-blend-mode: screen; opacity: 0; filter: blur(4px); }
.om-root[data-tone="vellum"] .om-light { mix-blend-mode: multiply; }
.om-root[data-phase="landing"] .om-light, .om-root[data-phase="exit"] .om-light, .om-root[data-phase="unveil"] .om-light { opacity: 1; transition: opacity 2.6s ease 1.1s; }
.om-spot { position: absolute; inset: -20%; pointer-events: none; mix-blend-mode: screen; opacity: 0; background: radial-gradient(circle 30vmax at var(--om-sx) var(--om-sy), var(--om-glow-a) 0%, transparent 62%); transition: opacity 1.2s ease 1.6s; }
.om-root[data-tone="vellum"] .om-spot { mix-blend-mode: soft-light; }
.om-root[data-phase="landing"] .om-spot, .om-root[data-phase="exit"] .om-spot { opacity: 1; }
.om-flash { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 50% 50%, var(--om-glow-b) 0%, transparent 50%); opacity: 0; }
.om-root[data-phase="unveil"] .om-flash { animation: om-flash 1.2s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
@keyframes om-flash { 0% { opacity: 0; } 10% { opacity: 1; } 100% { opacity: 0; } }
.om-grain { position: absolute; inset: -32px; pointer-events: none; background-repeat: repeat; background-size: 160px 160px; opacity: var(--om-grain); mix-blend-mode: overlay; animation: om-grain 0.5s steps(1) infinite; }
@keyframes om-grain { 0% { transform: translate(0, 0); } 25% { transform: translate(-16px, 9px); } 50% { transform: translate(11px, -14px); } 75% { transform: translate(-7px, -19px); } }
.om-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 80% 70% at 50% 45%, transparent 55%, var(--om-ground-a) 100%); opacity: 0; }
.om-root[data-phase="landing"] .om-vignette, .om-root[data-phase="exit"] .om-vignette { opacity: 1; transition: opacity 2s ease 1s; }

/* ---- the meander ---------------------------------------------------------- */
.om-ring { position: absolute; left: 50%; top: 50%; width: var(--om-ring); height: var(--om-ring); transform: translate(-50%, -50%); overflow: visible; }
.om-ring-spin { transform-origin: 200px 200px; animation: om-spin 90s linear infinite; }
@keyframes om-spin { to { transform: rotate(360deg); } }
.om-ring-hair { fill: none; stroke: var(--om-rule); stroke-width: 1; vector-effect: non-scaling-stroke; opacity: 0; transition: opacity 1.4s ease 0.4s; }
.om-ring-key { fill: none; stroke: var(--om-accent); stroke-width: 1.3; vector-effect: non-scaling-stroke; stroke-linejoin: miter; stroke-linecap: butt; stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0; transition: opacity 0.6s ease 0.4s, stroke-dashoffset 2.2s cubic-bezier(0.16, 1, 0.3, 1) 0.5s; }
.om-root[data-up="true"] .om-ring-hair { opacity: 0.8; }
.om-root[data-up="true"] .om-ring-key { opacity: 0.55; stroke-dashoffset: 0; }
.om-root[data-phase="unveil"] .om-ring, .om-root[data-phase="landing"] .om-ring, .om-root[data-phase="exit"] .om-ring { transform: translate(-50%, -50%) scale(2.6); opacity: 0; transition: transform 1.5s cubic-bezier(0.16, 1, 0.3, 1) 0.15s, opacity 1s ease 0.25s; pointer-events: none; }
.om-root[data-phase="unveil"] .om-ring-key { stroke: var(--om-glow); opacity: 1; filter: drop-shadow(0 0 6px var(--om-glow)); transition: stroke 0.25s ease, opacity 0.25s ease; }

/* ---- the word ------------------------------------------------------------ */
.om-wordlayer { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.om-wordclip { position: absolute; left: 0; right: 0; bottom: 0; height: calc(var(--om-fs) * (var(--om-cap) + 0.2) + 1.4vh); overflow: visible; }
.om-word { position: absolute; left: 0; right: 0; bottom: calc(var(--om-fs) * var(--om-base) * -1 + 1.4vh); margin: 0; text-align: center; white-space: nowrap; font-family: var(--om-face); font-weight: var(--om-weight); font-size: var(--om-fs); line-height: 1; letter-spacing: calc(var(--om-tracking) * 1em); text-transform: uppercase; transform: translate3d(calc(var(--om-px) * 8px), calc(var(--om-lift) + var(--om-py) * 5px), 0); transition: transform 1.6s cubic-bezier(0.7, 0, 0.18, 1) 0.35s; }
.om-root[data-phase="load"] .om-wordlayer { z-index: 5; }
.om-root[data-phase="load"] .om-word { transition: none; }
.om-l, .om-init { display: inline-block; pointer-events: auto; color: transparent; -webkit-text-stroke: 1px var(--om-word-a); background-image: linear-gradient(to top, var(--om-word) 0%, var(--om-word) calc(var(--om-fill) - 1.2%), var(--om-glow) calc(var(--om-fill) - 0.4%), var(--om-glow) calc(var(--om-fill) + 0.3%), transparent calc(var(--om-fill) + 1.4%)); -webkit-background-clip: text; background-clip: text; opacity: 0; transform: translate3d(0, 10px, 0); transition: opacity 0.9s ease calc(0.5s + var(--i) * 55ms), transform 1.1s cubic-bezier(0.16, 1, 0.3, 1) calc(0.5s + var(--i) * 55ms), -webkit-text-stroke-color 0.4s ease, background-image 0.4s ease; }
.om-root[data-up="true"] .om-l, .om-root[data-up="true"] .om-init { opacity: 1; transform: none; }
.om-root[data-phase="landing"] .om-l, .om-root[data-phase="exit"] .om-l, .om-root[data-phase="unveil"] .om-l, .om-root[data-phase="landing"] .om-init, .om-root[data-phase="exit"] .om-init, .om-root[data-phase="unveil"] .om-init { background-image: linear-gradient(to top, var(--om-word), var(--om-word)); -webkit-text-stroke-color: transparent; }
.om-root[data-phase="landing"] .om-l:hover { background-image: linear-gradient(to top, transparent, transparent); -webkit-text-stroke-color: var(--om-word); transition: background-image 0.25s ease, -webkit-text-stroke-color 0.25s ease; }
.om-root[data-phase="landing"] .om-init, .om-root[data-phase="exit"] .om-init, .om-root[data-phase="unveil"] .om-init { background-image: linear-gradient(to top, var(--om-accent), var(--om-accent)); }
.om-sheen { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(115deg, transparent 30%, var(--om-glow-c) 48%, var(--om-glow-d) 50%, var(--om-glow-c) 52%, transparent 70%); background-size: 260% 100%; background-position: 120% 0; opacity: 0; mix-blend-mode: screen; }
.om-root[data-phase="unveil"] .om-sheen { animation: om-sheen 1.1s cubic-bezier(0.4, 0, 0.2, 1) both; }
@keyframes om-sheen { 0% { opacity: 1; background-position: 120% 0; } 100% { opacity: 1; background-position: -40% 0; } }
.om-sp { display: inline-block; width: 0.26em; }
.om-init { font-family: var(--om-script); font-weight: 400; font-size: 1.32em; line-height: 1; letter-spacing: 0; text-transform: none; margin-right: -0.14em; position: relative; z-index: 1; vertical-align: baseline; -webkit-text-stroke-color: var(--om-accent-a); background-image: linear-gradient(to top, var(--om-accent) 0%, var(--om-accent) calc(var(--om-fill) - 1.2%), var(--om-glow) calc(var(--om-fill) - 0.4%), var(--om-glow) calc(var(--om-fill) + 0.3%), transparent calc(var(--om-fill) + 1.4%)); }

/* ---- the cast ------------------------------------------------------------ */
.om-cast { position: absolute; inset: 0; pointer-events: none; perspective: 1400px; perspective-origin: 50% 40%; z-index: 2; }
.om-cast-front { z-index: 4; }
.om-root[data-narrow="true"] .om-wordlayer { z-index: 5; }
.om-tilt { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateX(calc(var(--om-py) * var(--om-tilt) * -1deg)) rotateY(calc(var(--om-px) * var(--om-tilt) * 1deg)); }
.om-fig { position: absolute; transform-origin: 50% 100%; transform: translate3d(calc(var(--om-px) * var(--om-depth) * 22px), calc(28% + var(--om-py) * var(--om-depth) * 10px), 0); opacity: 0; filter: brightness(0.6); will-change: transform, opacity; }
.om-root[data-phase="unveil"] .om-fig, .om-root[data-phase="landing"] .om-fig, .om-root[data-phase="exit"] .om-fig { opacity: 1; filter: brightness(var(--om-exposure)); transform: translate3d(calc(var(--om-px) * var(--om-depth) * 22px), calc(var(--om-py) * var(--om-depth) * 10px + var(--om-bob)), 0); transition: transform 2s cubic-bezier(0.16, 1, 0.3, 1) calc(0.65s + var(--i) * 0.24s), opacity 1.2s ease calc(0.65s + var(--i) * 0.24s), filter 2s ease calc(0.65s + var(--i) * 0.24s); }
.om-root[data-phase="landing"] .om-fig { transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1), filter 0.9s ease; }
.om-root[data-phase="landing"] .om-fig[data-near="true"] { filter: brightness(calc(var(--om-exposure) * 1.08)); transform: translate3d(calc(var(--om-px) * var(--om-depth) * 22px), calc(var(--om-py) * var(--om-depth) * 10px - 10px), 0) scale(1.018); }
.om-fig-in { position: absolute; inset: 0; animation: om-bob 9s ease-in-out infinite; animation-delay: calc(var(--i) * -3s); }
@keyframes om-bob { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(0, -0.6%, 0); } }
.om-fig img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: fill; }
.om-fig[data-flip="true"] img { transform: scaleX(-1); }
.om-root[data-duotone="true"] .om-fig img { filter: grayscale(1) contrast(1.12); }
.om-duo { position: absolute; inset: 0; pointer-events: none; display: none; }
.om-root[data-duotone="true"] .om-duo { display: block; }
.om-duo-a { background: var(--om-ground); mix-blend-mode: lighten; }
.om-duo-b { background: var(--om-highlight); mix-blend-mode: multiply; }
.om-fig-shadow { position: absolute; left: 10%; right: 10%; bottom: -1.5%; height: 6%; border-radius: 50%; background: radial-gradient(ellipse at 50% 50%, var(--om-ground-b) 0%, transparent 70%); filter: blur(6px); }

/* ---- interface ------------------------------------------------------------ */
.om-chrome { position: absolute; inset: 0; pointer-events: none; }
.om-chrome > * { pointer-events: auto; }
.om-ui { font-family: var(--om-ui); font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 500; }
.om-top { position: absolute; left: 0; right: 0; top: 0; height: 64px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 0 clamp(18px, 3.2vw, 48px); }
.om-rule { position: absolute; left: clamp(18px, 3.2vw, 48px); right: clamp(18px, 3.2vw, 48px); top: 64px; height: 1px; background: var(--om-rule); transform: scaleX(0); transform-origin: 50% 50%; transition: transform 1.3s cubic-bezier(0.16, 1, 0.3, 1) 0.2s; }
.om-rule[data-gap="true"] { -webkit-mask-image: linear-gradient(to right, #000 calc(50% - var(--om-gap)), transparent calc(50% - var(--om-gap)), transparent calc(50% + var(--om-gap)), #000 calc(50% + var(--om-gap))); mask-image: linear-gradient(to right, #000 calc(50% - var(--om-gap)), transparent calc(50% - var(--om-gap)), transparent calc(50% + var(--om-gap)), #000 calc(50% + var(--om-gap))); }
.om-root[data-up="true"] .om-rule { transform: scaleX(1); }
.om-eyebrow { position: absolute; left: 50%; top: 64px; transform: translate(-50%, -50%); color: var(--om-muted); font-size: 10.5px; letter-spacing: 0.3em; white-space: nowrap; opacity: 0; transition: opacity 0.9s ease 0.9s; }
.om-root[data-up="true"] .om-eyebrow { opacity: 1; }
.om-navl, .om-navr { display: flex; gap: clamp(18px, 2.4vw, 36px); margin: 0; padding: 0; list-style: none; }
.om-navr { justify-content: flex-end; }
.om-navl li, .om-navr li { opacity: 0; transform: translateY(6px); transition: opacity 0.7s ease calc(0.5s + var(--i) * 70ms), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) calc(0.5s + var(--i) * 70ms); }
.om-root[data-up="true"] .om-navl li, .om-root[data-up="true"] .om-navr li { opacity: 1; transform: none; }
.om-navl a, .om-navl button, .om-navr a, .om-navr button { position: relative; display: inline-block; padding: 6px 0; color: var(--om-text); opacity: 0.8; transition: opacity 0.3s ease; }
.om-navl a:hover, .om-navl button:hover, .om-navr a:hover, .om-navr button:hover { opacity: 1; }
.om-navl a::after, .om-navl button::after, .om-navr a::after, .om-navr button::after { content: ""; position: absolute; left: 0; right: 0; bottom: 2px; height: 1px; background: currentColor; transform: scaleX(0); transform-origin: 0 50%; transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.om-navl a:hover::after, .om-navl button:hover::after, .om-navr a:hover::after, .om-navr button:hover::after { transform: scaleX(1); }
.om-brand { font-family: var(--om-serif); font-size: 22px; font-style: italic; letter-spacing: 0.02em; text-transform: none; font-weight: 400; color: var(--om-text); opacity: 0; transition: opacity 0.9s ease 0.4s; }
.om-root[data-up="true"] .om-brand { opacity: 1; }
.om-pill { position: absolute; top: 96px; padding: 7px 15px 6px; border: 1px solid var(--om-rule); border-radius: 999px; color: var(--om-text); font-size: 10.5px; letter-spacing: 0.24em; white-space: nowrap; opacity: 0; transform: translateY(4px); transition: opacity 0.8s ease, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
.om-pill-l { left: clamp(18px, 7vw, 120px); }
.om-pill-r { right: clamp(18px, 7vw, 120px); }
.om-root[data-pills="1"] .om-pill-l, .om-root[data-pills="2"] .om-pill { opacity: 1; transform: none; }
.om-star { position: absolute; width: 18px; height: 18px; color: var(--om-accent); opacity: 0; transform: scale(0.4) rotate(-30deg); transition: opacity 0.9s ease calc(0.6s + var(--i) * 140ms), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1) calc(0.6s + var(--i) * 140ms), left 1.6s cubic-bezier(0.16, 1, 0.3, 1), top 1.6s cubic-bezier(0.16, 1, 0.3, 1); }
.om-root[data-up="true"] .om-star { opacity: 1; transform: none; }
.om-star svg { display: block; width: 100%; height: 100%; animation: om-twinkle 3.6s ease-in-out infinite; animation-delay: calc(var(--i) * -0.9s); transform-origin: 50% 50%; }
.om-star-s { width: 10px; height: 10px; }
.om-root[data-phase="landing"] .om-star-c, .om-root[data-phase="exit"] .om-star-c { opacity: 0; transition: opacity 0.8s ease 0.8s; }
@keyframes om-twinkle { 0%, 100% { transform: scale(0.72) rotate(0deg); opacity: 0.55; } 50% { transform: scale(1) rotate(12deg); opacity: 1; } }
.om-aside { position: absolute; top: 40%; width: 200px; font-size: 11.5px; line-height: 1.65; letter-spacing: 0.01em; color: var(--om-muted); text-shadow: 0 1px 14px var(--om-ground-c), 0 0 2px var(--om-ground-c); opacity: 0; transform: translateY(10px); transition: opacity 1s ease, transform 1s cubic-bezier(0.16, 1, 0.3, 1); }
.om-aside-l { left: clamp(18px, 7vw, 120px); }
.om-aside-r { right: clamp(18px, 7vw, 120px); text-align: right; }
.om-aside b { display: block; margin-bottom: 8px; font-weight: 500; font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--om-accent); }
.om-aside p { margin: 0; }
.om-root[data-phase="landing"] .om-aside, .om-root[data-phase="exit"] .om-aside { opacity: 1; transform: none; }
.om-root[data-phase="landing"] .om-aside-l { transition-delay: 2.1s; }
.om-root[data-phase="landing"] .om-aside-r { transition-delay: 2.25s; }

/* ---- the counter ---------------------------------------------------------- */
.om-counter { position: absolute; right: clamp(18px, 3.2vw, 48px); bottom: clamp(18px, 3.2vw, 44px); text-align: right; opacity: 0; transform: translateY(8px); transition: opacity 0.9s ease 0.7s, transform 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.7s; }
.om-root[data-up="true"] .om-counter { opacity: 1; transform: none; }
.om-num { margin: 0; font-family: var(--om-serif); font-weight: 400; font-size: clamp(64px, 11vh, 120px); line-height: 0.9; letter-spacing: -0.02em; color: var(--om-text); font-variant-numeric: tabular-nums lining-nums; }
.om-ratio { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 10px; color: var(--om-muted); font-size: 10.5px; letter-spacing: 0.26em; white-space: nowrap; font-variant-numeric: tabular-nums; }
.om-ratio i { display: block; width: 22px; height: 1px; background: var(--om-rule); }
.om-root[data-phase="unveil"] .om-counter, .om-root[data-phase="landing"] .om-counter, .om-root[data-phase="exit"] .om-counter { opacity: 0; filter: blur(6px); transition: opacity 0.5s ease 0.1s, filter 0.5s ease 0.1s; pointer-events: none; }

/* ---- the copy ------------------------------------------------------------- */
.om-copy { position: absolute; left: 50%; top: 16.5%; transform: translateX(-50%); width: min(88vw, 760px); text-align: center; }
.om-tagline { margin: 0; font-family: var(--om-serif); font-style: italic; font-weight: 400; font-size: clamp(22px, 2.9vw, 42px); line-height: 1.15; letter-spacing: 0.005em; color: var(--om-text); text-shadow: 0 1px 24px var(--om-ground-c); }
.om-tagline span { display: inline-block; opacity: 0; transform: translateY(14px); transition: opacity 0.8s ease calc(1.7s + var(--i) * 55ms), transform 0.9s cubic-bezier(0.16, 1, 0.3, 1) calc(1.7s + var(--i) * 55ms); }
.om-root[data-phase="landing"] .om-tagline span, .om-root[data-phase="exit"] .om-tagline span, .om-root[data-phase="unveil"] .om-tagline span { opacity: 1; transform: none; }
.om-root .om-cta { display: inline-block; margin-top: 26px; padding: 13px 30px 12px; border: 1px solid var(--om-text); color: var(--om-text); background: var(--om-ground-d); font-family: var(--om-ui); font-size: 11.5px; letter-spacing: 0.26em; text-transform: uppercase; font-weight: 500; opacity: 0; transform: translateY(10px) scale(0.98); transition: opacity 0.8s ease 2.2s, transform 0.9s cubic-bezier(0.16, 1, 0.3, 1) 2.2s, background-color 0.35s ease, color 0.35s ease; }
.om-root[data-phase="landing"] .om-cta, .om-root[data-phase="exit"] .om-cta, .om-root[data-phase="unveil"] .om-cta { opacity: 1; transform: none; }
.om-root .om-cta:hover { background: var(--om-text); color: var(--om-stage); }
.om-ann { position: absolute; width: 58px; height: 30px; color: var(--om-text); opacity: 0; transform: scale(0.7); transform-origin: 0 0; transition: opacity 0.6s ease calc(2.3s + var(--i) * 160ms), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) calc(2.3s + var(--i) * 160ms); }
.om-root[data-phase="landing"] .om-ann, .om-root[data-phase="exit"] .om-ann { opacity: 1; transform: none; }
.om-ann svg { display: block; width: 58px; height: 30px; overflow: visible; }
.om-ann span { position: absolute; left: 62px; top: 11px; font-size: 10px; letter-spacing: 0.16em; font-variant-numeric: tabular-nums; white-space: nowrap; text-shadow: 0 1px 10px var(--om-ground-c); }
.om-root[data-tone="vellum"] .om-ann { color: var(--om-accent); }
.om-foot { position: absolute; left: clamp(18px, 3.2vw, 48px); right: clamp(18px, 3.2vw, 48px); bottom: clamp(16px, 2.6vw, 30px); display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; transition: bottom 1.5s cubic-bezier(0.16, 1, 0.3, 1) 0.6s; }
.om-root[data-phase="unveil"] .om-foot, .om-root[data-phase="landing"] .om-foot, .om-root[data-phase="exit"] .om-foot { bottom: calc(var(--om-fs) * (var(--om-cap) + 0.03) + 1.4vh + 18px); }
.om-bars { display: block; width: 92px; height: 22px; color: var(--om-text); opacity: 0; transition: opacity 1s ease 1s; }
.om-root[data-up="true"] .om-bars { opacity: 0.75; }
.om-plate { color: var(--om-muted); font-size: 10.5px; letter-spacing: 0.26em; opacity: 0; text-shadow: 0 1px 12px var(--om-ground-c); transition: opacity 1s ease 1.1s; }
.om-root[data-up="true"] .om-plate { opacity: 1; }
.om-root[data-phase="load"] .om-plate { display: none; }
.om-skip { position: absolute; left: 50%; bottom: clamp(16px, 2.6vw, 30px); transform: translateX(-50%); color: var(--om-muted); font-size: 10.5px; letter-spacing: 0.3em; padding: 6px 10px; opacity: 0; transition: opacity 0.8s ease 1.6s, color 0.3s ease; }
.om-root[data-up="true"][data-phase="load"] .om-skip { opacity: 1; }
.om-skip:hover { color: var(--om-text); }
.om-hint { position: absolute; left: 50%; bottom: clamp(14px, 2vw, 24px); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; color: var(--om-muted); font-size: 9.5px; letter-spacing: 0.3em; opacity: 0; transition: opacity 1s ease 3s; }
.om-hint i { display: block; width: 1px; height: 26px; background: linear-gradient(to bottom, transparent, var(--om-text)); animation: om-hint 2.2s ease-in-out infinite; }
@keyframes om-hint { 0% { transform: scaleY(0); transform-origin: 0 0; } 50% { transform: scaleY(1); transform-origin: 0 0; } 51% { transform-origin: 0 100%; } 100% { transform: scaleY(0); transform-origin: 0 100%; } }
.om-root[data-phase="landing"][data-gate="true"] .om-hint { opacity: 1; }
.om-root[data-phase="load"] .om-copy, .om-root[data-phase="load"] .om-ann, .om-root[data-phase="load"] .om-aside { visibility: hidden; }
.om-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---- responsive ------------------------------------------------------------ */
@media (max-width: 1023px) { .om-aside { display: none; } }
@media (max-width: 639px) {
  .om-navl, .om-navr { display: none; }
  .om-top { grid-template-columns: 1fr; justify-items: center; }
  .om-pill { top: 86px; }
  .om-pill-l { left: 18px; }
  .om-pill-r { right: 18px; }
  .om-copy { top: 19%; width: 88vw; }
  .om-star { top: 15.5% !important; }
  .om-star-s { top: 72% !important; }
  .om-tagline { font-size: clamp(19px, 6vw, 26px); }
  .om-root .om-cta { margin-top: 18px; padding: 11px 22px 10px; }
  .om-ann { display: none; }
  .om-num { font-size: 56px; }
  .om-foot { bottom: 14px; }
  .om-skip { bottom: 17%; }
  .om-hint { left: 18px; transform: none; }
}

/* ---- instant and reduced -------------------------------------------------- */
.om-root[data-instant="true"] *, .om-root[data-instant="true"] *::before, .om-root[data-instant="true"] *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; }
@media (prefers-reduced-motion: reduce) {
  .om-root { --om-px: 0 !important; --om-py: 0 !important; --om-tilt: 0 !important; --om-bob: 0px !important; }
  .om-star svg, .om-grain, .om-ring-spin, .om-fig-in, .om-hint i { animation: none; }
  .om-word { transition: transform 0.01s linear 0.35s; }
  .om-fig { transition-duration: 0.9s !important; }
  .om-root[data-phase="unveil"] .om-ring, .om-root[data-phase="landing"] .om-ring { transform: translate(-50%, -50%); transition: opacity 0.6s ease; }
  .om-root[data-phase="unveil"] .om-flood, .om-root[data-phase="landing"] .om-flood { transition-duration: 0.6s; }
  .om-root[data-phase="unveil"] .om-sheen { animation: none; }
  .om-root[data-phase="exit"] .om-stage { transition-duration: 0.6s; }
  .om-root[data-phase="exit"] .om-cast { transform: none; }
  .om-ring-key { transition: opacity 0.6s ease 0.4s; }
}
`;

const STAR_PATH =
  "M12 0C12.6 6.8 17.2 11.4 24 12C17.2 12.6 12.6 17.2 12 24C11.4 17.2 6.8 12.6 0 12C6.8 11.4 11.4 6.8 12 0Z";
const STARS = [
  { x: "4.4%", y: "15%", small: false, under: false },
  { x: "95%", y: "15%", small: false, under: false },
  { x: "7.5%", y: "72%", small: true, under: false },
  { x: "92.5%", y: "70%", small: true, under: false },
  { x: "50%", y: "84%", small: true, under: true },
];

function hexAlpha(hex: string, alpha: number) {
  const m = hex.replace("#", "");
  const n =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return hex;
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

function hexMix(a: string, b: string, t: number) {
  const p = (h: string) => {
    const m = h.replace("#", "");
    const n =
      m.length === 3
        ? m
            .split("")
            .map((c) => c + c)
            .join("")
        : m;
    return [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16),
    ];
  };
  const x = p(a);
  const y = p(b);
  if (x.some((v) => Number.isNaN(v)) || y.some((v) => Number.isNaN(v)))
    return a;
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function paintGrain(seed: number) {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 160;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(160, 160);
  const rnd = omRng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.floor(rnd() * 96);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

let omUid = 0;

export default function OldMastersPreloader({
  paused = false,
  progress,
  durationMs = 4800,
  minLoadMs = 2600,
  skippable = true,
  skipIntro = false,
  figures = DEFAULT_FIGURES,
  backdrop = DEFAULT_BACKDROP,
  wordDepth = 0.9,
  exposure = 1,
  duotone,
  rays = true,
  dust = true,
  tilt = 2.5,
  wordmark = "Arcadia",
  face = "didone",
  scriptInitial = false,
  tagline = "Your craft. Your name. Your rules.",
  eyebrow = "Portfolio · MMXXVI",
  brand = "A.",
  nav = DEFAULT_NAV,
  labels = DEFAULT_LABELS,
  asides = DEFAULT_ASIDES,
  annotations = DEFAULT_ANNOTATIONS,
  plate = "Pl. I",
  loadingLabel = "Loading",
  cta = { label: "Enter" },
  onEnter,
  onLoaded,
  onComplete,
  children,
  holdMs = 0,
  scrollToEnter = true,
  tone = "carmine",
  palette,
  fontHref = FONT_HREF,
  height = "100svh",
  className = "",
}: OldMastersPreloaderProps) {
  const pal = { ...TONES[tone], ...(palette || {}) };
  const faceDef = FACES[face];
  const isDuotone = duotone === undefined ? tone === "carmine" : duotone;

  const rootRef = React.useRef(null as HTMLDivElement | null);
  const stageRef = React.useRef(null as HTMLDivElement | null);
  const numRef = React.useRef(null as HTMLSpanElement | null);
  const ratioRef = React.useRef(null as HTMLSpanElement | null);
  const wordRef = React.useRef(null as HTMLDivElement | null);
  const liveRef = React.useRef(null as HTMLDivElement | null);
  const eyebrowRef = React.useRef(null as HTMLDivElement | null);
  const lightRef = React.useRef(null as HTMLCanvasElement | null);

  const [uid] = React.useState(
    () =>
      "om" + (omUid++).toString(36) + Math.random().toString(36).slice(2, 7),
  );
  const [phase, setPhase] = React.useState(skipIntro ? "landing" : "load");
  const [up, setUp] = React.useState(false);
  const [instant, setInstant] = React.useState(skipIntro);
  const [pct, setPct] = React.useState(skipIntro ? 100 : 0);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [naturals, setNaturals] = React.useState(
    {} as { [src: string]: { w: number; h: number } },
  );
  const [fontsReady, setFontsReady] = React.useState(0);
  const [grain, setGrain] = React.useState("");
  const [fs, setFs] = React.useState(120);
  const [metrics, setMetrics] = React.useState({ base: 0.16, cap: 0.7 });

  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;
  const progressRef = React.useRef(progress);
  progressRef.current = progress;
  const rushRef = React.useRef(false);
  const shownRef = React.useRef(skipIntro ? 1 : 0);
  const pctRef = React.useRef(skipIntro ? 100 : 0);
  const pointerRef = React.useRef({
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    sx: 50,
    sy: 40,
    near: -1,
    inside: false,
  });
  const centresRef = React.useRef([] as number[]);
  const onLoadedRef = React.useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onEnterRef = React.useRef(onEnter);
  onEnterRef.current = onEnter;

  const chars = React.useMemo(
    () => omSplit(wordmark, scriptInitial),
    [wordmark, scriptInitial],
  );
  const hasChildren = children !== undefined && children !== null;
  const keyPath = React.useMemo(() => omMeander(200, 200, 176, 22, 32), []);
  const bars = React.useMemo(
    () => omBars(omHash(wordmark), 34, 92),
    [wordmark],
  );
  const narrow = size.w > 0 && size.w < 640;
  const cast = React.useMemo(
    () => figures.filter((f) => !narrow || f.phone !== false),
    [figures, narrow],
  );

  // Fonts: one injected <link>, then wait for the faces (or a short timeout).
  React.useEffect(() => {
    if (!fontHref) {
      setFontsReady(1);
      return;
    }
    if (!document.querySelector('link[data-om-fonts="' + fontHref + '"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fontHref;
      link.setAttribute("data-om-fonts", fontHref);
      document.head.appendChild(link);
    }
    let live = true;
    const go = () => {
      if (live) setFontsReady((n) => n + 1);
    };
    const timer = setTimeout(go, 2500);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts && fonts.load) {
      Promise.all(FONT_PROBES.map((f) => fonts.load(f).catch(() => null))).then(
        go,
        go,
      );
      fonts.addEventListener("loadingdone", go);
    } else go();
    return () => {
      live = false;
      clearTimeout(timer);
      if (fonts && fonts.removeEventListener)
        fonts.removeEventListener("loadingdone", go);
    };
  }, [fontHref]);

  // The stage's size, for the cast, the masks and the fit.
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5
          ? s
          : { w: r.width, h: r.height },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Every photograph's natural size, for its box and its mask.
  const srcKey = figures.map((f) => f.src).join("\n") + "\n" + (backdrop || "");
  React.useEffect(() => {
    if (typeof Image === "undefined") return;
    let live = true;
    const list = srcKey.split("\n").filter(Boolean);
    for (const src of list) {
      const img = new Image();
      img.onload = () => {
        if (live)
          setNaturals((n) =>
            n[src]
              ? n
              : { ...n, [src]: { w: img.naturalWidth, h: img.naturalHeight } },
          );
      };
      img.src = src;
    }
    return () => {
      live = false;
    };
  }, [srcKey]);

  // Grain is painted once, on mount.
  React.useEffect(() => {
    setGrain(paintGrain(omHash(wordmark) ^ 0x9e3779b9));
  }, [wordmark]);

  // Fit the wordmark to the stage width and read the face's metrics.
  React.useEffect(() => {
    if (!size.w || !size.h || typeof document === "undefined") return;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const rest = chars.rest.join("").toUpperCase();
    ctx.font = faceDef.weight + " 100px " + faceDef.family;
    const h = ctx.measureText("H");
    const cap =
      h.actualBoundingBoxAscent > 0 ? h.actualBoundingBoxAscent / 100 : 0.7;
    const base = omBaseline(
      h.fontBoundingBoxAscent / 100,
      h.fontBoundingBoxDescent / 100,
    );
    setMetrics({ base, cap: Math.round(cap * 100) / 100 });
    let w100 =
      ctx.measureText(rest).width +
      Math.max(0, chars.rest.length - 1) * faceDef.tracking * 100;
    if (chars.initial) {
      ctx.font = "400 132px " + SCRIPT_FAMILY;
      w100 += ctx.measureText(chars.initial).width - 14;
    }
    const pad = Math.max(10, size.w * 0.025);
    const maxFs = (size.h * 0.34) / cap;
    setFs(Math.round(omFit(w100, size.w - pad * 2, maxFs, 36)));
  }, [size, chars, faceDef, fontsReady]);

  // The rule leaves a gap round the eyebrow.
  React.useEffect(() => {
    const el = eyebrowRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    const read = () =>
      root.style.setProperty(
        "--om-gap",
        Math.round(el.offsetWidth / 2 + 14) + "px",
      );
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [eyebrow, fontsReady]);

  // Curtain up: the rule draws, the nav, the ring and the outlines come in.
  React.useEffect(() => {
    const t = setTimeout(() => setUp(true), 60);
    return () => clearTimeout(t);
  }, []);

  // skipIntro: first paint without transitions.
  React.useEffect(() => {
    if (!instant) return;
    const t = setTimeout(() => setInstant(false), 80);
    return () => clearTimeout(t);
  }, [instant]);

  // The load, the parallax, the nearest figure and the read-outs, on one frame loop.
  React.useEffect(() => {
    const reduced =
      paused ||
      (typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches);
    let raf = 0;
    let last = performance.now();
    const start = last;
    let done = phaseRef.current !== "load";
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const root = rootRef.current;
      // the load
      if (!done) {
        const elapsed = now - start;
        const external = progressRef.current;
        let target =
          external === undefined
            ? omSimulated(elapsed / Math.max(400, durationMs))
            : Math.min(1, Math.max(0, external / 100));
        if (rushRef.current) target = 1;
        const k = 1 - Math.exp(-dt / (rushRef.current ? 90 : 170));
        let shown = shownRef.current + (target - shownRef.current) * k;
        if (target >= 1 && shown > 0.995) shown = 1;
        shownRef.current = Math.max(shownRef.current, shown);
        const s = shownRef.current;
        if (wordRef.current)
          wordRef.current.style.setProperty(
            "--om-fill",
            (s * 100).toFixed(2) + "%",
          );
        const p = Math.round(s * 100);
        if (p !== pctRef.current) {
          pctRef.current = p;
          if (numRef.current) numRef.current.textContent = String(p);
          if (ratioRef.current) ratioRef.current.textContent = omRatio(s);
          if (p % 10 === 0 || p === 100) setPct(p);
        }
        if (s >= 1 && (elapsed >= minLoadMs || rushRef.current)) {
          done = true;
          setPct(100);
          if (wordRef.current)
            wordRef.current.style.setProperty("--om-fill", "102%");
          setPhase("unveil");
        }
      }
      // the parallax, the spotlight, the nearest figure
      const pt = pointerRef.current;
      if (root && !reduced) {
        const ease = 1 - Math.exp(-dt / 240);
        pt.x += (pt.tx - pt.x) * ease;
        pt.y += (pt.ty - pt.y) * ease;
        const sx = 50 + pt.tx * 24;
        const sy = 40 + pt.ty * 22;
        pt.sx += (sx - pt.sx) * ease;
        pt.sy += (sy - pt.sy) * ease;
        root.style.setProperty("--om-px", pt.x.toFixed(3));
        root.style.setProperty("--om-py", pt.y.toFixed(3));
        root.style.setProperty("--om-sx", pt.sx.toFixed(2) + "%");
        root.style.setProperty("--om-sy", pt.sy.toFixed(2) + "%");
        const near =
          pt.inside && phaseRef.current === "landing"
            ? omNearest((pt.tx + 1) / 2, centresRef.current, 0.22)
            : -1;
        if (near !== pt.near) {
          pt.near = near;
          const figs = root.querySelectorAll(".om-fig");
          figs.forEach((f) =>
            f.setAttribute(
              "data-near",
              f.getAttribute("data-index") === String(near) ? "true" : "false",
            ),
          );
        }
      }
      if (!(paused && done)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, minLoadMs, paused]);

  // The light: shafts from above and dust in them, on a canvas.
  React.useEffect(() => {
    const canvas = lightRef.current;
    if (!canvas || (!rays && !dust)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !size.w || !size.h) return;
    const reduced =
      paused ||
      (typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches);
    const dpr = Math.min(
      1.5,
      typeof devicePixelRatio === "number" ? devicePixelRatio : 1,
    );
    const w = Math.round(size.w);
    const h = Math.round(size.h);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const rnd = omRng(omHash(wordmark) ^ 0x51ed27);
    const motes = Array.from(
      { length: dust ? Math.round(Math.min(140, (w * h) / 11000)) : 0 },
      () => ({
        x: rnd() * w,
        y: rnd() * h,
        r: 0.5 + rnd() * 1.3,
        vx: (rnd() - 0.5) * 6,
        vy: -4 - rnd() * 9,
        a: rnd() * Math.PI * 2,
        s: 0.6 + rnd() * 1.2,
      }),
    );
    const shafts = Array.from({ length: rays ? 7 : 0 }, (_, i) => ({
      a: -0.46 + (i / 6) * 0.92 + (rnd() - 0.5) * 0.08,
      w: 0.035 + rnd() * 0.05,
      k: 0.6 + rnd() * 0.8,
      o: rnd() * Math.PI * 2,
    }));
    const glow = pal.glow;
    const ink = tone === "vellum";
    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const t = now / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = ink ? "source-over" : "lighter";
      const ox = w * 0.5;
      const oy = -h * 0.55;
      const len = h * 1.9;
      for (const s of shafts) {
        const a = Math.PI / 2 + s.a + Math.sin(t * 0.11 * s.k + s.o) * 0.05;
        const alpha =
          (ink ? 0.06 : 0.055) * (0.7 + 0.3 * Math.sin(t * 0.23 * s.k + s.o));
        const g = ctx.createLinearGradient(
          ox,
          oy,
          ox + Math.cos(a) * len,
          oy + Math.sin(a) * len,
        );
        g.addColorStop(0, hexAlpha(ink ? pal.accent : glow, alpha));
        g.addColorStop(0.55, hexAlpha(ink ? pal.accent : glow, alpha * 0.5));
        g.addColorStop(1, hexAlpha(ink ? pal.accent : glow, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a - s.w) * len, oy + Math.sin(a - s.w) * len);
        ctx.lineTo(ox + Math.cos(a + s.w) * len, oy + Math.sin(a + s.w) * len);
        ctx.closePath();
        ctx.fill();
      }
      for (const m of motes) {
        if (!reduced) {
          m.x += (m.vx + Math.sin(t * m.s + m.a) * 4) * dt;
          m.y += m.vy * dt;
          if (m.y < -4) {
            m.y = h + 4;
            m.x = rnd() * w;
          }
          if (m.x < -4) m.x = w + 4;
          if (m.x > w + 4) m.x = -4;
        }
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.7 * m.s + m.a));
        ctx.fillStyle = hexAlpha(
          ink ? pal.accent : glow,
          (ink ? 0.35 : 0.55) * tw,
        );
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, rays, dust, pal.glow, pal.accent, tone, wordmark, paused]);

  // Unveil → landing → (with children) exit → done.
  React.useEffect(() => {
    if (phase === "unveil") {
      const t = setTimeout(() => setPhase("landing"), UNVEIL_MS);
      return () => clearTimeout(t);
    }
    if (phase === "landing") {
      if (liveRef.current)
        liveRef.current.textContent = wordmark + ". " + (tagline || "");
      onLoadedRef.current?.();
      if (hasChildren && holdMs > 0) {
        const t = setTimeout(() => setPhase("exit"), holdMs);
        return () => clearTimeout(t);
      }
      return;
    }
    if (phase === "exit") {
      const t = setTimeout(() => {
        setPhase("done");
        onCompleteRef.current?.();
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [phase, hasChildren, holdMs, wordmark, tagline]);

  // With children: a wheel or a swipe lifts the stage.
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el || !hasChildren || !scrollToEnter || phase !== "landing") return;
    let y0 = -1;
    const lift = () => setPhase((p) => (p === "landing" ? "exit" : p));
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 12) lift();
    };
    const onTouchStart = (e: TouchEvent) => {
      y0 = e.touches[0]?.clientY ?? -1;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (y0 >= 0 && y !== undefined && y0 - y > 40) lift();
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [hasChildren, scrollToEnter, phase]);

  const rush = React.useCallback(() => {
    if (!skippable || phaseRef.current !== "load") return;
    rushRef.current = true;
  }, [skippable]);

  const onKey = (e: React.KeyboardEvent) => {
    if (phase !== "load") return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      rush();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pt = pointerRef.current;
    pt.tx = Math.max(
      -1,
      Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2),
    );
    pt.ty = Math.max(
      -1,
      Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2),
    );
    pt.inside = true;
  };

  const onPointerLeave = () => {
    pointerRef.current.tx = 0;
    pointerRef.current.ty = 0;
    pointerRef.current.inside = false;
  };

  const enter = (e: React.MouseEvent) => {
    onEnterRef.current?.();
    if (hasChildren) {
      e.preventDefault();
      if (phaseRef.current === "landing") setPhase("exit");
    }
  };

  if (phase === "done") return <>{children}</>;

  const boxes = cast.map((f) => {
    const nat = naturals[f.src];
    const aspect = nat ? nat.w / nat.h : 0.62;
    return omFigureBox(f.x, f.y ?? 100, f.h, aspect, size.w, size.h);
  });
  centresRef.current = cast.map((f) => f.x / 100);
  const backNat = backdrop ? naturals[backdrop] : undefined;
  const backBox = backdrop
    ? omCover(backNat?.w ?? 0, backNat?.h ?? 0, size.w, size.h, 0.5, 0.4)
    : null;
  const ringPx = Math.round(
    Math.max(260, Math.min(760, Math.min(size.w || 900, size.h || 700) * 0.78)),
  );
  const pills = phase === "load" ? (pct >= 50 ? 2 : pct >= 20 ? 1 : 0) : 2;
  const leftNav = nav.slice(0, Math.ceil(nav.length / 2));
  const rightNav = nav.slice(Math.ceil(nav.length / 2));
  const taglineWords = (tagline || "").split(/\s+/).filter(Boolean);
  // During the load the word stands in the middle of the stage; at the unveil it settles to the floor.
  const wordBottomPx = fs * metrics.base * -1 + size.h * 0.014;
  const wordMid = wordBottomPx + (fs * metrics.cap) / 2;
  const lift = phase === "load" && size.h ? -(size.h / 2 - wordMid) : 0;

  const vars = {
    "--om-stage": pal.stage,
    "--om-stage-l": hexMix(
      pal.stage,
      pal.glow,
      tone === "vellum" ? 0.35 : 0.14,
    ),
    "--om-stage-d": hexMix(pal.stage, pal.ground, 0.55),
    "--om-ground": pal.ground,
    "--om-ground-a": hexAlpha(pal.ground, tone === "vellum" ? 0.35 : 0.85),
    "--om-ground-b": hexAlpha(pal.ground, 0.7),
    "--om-ground-c": hexAlpha(pal.ground, 0.6),
    "--om-ground-d": hexAlpha(pal.ground, 0.3),
    "--om-text": pal.text,
    "--om-muted": pal.muted,
    "--om-accent": pal.accent,
    "--om-accent-a": hexAlpha(pal.accent, 0.75),
    "--om-word": pal.word,
    "--om-word-a": hexAlpha(pal.word, 0.7),
    "--om-rule": pal.rule,
    "--om-glow": pal.glow,
    "--om-highlight": pal.highlight,
    "--om-glow-a": hexAlpha(pal.glow, tone === "vellum" ? 0.5 : 0.22),
    "--om-glow-b": hexAlpha(pal.glow, 0.55),
    "--om-glow-c": hexAlpha(pal.glow, 0.25),
    "--om-glow-d": hexAlpha(pal.glow, 0.75),
    "--om-face": faceDef.family,
    "--om-weight": String(faceDef.weight),
    "--om-tracking": String(faceDef.tracking),
    "--om-base": String(metrics.base + (chars.initial ? 0.1 : 0)),
    "--om-cap": String(metrics.cap),
    "--om-script": SCRIPT_FAMILY,
    "--om-ui": UI_FAMILY,
    "--om-serif": SERIF_FAMILY,
    "--om-fs": fs + "px",
    "--om-lift": Math.round(lift) + "px",
    "--om-exposure": String(Math.max(0.2, exposure)),
    "--om-tilt": String(Math.max(0, tilt)),
    "--om-bob": "0px",
    "--om-ring": ringPx + "px",
    "--om-grain": tone === "vellum" ? 0.16 : tone === "carmine" ? 0.11 : 0.09,
    height,
  } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      className={"om-root " + className}
      style={vars}
      data-phase={phase}
      data-paused={paused ? "true" : "false"}
      data-tone={tone}
      data-face={face}
      data-up={up ? "true" : "false"}
      data-pills={pills}
      data-duotone={isDuotone ? "true" : "false"}
      data-instant={instant ? "true" : "false"}
      data-gate={hasChildren && scrollToEnter ? "true" : "false"}
      data-narrow={narrow ? "true" : "false"}
      onClick={rush}
      onKeyDown={onKey}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      tabIndex={phase === "load" && skippable ? 0 : -1}
      aria-busy={phase === "load"}
    >
      <style dangerouslySetInnerHTML={{ __html: OM_CSS }} />
      <svg className="om-defs" aria-hidden="true" focusable="false">
        <defs>
          {cast.map((f, i) => {
            const tr = omTransfer(
              f.threshold ?? (f.subject === "dark" ? 0.72 : 0.2),
              f.softness ?? 0.16,
              f.subject ?? "light",
            );
            const box = boxes[i];
            return (
              <React.Fragment key={i}>
                <filter
                  id={uid + "-k" + i}
                  colorInterpolationFilters="sRGB"
                  x="0"
                  y="0"
                  width="1"
                  height="1"
                >
                  <feColorMatrix
                    type="matrix"
                    values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"
                  />
                  <feComponentTransfer>
                    <feFuncR
                      type="linear"
                      slope={tr.slope}
                      intercept={tr.intercept}
                    />
                    <feFuncG
                      type="linear"
                      slope={tr.slope}
                      intercept={tr.intercept}
                    />
                    <feFuncB
                      type="linear"
                      slope={tr.slope}
                      intercept={tr.intercept}
                    />
                  </feComponentTransfer>
                </filter>
                {box.w > 0 && (
                  <mask
                    id={uid + "-m" + i}
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width={box.w}
                    height={box.h}
                    style={{ maskType: "luminance" }}
                  >
                    <image
                      href={f.src}
                      x="0"
                      y="0"
                      width={box.w}
                      height={box.h}
                      preserveAspectRatio="none"
                      filter={"url(#" + uid + "-k" + i + ")"}
                      transform={
                        f.flip
                          ? "translate(" + box.w + " 0) scale(-1 1)"
                          : undefined
                      }
                    />
                  </mask>
                )}
              </React.Fragment>
            );
          })}
        </defs>
      </svg>

      {hasChildren && <div className="om-page">{children}</div>}

      <div ref={stageRef} className="om-stage">
        <div className="om-flood" />
        {backdrop && backBox && (
          <img
            className="om-backdrop"
            src={backdrop}
            alt=""
            draggable={false}
            decoding="async"
            style={{
              left: backBox.x,
              top: backBox.y,
              width: backBox.w || "100%",
              height: backBox.h || "100%",
              maxWidth: "none",
            }}
          />
        )}

        <svg className="om-ring" viewBox="0 0 400 400" aria-hidden="true">
          <g className="om-ring-spin">
            <circle className="om-ring-hair" cx="200" cy="200" r="198" />
            <circle className="om-ring-hair" cx="200" cy="200" r="154" />
            <path className="om-ring-key" d={keyPath} pathLength={1} />
          </g>
        </svg>

        <div className="om-wordlayer">
          <div className="om-wordclip">
            <h1
              ref={wordRef}
              className="om-word"
              aria-label={wordmark}
              style={
                {
                  "--om-fill": skipIntro ? "102%" : "0%",
                } as React.CSSProperties
              }
            >
              {chars.initial && (
                <span
                  className="om-init"
                  style={{ "--i": 0 } as React.CSSProperties}
                  aria-hidden="true"
                >
                  {chars.initial}
                </span>
              )}
              {chars.rest.map((ch, k) =>
                ch === " " ? (
                  <span key={k} className="om-sp" aria-hidden="true" />
                ) : (
                  <span
                    key={k}
                    className="om-l"
                    style={
                      {
                        "--i": k + (chars.initial ? 1 : 0),
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  >
                    {ch}
                  </span>
                ),
              )}
            </h1>
          </div>
          <div className="om-sheen" aria-hidden="true" />
        </div>

        {[false, true].map((front) => (
          <div
            key={front ? "front" : "back"}
            className={"om-cast" + (front ? " om-cast-front" : "")}
            aria-hidden="true"
          >
            <div className="om-tilt">
              {cast.map((f, i) => {
                const box = boxes[i];
                if (!(box.w > 0) || (f.depth ?? 1) >= wordDepth !== front)
                  return null;
                return (
                  <div
                    key={i}
                    className="om-fig"
                    data-index={i}
                    data-flip={f.flip ? "true" : "false"}
                    data-near="false"
                    style={
                      {
                        left: box.left,
                        top: box.top,
                        width: box.w,
                        height: box.h,
                        "--i": i,
                        "--om-depth": f.depth ?? 1,
                        zIndex: Math.round((f.depth ?? 1) * 100),
                      } as React.CSSProperties
                    }
                  >
                    <div className="om-fig-shadow" />
                    <div
                      className="om-fig-in"
                      style={{
                        WebkitMask: "url(#" + uid + "-m" + i + ")",
                        mask: "url(#" + uid + "-m" + i + ")",
                      }}
                    >
                      <img
                        src={f.src}
                        alt={f.alt || ""}
                        draggable={false}
                        decoding="async"
                        style={{ maxWidth: "none" }}
                      />
                      <div className="om-duo om-duo-a" />
                      <div className="om-duo om-duo-b" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <canvas ref={lightRef} className="om-light" aria-hidden="true" />
        <div className="om-spot" />
        <div className="om-vignette" />
        {grain && (
          <div
            className="om-grain"
            style={{ backgroundImage: "url(" + grain + ")" }}
            aria-hidden="true"
          />
        )}
        <div className="om-flash" aria-hidden="true" />

        <div className="om-chrome">
          <header className="om-top om-ui">
            <nav aria-label="Primary, left">
              <ul className="om-navl">
                {leftNav.map((l, k) => (
                  <li key={k} style={{ "--i": k } as React.CSSProperties}>
                    {l.href ? (
                      <a href={l.href}>{l.label}</a>
                    ) : (
                      <button type="button">{l.label}</button>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
            <div className="om-brand">{brand}</div>
            <nav aria-label="Primary, right">
              <ul className="om-navr">
                {rightNav.map((l, k) => (
                  <li
                    key={k}
                    style={{ "--i": k + leftNav.length } as React.CSSProperties}
                  >
                    {l.href ? (
                      <a href={l.href}>{l.label}</a>
                    ) : (
                      <button type="button">{l.label}</button>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          </header>
          <div
            className="om-rule"
            data-gap={eyebrow ? "true" : "false"}
            aria-hidden="true"
          />
          {eyebrow && (
            <div ref={eyebrowRef} className="om-eyebrow om-ui">
              {eyebrow}
            </div>
          )}

          {labels[0] && (
            <div className="om-pill om-pill-l om-ui">{labels[0]}</div>
          )}
          {labels[1] && (
            <div className="om-pill om-pill-r om-ui">{labels[1]}</div>
          )}

          {STARS.map((s, k) => (
            <div
              key={k}
              className={
                "om-star" +
                (s.small ? " om-star-s" : "") +
                (s.under ? " om-star-c" : "")
              }
              style={{ left: s.x, top: s.y, "--i": k } as React.CSSProperties}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24">
                <path d={STAR_PATH} fill="currentColor" />
              </svg>
            </div>
          ))}

          {asides[0] && (
            <aside className="om-aside om-aside-l">
              <b>{asides[0].title}</b>
              <p>{asides[0].text}</p>
            </aside>
          )}
          {asides[1] && (
            <aside className="om-aside om-aside-r">
              <b>{asides[1].title}</b>
              <p>{asides[1].text}</p>
            </aside>
          )}

          <div
            className="om-counter"
            aria-hidden={phase !== "load"}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={loadingLabel}
          >
            <p className="om-num" aria-hidden="true">
              <span ref={numRef}>{skipIntro ? 100 : 0}</span>
            </p>
            <div className="om-ratio om-ui" aria-hidden="true">
              <span ref={ratioRef}>{skipIntro ? "1.0000" : "0.0000"}</span>
              <i />
              <span>{loadingLabel}</span>
            </div>
          </div>

          <div className="om-copy">
            {taglineWords.length > 0 && (
              <p className="om-tagline">
                {taglineWords.map((w, k) => (
                  <React.Fragment key={k}>
                    <span style={{ "--i": k } as React.CSSProperties}>{w}</span>
                    {k < taglineWords.length - 1 ? " " : null}
                  </React.Fragment>
                ))}
              </p>
            )}
            {cta &&
              (cta.href ? (
                <a className="om-cta" href={cta.href} onClick={enter}>
                  {cta.label}
                </a>
              ) : (
                <button type="button" className="om-cta" onClick={enter}>
                  {cta.label}
                </button>
              ))}
          </div>

          {annotations.map((a, k) => (
            <div
              key={k}
              className="om-ann"
              style={
                {
                  left: a.x + "%",
                  top: a.y + "%",
                  "--i": k,
                } as React.CSSProperties
              }
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 58 30"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              >
                <path d="M0.5 8V0.5H8M50 0.5H57.5V8M57.5 22V29.5H50M8 29.5H0.5V22" />
              </svg>
              <span className="om-ui">{a.label}</span>
            </div>
          ))}

          <div className="om-foot">
            <svg className="om-bars" viewBox="0 0 92 22" aria-hidden="true">
              {bars.map((b, k) => (
                <rect
                  key={k}
                  x={b.x}
                  y="0"
                  width={b.w}
                  height="22"
                  fill="currentColor"
                />
              ))}
            </svg>
            <div className="om-plate om-ui">
              {plate}
              {plate ? " · " : ""}
              <span>1.0000</span>
            </div>
          </div>
          {skippable && phase === "load" && (
            <button type="button" className="om-skip om-ui" onClick={rush}>
              Skip
            </button>
          )}
          <div className="om-hint om-ui" aria-hidden="true">
            <i />
            <span>Scroll</span>
          </div>
          <div ref={liveRef} className="om-live" aria-live="polite" />
        </div>
      </div>
    </div>
  );
}

export type OldMastersPaletteOverride = Partial<OldMastersPalette>;
