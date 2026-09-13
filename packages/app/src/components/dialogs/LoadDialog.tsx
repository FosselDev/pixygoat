import { useEffect, useState } from "preact/hooks";
import { Dialog } from "./Dialog.tsx";
import { ui, toast } from "../../state/store.ts";
import { applyLoadedDocument, readDroppedFile } from "../../state/persistence.ts";
import { t } from "../../i18n/i18n.ts";
import { Icon } from "../icons.tsx";

interface Entry { file: string; name: string; bodyType?: string; modifiedAt: string }

export function LoadDialog() {
  const [dir, setDir] = useState("");
  const [list, setList] = useState<Entry[] | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/characters");
    const body = (await res.json()) as { dir: string; characters: Entry[] };
    setDir(body.dir);
    setList(body.characters);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const open = async (e: Entry) => {
    const res = await fetch(`/api/characters/${encodeURIComponent(e.file)}`);
    if (!res.ok) return toast(t("load.error", { error: `HTTP ${res.status}` }), "error");
    if (applyLoadedDocument(await res.json())) ui.dialog.value = null;
  };

  const remove = async (e: Entry) => {
    if (!confirm(t("load.confirmDelete", { name: e.name }))) return;
    await fetch(`/api/characters/${encodeURIComponent(e.file)}`, { method: "DELETE" });
    void refresh();
  };

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f && (await readDroppedFile(f))) ui.dialog.value = null;
    };
    input.click();
  };

  return (
    <Dialog title={t("load.title")} sub={dir ? t("load.fromServer", { dir }) : undefined} small>
      {list === null ? (
        <div class="dim">…</div>
      ) : list.length === 0 ? (
        <div class="dim">{t("load.empty")}</div>
      ) : (
        <div class="list">
          {list.map((e) => (
            <div class="item" key={e.file}>
              <button class="grow" style="text-align:left" onClick={() => open(e)}>
                <div style="font-weight:500">{e.name}</div>
                <div class="dim" style="font-size:11px">{e.bodyType ? t(`body.${e.bodyType}`) + " · " : ""}{t("load.modified", { date: new Date(e.modifiedAt).toLocaleString() })}</div>
              </button>
              <button class="ico" style="border:none" title={t("load.delete")} onClick={() => remove(e)}><Icon.Trash size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
        <button class="btn" onClick={pickFile}><Icon.Load size={14} />{t("load.fromFile")}</button>
        <span class="dim" style="font-size:11px">{t("load.drop")}</span>
      </div>
    </Dialog>
  );
}
