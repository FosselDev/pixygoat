import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { LICENSES, LICENSE_KEYS } from "@pixygoat/core";
import { ui } from "../state/store.ts";
import { authorAddress } from "../contact.ts";
import { language, t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="about-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/**
 * The address appears on request rather than on load. See contact.ts for what
 * that buys and what it does not.
 */
function Contact() {
  const [address, setAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (address === null) {
    return (
      <button class="btn sm" onClick={() => setAddress(authorAddress())}>
        <Icon.Mail size={13} />
        {t("about.contact.reveal")}
      </button>
    );
  }

  const copy = () => {
    void navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <span class="contact">
      <a href={`mailto:${address}`} rel="nofollow noopener">{address}</a>
      <button class="btn sm" onClick={copy}>{copied ? t("about.contact.copied") : t("about.contact.copy")}</button>
    </span>
  );
}

/**
 * What the editor stands on, and who owns what. Two parts on purpose: the
 * first is for anyone who wonders where the art comes from, the second is the
 * part you read before you ship something.
 */
export function AboutPage() {
  const lang = language.value;

  return (
    <div class="about">
      <div class="about-bar">
        <button class="brand" onClick={() => (ui.view.value = "start")}>
          <Icon.Goat />
          <span>{t("app.name")}</span>
        </button>
        <button class="btn sm" onClick={() => (ui.view.value = "start")}>{t("about.back")}</button>
      </div>

      <div class="about-body">
        <h1>{t("about.title")}</h1>
        <p class="lead">{t("about.lead")}</p>

        <h2>{t("about.basis.title")}</h2>

        <Section title={t("about.lpc.title")}>
          <p>{t("about.lpc.body")}</p>
        </Section>

        <Section title={t("about.collection.title")}>
          <p>{t("about.collection.body")}</p>
        </Section>

        <Section title={t("about.code.title")}>
          <p>{t("about.code.body")}</p>
        </Section>

        <Section title={t("about.who.title")}>
          <p>{t("about.who.body")}</p>
          <ol class="who">
            <li><strong>{t("about.who.artists")}</strong> {t("about.who.artistsBody")}</li>
            <li><strong>{t("about.who.tool")}</strong> {t("about.who.toolBody")}</li>
            <li><strong>{t("about.who.yours")}</strong> {t("about.who.yoursBody")}</li>
          </ol>
        </Section>

        <h2>{t("about.legal.title")}</h2>

        <Section title={t("about.tool.title")}>
          <p>{t("about.tool.body")}</p>
          <pre class="mono license-text">{t("about.licenseText")}</pre>
          <p class="wish">{t("about.creditsWish")}</p>
        </Section>

        <Section title={t("about.contact.title")}>
          <p>{t("about.contact.body")}</p>
          <p style="margin-top:10px"><Contact /></p>
        </Section>

        <Section title={t("about.art.title")}>
          <p>{t("about.art.body")}</p>
          <table class="lic-table">
            <thead>
              <tr>
                <th>{t("about.table.license")}</th>
                <th>{t("about.table.means")}</th>
                <th>{t("lic.commercial")}</th>
                <th>{t("lic.attribution")}</th>
                <th>{t("lic.shareAlike")}</th>
              </tr>
            </thead>
            <tbody>
              {LICENSE_KEYS.map((key) => {
                const info = LICENSES[key];
                if (!info) return null;
                return (
                  <tr key={key}>
                    <td>
                      <a href={info.url} target="_blank" rel="noopener">{key}</a>
                    </td>
                    <td>{info.summary[lang] ?? info.summary.en}</td>
                    <td class={info.commercial ? "ok" : "warn"}>{info.commercial ? t("lic.yes") : t("lic.no")}</td>
                    <td class={info.attribution ? "warn" : "ok"}>{info.attribution ? t("lic.required") : t("lic.notRequired")}</td>
                    <td class={info.shareAlike ? "warn" : "ok"}>{info.shareAlike ? t("lic.required") : t("lic.notRequired")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section title={t("about.credits.title")}>
          <p>{t("about.credits.body")}</p>
        </Section>

        <Section title={t("about.strictest.title")}>
          <p>{t("about.strictest.body")}</p>
        </Section>

        <Section title={t("about.links.title")}>
          <ul class="links">
            <li>
              <a href="https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator" target="_blank" rel="noopener">
                Universal LPC Spritesheet Character Generator
              </a>
              <span class="dim"> · {t("about.link.generator")}</span>
            </li>
            <li>
              <a href="https://lpc.opengameart.org/" target="_blank" rel="noopener">Liberated Pixel Cup</a>
              <span class="dim"> · {t("about.link.lpc")}</span>
            </li>
            <li>
              <a href="https://opengameart.org/" target="_blank" rel="noopener">OpenGameArt</a>
              <span class="dim"> · {t("about.link.oga")}</span>
            </li>
          </ul>
        </Section>

        <p class="disclaimer">{t("about.disclaimer")}</p>

        <p class="made">{t("about.made")}</p>
      </div>
    </div>
  );
}
