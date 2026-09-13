import {
  collectCredits,
  creditsCsv,
  creditsText,
  planStaticBloom,
  type ExportSlotInput,
  type StaticBloomPlan,
} from "@pixygoat/core";
import { doc, drawLayers, slotStates } from "../state/store.ts";
import {
  downloadZip,
  renderFrames,
  renderPerAnimation,
  renderStaticBloom,
  renderUniversal,
  textFile,
  writeToFolder,
  type OutFile,
  type Progress,
} from "./render-export.ts";

export type Delivery = "folder" | "zip";

export interface StaticBloomExportOptions {
  variantName: string;
  perLayer: boolean;
  animations: string[];
  delivery: Delivery;
  targetDir: string;
}

export interface FlatExportOptions {
  mode: "animations" | "universal" | "frames";
  animations: string[];
  delivery: Delivery;
  targetDir: string;
}

export interface ExportResult {
  ok: boolean;
  files: number;
  targetDir?: string;
  error?: string;
}

export function exportSlotInputs(): ExportSlotInput[] {
  return slotStates.value
    .filter((s) => s.visible && s.item)
    .map((s) => ({ type: s.type, item: s.item!, variant: s.variant, layers: s.layers }));
}

export function currentPlan(variantName: string, perLayer: boolean, animations: string[]): StaticBloomPlan {
  const d = doc.value;
  return planStaticBloom(exportSlotInputs(), { variantName, characterName: d.name, bodyType: d.bodyType, animations, perLayer });
}

function commonFiles(): OutFile[] {
  const items = exportSlotInputs().map((s) => s.item);
  const credits = collectCredits(items);
  return [
    { path: "character.json", blob: new Blob([JSON.stringify(doc.value, null, 2)], { type: "application/json" }) },
    textFile("CREDITS.txt", creditsText(credits)),
    textFile("CREDITS.csv", creditsCsv(credits)),
  ];
}

async function deliver(files: OutFile[], delivery: Delivery, targetDir: string, zipName: string): Promise<ExportResult> {
  if (delivery === "zip") {
    await downloadZip(files, zipName);
    return { ok: true, files: files.length };
  }
  const r = await writeToFolder(files, targetDir);
  return r.ok ? { ok: true, files: files.length, targetDir } : { ok: false, files: 0, error: r.error };
}

export async function runStaticBloomExport(opts: StaticBloomExportOptions, progress?: Progress): Promise<ExportResult> {
  const plan = currentPlan(opts.variantName, opts.perLayer, opts.animations);
  const sheets = await renderStaticBloom(plan, progress);
  const files: OutFile[] = [
    ...sheets,
    { path: "manifest.json", blob: new Blob([JSON.stringify(plan.manifest, null, 2)], { type: "application/json" }) },
    ...commonFiles(),
  ];
  return deliver(files, opts.delivery, opts.targetDir, `${plan.variant}_static-bloom.zip`);
}

export async function runFlatExport(opts: FlatExportOptions, progress?: Progress): Promise<ExportResult> {
  const layers = drawLayers.value;
  let files: OutFile[];
  if (opts.mode === "animations") files = await renderPerAnimation(layers, opts.animations, progress);
  else if (opts.mode === "universal") files = [await renderUniversal(layers, opts.animations, progress)];
  else files = await renderFrames(layers, opts.animations, progress);
  files.push(...commonFiles());
  const name = doc.value.name.replace(/[^A-Za-z0-9_-]/g, "_") || "character";
  return deliver(files, opts.delivery, opts.targetDir, `${name}_${opts.mode}.zip`);
}
