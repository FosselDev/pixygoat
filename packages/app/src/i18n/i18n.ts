import { signal, computed } from "@preact/signals";
import en from "../../../../locales/en.json";
import de from "../../../../locales/de.json";

type Dict = Record<string, string>;

const dictionaries: Record<string, Dict> = { en: en as Dict, de: de as Dict };

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
];

/**
 * English until someone says otherwise, and then remembered. The browser's
 * own language is deliberately not consulted: the interface, the docs and the
 * sprite metadata are written in English, so that is the one everybody can
 * read, and a single click changes it for good.
 */
function initialLanguage(): string {
  try {
    const stored = localStorage.getItem("pixygoat.lang");
    if (stored && dictionaries[stored]) return stored;
  } catch {
    /* ignore */
  }
  return "en";
}

export const language = signal(initialLanguage());

export function setLanguage(id: string) {
  if (!dictionaries[id]) return;
  language.value = id;
  try {
    localStorage.setItem("pixygoat.lang", id);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = id;
}

const active = computed(() => dictionaries[language.value] ?? dictionaries.en!);

/** Translates a key; missing keys fall back to English, then to the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  const s = active.value[key] ?? dictionaries.en![key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

/**
 * Counted text. Looks up `<key>.one` for exactly one and `<key>.other`
 * otherwise, so German reads "1 Teil hat" instead of "1 Teile haben"; falls
 * back to the bare key when no counted form exists.
 */
export function tn(key: string, n: number, params?: Record<string, string | number>): string {
  const counted = `${key}.${n === 1 ? "one" : "other"}`;
  const known = active.value[counted] ?? dictionaries.en![counted];
  return t(known ? counted : key, { n, ...params });
}

/** Label of a slot (type name); falls back to a humanised id. */
export function slotLabel(typeName: string): string {
  const key = `slot.${typeName}`;
  const s = active.value[key] ?? dictionaries.en![key];
  return s ?? typeName.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function groupLabel(groupId: string): string {
  return t(`group.${groupId}`);
}
