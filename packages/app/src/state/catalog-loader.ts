import type { Catalog } from "@pixygoat/core";
import { catalog, catalogStatus, replaceDocument, starterCharacter, doc } from "./store.ts";
import { loadAutosave } from "./persistence.ts";

/** Fetches the catalog, polling while the server is still building it. */
export async function loadCatalog(): Promise<void> {
  for (;;) {
    try {
      const res = await fetch("/api/catalog");
      if (res.status === 503) {
        const body = (await res.json()) as { status?: { message?: string } };
        catalogStatus.value = { state: "building", message: body.status?.message };
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cat = (await res.json()) as Catalog;
      catalog.value = cat;
      catalogStatus.value = { state: "ready" };
      const saved = loadAutosave();
      if (saved) replaceDocument(saved, true);
      else if (Object.keys(doc.value.slots).length === 0) replaceDocument(starterCharacter());
      return;
    } catch (err) {
      catalogStatus.value = { state: "error", message: (err as Error).message };
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
