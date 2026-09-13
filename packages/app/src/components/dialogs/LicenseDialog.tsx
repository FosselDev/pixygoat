import { Dialog } from "./Dialog.tsx";
import { t } from "../../i18n/i18n.ts";

/** Placeholder until the licenses milestone. */
export function LicenseDialog() {
  return (
    <Dialog title={t("top.licenses")} small>
      <div class="dim">License explanations are implemented in a later milestone.</div>
    </Dialog>
  );
}
