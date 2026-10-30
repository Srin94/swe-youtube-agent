import React, { useEffect, useMemo, useState } from "react";
import { continueRender, delayRender, interpolate } from "remotion";
import { codeToHtml } from "shiki";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

interface Highlighted {
  before: string;
  after: string;
}

export const CodeDiffScene: React.FC<Props> = ({ scene, theme, localFrame }) => {
  const diff = scene.code_diff;
  const [html, setHtml] = useState<Highlighted | null>(null);
  const [handle] = useState(() => delayRender("shiki-highlight"));

  const shikiTheme = theme.shikiTheme;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!diff) {
        setHtml({ before: "", after: "" });
        continueRender(handle);
        return;
      }
      try {
        const opts = { lang: diff.language || "text", theme: shikiTheme } as const;
        const [before, after] = await Promise.all([
          codeToHtml(diff.before_code || "", opts),
          codeToHtml(diff.after_code || "", opts),
        ]);
        if (!cancelled) setHtml({ before, after });
      } catch (err) {
        // Unknown language etc. — fall back to plain text.
        if (!cancelled) {
          const esc = (s: string) =>
            s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
          setHtml({
            before: `<pre><code>${esc(diff.before_code)}</code></pre>`,
            after: `<pre><code>${esc(diff.after_code)}</code></pre>`,
          });
        }
      } finally {
        continueRender(handle);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [diff, shikiTheme, handle]);

  // Reveal sweep: wipe the "after" panel in from the left.
  const reveal = interpolate(localFrame, [6, 40], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Auto-fit: shrink the code font so the LONGEST line fits one panel, and let
  // anything still too long wrap instead of spilling past the card edge.
  const longestLine = diff
    ? (diff.before_code + "\n" + diff.after_code)
        .split("\n")
        .reduce((m, l) => Math.max(m, l.length), 1)
    : 1;
  // ~800px usable per panel; monospace glyph ~0.6em wide.
  const codeFont = Math.max(11, Math.min(18, Math.floor(800 / (longestLine * 0.6))));

  const panelStyle = useMemo<React.CSSProperties>(
    () => ({
      flex: 1,
      minWidth: 0,
      background: theme.id === "WAR_ROOM_HUD" ? "#101018" : "#FBFAF6",
      border: theme.borderStyle,
      borderRadius: 10,
      overflow: "hidden",
      position: "relative",
      fontSize: 17,
      display: "flex",
      flexDirection: "column",
    }),
    [theme],
  );

  const labelStyle: React.CSSProperties = {
    fontFamily: theme.fontMono,
    fontSize: 13,
    letterSpacing: 1,
    padding: "8px 14px",
    borderBottom: theme.borderStyle,
    textTransform: "uppercase",
  };

  if (!diff) {
    return (
      <div style={{ padding: 24, fontFamily: theme.fontMono, color: theme.textMuted }}>
        No code diff for this scene.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Force shiki output to wrap + use the fitted size so code never clips. */}
      <style>{`
        .codefit pre, .codefit code { white-space: pre-wrap !important;
          overflow-wrap: anywhere; word-break: break-word;
          font-size: ${codeFont}px !important; line-height: 1.5 !important;
          background: transparent !important; margin: 0; }
      `}</style>
      <div
        style={{
          fontFamily: theme.fontMono,
          fontSize: 15,
          color: theme.textMuted,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {diff.filename}
        <span style={{ color: theme.accentPrimary, marginLeft: 12 }}>
          {diff.highlight_explanation}
        </span>
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 16, width: "100%", alignItems: "stretch" }}>
        <div style={panelStyle}>
          <div style={{ ...labelStyle, color: theme.accentCritical }}>— Before</div>
          <div
            className="codefit"
            style={{
              padding: 18,
              overflow: "hidden",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
            dangerouslySetInnerHTML={{ __html: html?.before ?? "" }}
          />
        </div>
        <div style={panelStyle}>
          <div style={{ ...labelStyle, color: theme.systemStatusColors.HEALTHY }}>
            + After
          </div>
          <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div
              className="codefit"
              style={{ padding: 18, overflow: "hidden" }}
              dangerouslySetInnerHTML={{ __html: html?.after ?? "" }}
            />
            {/* left-to-right reveal mask */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: `${reveal}%`,
                right: 0,
                bottom: 0,
                background: theme.id === "WAR_ROOM_HUD" ? "#101018" : "#FBFAF6",
              }}
            />
            {/* sweep line */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `calc(${reveal}% - 2px)`,
                width: 3,
                background: theme.accentPrimary,
                opacity: reveal > 0 && reveal < 100 ? 1 : 0,
              }}
            />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
