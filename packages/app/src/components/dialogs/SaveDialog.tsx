import { useEffect, useState } from "preact/hooks";
import { Dialog } from "./Dialog.tsx";
import { doc, ui, toast, setName } from "../../state/store.ts";
import { downloadDocument, saveToServer } from "../../state/persistence.ts";
import { t } from "../../i18n/i18n.ts";
import { Icon } from "../icons.tsx";

export function SaveDialog() {
  const [name, setNameDraft] = useState(doc.value.name);
  const [dir, setDir] = useState("");
  const [existing, setExisting] = useState<string[]>([]);
  useEffect(() => {
    void fetch("/api/characters").then(async (r) => {
      const b = (await r.json()) as { dir: string; characters: { file: string }[] };
      setDir(b.dir);
      setExisting(b.characters.map((c) => c.file));
    });
  }, []);

  const valid = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,80}$/.test(name);

  const save = async () => {
    if (!valid) return;
    if (existing.includes(name) && !confirm(t("save.overwrite"))) return;
    const file = await saveToServer(name);
    if (file) {
      setName(name);
      toast(t("save.done", { file }));
      ui.dialog.value = null;
    } else toast("Save failed", "error");
  };

  return (
    <Dialog
      title={t("save.title")}
      small
      footer={
        <>
          <button class="btn left" onClick={() => { downloadDocument(name || doc.value.name); ui.dialog.value = null; }}><Icon.Export size={14} />{t("save.download")}</button>
          <button class="btn" onClick={() => (ui.dialog.value = null)}>{t("dialog.cancel")}</button>
          <button class="btn primary" disabled={!valid} onClick={save}><Icon.Save size={14} />{t("top.save")}</button>
        </>
      }
    >
      <div class="row">
        <label>{t("save.name")}</label>
        <input type="text" value={name} onInput={(e) => setNameDraft((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && save()} autofocus />
      </div>
      <div class="dim" style="font-size:12px">{dir ? t("save.toServer", { dir }) : ""}</div>
    </Dialog>
  );
}
