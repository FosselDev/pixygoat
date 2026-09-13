import type { ComponentChildren } from "preact";
import { ui } from "../../state/store.ts";
import { t } from "../../i18n/i18n.ts";
import { Icon } from "../icons.tsx";

export function Dialog({ title, sub, small, children, footer }: { title: string; sub?: string; small?: boolean; children: ComponentChildren; footer?: ComponentChildren }) {
  const close = () => (ui.dialog.value = null);
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class={`dialog ${small ? "sm" : ""}`} role="dialog">
        <div class="dialog-head">
          <div>
            <h2>{title}</h2>
            {sub && <div class="sub">{sub}</div>}
          </div>
          <button class="ico" style="border:none" onClick={close} title={t("dialog.close")}><Icon.Close size={16} /></button>
        </div>
        <div class="dialog-body">{children}</div>
        {footer && <div class="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}
