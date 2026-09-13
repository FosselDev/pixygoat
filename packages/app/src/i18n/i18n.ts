import { signal, computed } from "@preact/signals";
import en from "../../../../locales/en.json";
import de from "../../../../locales/de.json";

type Dict = Record<string, string>;

const dictionaries: Record<string, Dict> = { en: en as Dict, de: de as Dict };

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
];

function initialLanguage(): string {
  try {
    const stored = localStorage.getItem("pixygoat.lang");
    if (stored && dictionaries[stored]) return stored;
  } catch {
    /* ignore */
  }
  const nav = navigator.language.slice(0, 2);
  return dictionaries[nav] ? nav : "en";
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

/** Label of a slot (type name); falls back to a humanised id. */
export function slotLabel(typeName: string): string {
  const key = `slot.${typeName}`;
  const s = active.value[key] ?? dictionaries.en![key];
  return s ?? typeName.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function groupLabel(groupId: string): string {
  return t(`group.${groupId}`);
}
