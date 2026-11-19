/* ============================================================
   VERSIONS RÉDUITES DES PHOTOS — appelée par build.mjs avant le pré-rendu.

   Les photos du site font 1 900 à 2 400 px de large ; une galerie les montre dans des cadres
   de 300 à 700 px. Pour chaque image d'un emplacement (.image-slots.state.json), on écrit des
   versions plus étroites dans images/w/ (nom-480.webp, nom-800.webp…), et le navigateur choisit
   la plus petite qui suffit à l'écran (srcset, voir seo-sync.mjs et image-slot.js).

   - L'original reste la plus grande version proposée, et c'est lui qu'ouvre l'agrandissement.
   - Une version n'est faite que si elle est nettement plus étroite que l'original (< 90 %).
   - Qualité 85 : à la taille d'affichage, aucune différence visible avec l'original réduit.
   - images/w/manifest.json garde l'empreinte de chaque original : une image inchangée n'est
     pas refaite ; les versions d'une image qui n'est plus utilisée sont supprimées.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const WIDTHS = [480, 800, 1200, 1600];
const QUALITY = 85;
const DIR = "images/w";

export const variantPath = (url, w) => `${DIR}/${basename(url, extname(url))}-${w}.webp`;

/* srcset complet d'une image (versions + original), ou null si elle n'a pas de version. */
export function srcsetOf(manifest, url) {
  const m = manifest && manifest[url];
  if (!m || !m.w.length) return null;
  return m.w.map((w) => `${variantPath(url, w)} ${w}w`).concat(`${url} ${m.W}w`).join(", ");
}

export function readManifest(root) {
  const p = resolve(root, DIR, "manifest.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

export async function genVariants(root) {
  const sharp = require("sharp");
  const sidecar = JSON.parse(readFileSync(resolve(root, ".image-slots.state.json"), "utf8"));
  const urls = [...new Set(Object.values(sidecar).map((v) => (typeof v === "string" ? v : v && v.u)).filter(Boolean))]
    .filter((u) => /^images\/[^/]+\.(webp|jpe?g|png)$/i.test(u) && existsSync(resolve(root, u)))
    .sort();

  mkdirSync(resolve(root, DIR), { recursive: true });
  const old = readManifest(root);
  const manifest = {};
  let made = 0, kept = 0;

  for (const url of urls) {
    const buf = readFileSync(resolve(root, url));
    const hash = createHash("sha1").update(buf).digest("hex").slice(0, 12);
    const { width: W, height: H } = await sharp(buf).metadata();
    const w = WIDTHS.filter((x) => x < W * 0.9);
    manifest[url] = { hash, W, H, w };
    const same = old[url] && old[url].hash === hash;
    for (const x of w) {
      const out = resolve(root, variantPath(url, x));
      if (same && existsSync(out)) { kept++; continue; }
      await sharp(buf).resize({ width: x, kernel: "lanczos3" }).webp({ quality: QUALITY, effort: 6, smartSubsample: true }).toFile(out);
      made++;
    }
  }

  // versions orphelines (image retirée, remplacée ou devenue trop étroite)
  const wanted = new Set(Object.entries(manifest).flatMap(([u, m]) => m.w.map((x) => basename(variantPath(u, x)))));
  let removed = 0;
  for (const f of readdirSync(resolve(root, DIR))) {
    if (f.endsWith(".webp") && !wanted.has(f)) { unlinkSync(resolve(root, DIR, f)); removed++; }
  }

  writeFileSync(resolve(root, DIR, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  console.log(`✅ Versions réduites des photos : ${made} faites, ${kept} inchangées, ${removed} retirées (${urls.length} images)`);
  return manifest;
}
