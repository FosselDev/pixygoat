import { effect } from "@preact/signals";
import { parseCharacter, type CharacterDocument } from "@pixygoat/core";
import { doc, dirty, itemsById, replaceDocument, toast } from "./store.ts";
import { t } from "../i18n/i18n.ts";

const AUTOSAVE_KEY = "pixygoat.autosave";

export function loadAutosave(): CharacterDocument | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const r = parseCharacter(JSON.parse(raw));
    return r.ok ? r.doc : null;
  } catch {
    return null;
  }
}

/** Keeps the current document in localStorage so a reload never loses work. */
export function startAutosave() {
  effect(() => {
    const d = doc.value;
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(d));
    } catch {
      /* quota or private mode */
    }
  });
}

/** Loads a document, dropping selections the catalog does not know. */
export function applyLoadedDocument(input: unknown): boolean {
  const r = parseCharacter(input);
  if (!r.ok) {
    toast(t("load.error", { error: r.error }), "error");
    return false;
  }
  const dropped: string[] = [];
  for (const [type, sel] of Object.entries(r.doc.slots)) {
    if (!itemsById.value.has(sel.item)) {
      dropped.push(sel.item);
      delete r.doc.slots[type];
    }
  }
  replaceDocument(r.doc, false);
  if (dropped.length) toast(t("load.dropped", { items: dropped.join(", ") }), "warn", 8000);
  return true;
}

export async function saveToServer(name: string): Promise<string | null> {
  const d = { ...doc.value, name };
  const res = await fetch(`/api/characters/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { file: string };
  replaceDocument(d, false);
  dirty.value = false;
  return body.file;
}

export function downloadDocument(name: string) {
  const d = { ...doc.value, name };
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
  triggerDownload(blob, `${name}.character.json`);
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function readDroppedFile(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    return applyLoadedDocument(JSON.parse(text));
  } catch (err) {
    toast(t("load.error", { error: (err as Error).message }), "error");
    return false;
  }
}
