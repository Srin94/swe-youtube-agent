// Resolve a simple-icons slug to its SVG path + brand hex, at render time.
// simple-icons exports each icon as `si<PascalSlug>` (e.g. siPostgresql).
import * as simpleIcons from "simple-icons";

export interface ResolvedIcon {
  path: string;
  hex: string;
  title: string;
}

const cache = new Map<string, ResolvedIcon | null>();

const toKey = (slug: string): string => {
  const s = slug.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return "";
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
