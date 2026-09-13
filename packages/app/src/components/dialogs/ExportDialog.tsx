import { Dialog } from "./Dialog.tsx";
import { t } from "../../i18n/i18n.ts";

/** Placeholder until the export milestone. */
export function ExportDialog() {
  return (
    <Dialog title={t("top.export")} small>
      <div class="dim">Export is implemented in the next milestone.</div>
    </Dialog>
  );
}
