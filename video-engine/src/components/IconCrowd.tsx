import React from "react";

// A literal "icon crowd" primitive: recognizable single-color SVG glyphs placed
// on screen, glowing. The MOTION (rush / jam / queue / fill) lives in whoever
// computes the PlacedGlyph[] array — this file only draws them. Everything is a
// pure function of its inputs (no Math.random), so headless Chromium renders it
// deterministically on the CI runner, same as the rest of the engine.

export type GlyphKind =
  | "person"
  | "car"
  | "ticket"
  | "server"
  | "box"
  | "request"
  | "database"
  | "file";

// Simple silhouettes on a 24x24 grid. One <path> each so they fill cleanly and
// read at small sizes (a crowd of 150 at ~26px).
const GLYPH_PATHS: Record<GlyphKind, React.ReactNode> = {
  person: (
    <>
      <circle cx="12" cy="6.2" r="3.4" />
      <path d="M5.5 21.5c0-4 2.9-7 6.5-7s6.5 3 6.5 7z" />
    </>
  ),
  car: (
    <>
      <path d="M3 13.5l1.8-4.2C5.2 8.4 6 8 6.9 8h10.2c.9 0 1.7.4 2.1 1.3L21 13.5v4.5h-2.3a2 2 0 11-4 0H9.3a2 2 0 11-4 0H3z" />
    </>
  ),
  ticket: (
    <path d="M3 7h18v3a2 2 0 000 4v3H3v-3a2 2 0 000-4z" />
  ),
  server: (
    <>
      <rect x="4" y="4" width="16" height="7" rx="1.5" />
      <rect x="4" y="13" width="16" height="7" rx="1.5" />
    </>
  ),
  box: (
    <path d="M12 2l9 4.5v11L12 22l-9-4.5v-11zM12 4.2L5.5 7.3 12 10.4l6.5-3.1z" />
  ),
  request: (
    <circle cx="12" cy="12" r="5" />
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.4" rx="7.5" ry="2.8" />
      <path d="M4.5 5.4v13.2c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.4c0 1.5-3.4 2.8-7.5 2.8S4.5 6.9 4.5 5.4z" />
    </>
  ),
  file: (
    <path fillRule="evenodd" d="M6 2.5h7l5 5v13a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 20.5v-16A1.5 1.5 0 016 2.5zm7 1.3V8h4.2z" />
  ),
};

export interface PlacedGlyph {
  key: string | number;
  kind: GlyphKind;
  x: number; // screen px (center)
  y: number; // screen px (center)
  size: number; // px
  color: string;
  opacity: number;
  glow: number; // 0..1 bloom strength
  rotate?: number;
}

export const Glyph: React.FC<{
  kind: GlyphKind;
  size: number;
  color: string;
  glow?: number;
}> = ({ kind, size, color, glow = 0.6 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={{
      display: "block",
      fill: color,
      filter: glow > 0 ? `drop-shadow(0 0 ${6 * glow}px ${color})` : undefined,
    }}
  >
    {GLYPH_PATHS[kind]}
  </svg>
);

// Renders a crowd of placed glyphs. Painter's order = array order; callers push
// far (small) glyphs first so near glyphs overlap them.
export const GlyphField: React.FC<{ glyphs: PlacedGlyph[] }> = ({ glyphs }) => (
  <>
    {glyphs.map((g) => (
      <div
        key={g.key}
        style={{
          position: "absolute",
          left: g.x,
          top: g.y,
          width: g.size,
          height: g.size,
          transform: `translate(-50%,-50%) rotate(${g.rotate ?? 0}deg)`,
          opacity: g.opacity,
          willChange: "transform",
        }}
      >
        <Glyph kind={g.kind} size={g.size} color={g.color} glow={g.glow} />
      </div>
    ))}
  </>
);

// Deterministic per-index hash in [0,1) — safe to call during render.
export const hash01 = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
