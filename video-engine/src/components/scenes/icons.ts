// Resolve a simple-icons slug to its SVG path + brand hex, at render time.
// simple-icons exports each icon as `si<PascalSlug>` (e.g. siPostgresql).
import * as simpleIcons from "simple-icons";

export interface ResolvedIcon {
  path: string;
  hex: string;
  title: string;
}

const cache = new Map<string, ResolvedIcon | null>();

// Common LLM slug variants -> canonical simple-icons slugs. Brands removed from
// simple-icons for trademark reasons (microsoft, windows, azure, openai, ...)
// resolve to null and render as a text-only node (no icon).
const ALIASES: Record<string, string> = {
  node: "nodedotjs",
  nodejs: "nodedotjs",
  golang: "go",
  postgres: "postgresql",
  postgre: "postgresql",
  k8s: "kubernetes",
  vuejs: "vuedotjs",
  nextjs: "nextdotjs",
  githubactions: "github",
  aws: "amazonwebservices",
  amazon: "amazonwebservices",
};

const toKey = (slug: string): string => {
  let s = slug.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return "";
  s = ALIASES[s] ?? s;
  return "si" + s.charAt(0).toUpperCase() + s.slice(1);
};

export const getIcon = (slug: string): ResolvedIcon | null => {
  if (!slug) return null;
  if (cache.has(slug)) return cache.get(slug) ?? null;
  const key = toKey(slug);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const icon = (simpleIcons as any)[key];
  const resolved: ResolvedIcon | null = icon?.path
    ? { path: icon.path, hex: `#${icon.hex}`, title: icon.title }
    : null;
  cache.set(slug, resolved);
  return resolved;
};
