import { useEffect, useState } from "preact/hooks";
import { catalog, catalogStatus, ui, undo, redo } from "../state/store.ts";
import { readDroppedFile } from "../state/persistence.ts";
import { t } from "../i18n/i18n.ts";
import { StartScreen } from "./StartScreen.tsx";
import { AboutPage } from "./AboutPage.tsx";
import { TopBar } from "./TopBar.tsx";
import { SlotStack } from "./SlotStack.tsx";
import { CatalogPanel } from "./CatalogPanel.tsx";
import { PreviewPanel } from "./PreviewPanel.tsx";
import { LoadDialog } from "./dialogs/LoadDialog.tsx";
import { SaveDialog } from "./dialogs/SaveDialog.tsx";
import { ExportDialog } from "./dialogs/ExportDialog.tsx";
import { LicenseDialog } from "./dialogs/LicenseDialog.tsx";
import { Icon } from "./icons.tsx";

export function App() {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ui.view.value !== "editor") return;
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        ui.dialog.value = "save";
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        ui.dialog.value = "load";
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        ui.dialog.value = "export";
        return;
      }
      if (e.key === "Escape") {
        ui.dialog.value = null;
        return;
      }
      if (typing) return;
      if (e.key === " ") {
        e.preventDefault();
        ui.playing.value = !ui.playing.value;
      } else if (e.key === "ArrowUp") ui.direction.value = "up";
      else if (e.key === "ArrowDown") ui.direction.value = "down";
      else if (e.key === "ArrowLeft") ui.direction.value = "left";
      else if (e.key === "ArrowRight") ui.direction.value = "right";
      else if (/^[1-8]$/.test(e.key)) ui.zoom.value = Number(e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void readDroppedFile(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  if (!catalog.value) {
    const st = catalogStatus.value;
    return (
      <div class="loading">
        <div class="goat"><Icon.Goat size={112} /></div>
        <h1>{t("app.name")}</h1>
        <div class="msg">
          {st.state === "error" ? t("app.error") : st.state === "building" ? t("app.building") : t("app.loading")}
          {st.message ? <div class="dim" style="margin-top:6px">{st.message}</div> : null}
        </div>
      </div>
    );
  }

  const toast = ui.toast.value;
  if (ui.view.value === "about") return <AboutPage />;

  if (ui.view.value === "start") {
    return (
      <>
        <StartScreen />
        {toast && <div class={`toast ${toast.kind}`}>{toast.text}</div>}
        {dragging && <div class="drop-hint">{t("load.drop")}</div>}
      </>
    );
  }

  const dialog = ui.dialog.value;
  return (
    <div class="app">
      <TopBar />
      <div class="workspace">
        <SlotStack />
        <CatalogPanel />
        <PreviewPanel />
      </div>
      {dialog === "load" && <LoadDialog />}
      {dialog === "save" && <SaveDialog />}
      {dialog === "export" && <ExportDialog />}
      {dialog === "licenses" && <LicenseDialog />}
      {toast && <div class={`toast ${toast.kind}`}>{toast.text}</div>}
      {dragging && <div class="drop-hint">{t("load.drop")}</div>}
    </div>
  );
}
