/* Regroupe les scripts par page en 2 fichiers :
   - bundles/vendor.js : react + react-dom (commun, mis en cache longtemps)
   - bundles/[slug].bundle.js : tout le reste pour cette page
   Résultat : 10 requêtes → 2 requêtes par page.

   L'attribut data-bundle-sources liste les scripts d'origine dans l'ordre ;
   prerender.mjs s'en sert pour savoir quels fichiers exécuter côté Node. */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const VENDOR_BASES = new Set([
  "react.production.min.js",
  "react-dom.production.min.js",
]);

/* Récupère la liste ordonnée des scripts de page (hors react/react-dom),
   en gérant les deux cas : HTML non encore bundlé (refs originales) et
   HTML déjà bundlé (data-bundle-sources présent). */
function getPageScripts(html) {
  const scripts = [];
  for (const m of html.matchAll(/<script([^>]*)>/g)) {
    const attrs = m[1];

    // Bundle du build précédent → expand data-bundle-sources
    const sourcesM = attrs.match(/data-bundle-sources="([^"]+)"/);
    if (sourcesM) {
      scripts.push(...sourcesM[1].split(","));
      continue;
    }

    const srcM = attrs.match(/src="([^"?]+)/);
    if (!srcM) continue;
    // Scripts servis hors du site statique (chemin absolu « / », autre domaine) : jamais regroupés.
    // Ex. : la mesure Umami, /u/script.js, relayée par Caddy.
    if (/^(\/|https?:)/.test(srcM[1])) continue;
    const base = srcM[1].split("/").pop();
    // Ignore vendor + tout ce qui vient du dossier bundles/
    if (VENDOR_BASES.has(base) || base === "vendor.js" || base.endsWith(".bundle.js")) continue;
    scripts.push(base);
  }
  // Déduplique en gardant l'ordre
  return [...new Set(scripts)];
}

/* Remplace le bloc de <script src="..."> locaux par les 2 tags bundle. */
function replaceScriptTags(html, slug, pageScripts) {
  // Scripts locaux relatifs seulement : un src absolu (« / », « // », http) n'est pas à nous
  // (sinon la balise Umami du <head> ferait remplacer tout le corps de la page, vu le 19.11.2026).
  const localRe = /<script[^>]+src="(?!https?:|\/|data:)[^"]*"[^>]*><\/script>/g;
  const matches = [...html.matchAll(localRe)];
  if (matches.length === 0) return html;

  const first = matches[0];
  const last = matches[matches.length - 1];

  const sources = pageScripts.join(",");
  const newTags =
    `<script src="bundles/vendor.js"></script>\n` +
    `<script src="bundles/${slug}.bundle.js" data-bundle-sources="${sources}"></script>`;

  return html.slice(0, first.index) + newTags + html.slice(last.index + last[0].length);
}

export function bundleAll(root, htmlFiles) {
  const bundleDir = resolve(root, "bundles");
  mkdirSync(bundleDir, { recursive: true });

  // Vendor bundle : react + react-dom (même pour toutes les pages)
  const VENDOR_FILES = [
    "lib/react.production.min.js",
    "lib/react-dom.production.min.js",
  ];
  const vendorContent = VENDOR_FILES
    .map((f) => readFileSync(resolve(root, f), "utf8"))
    .join("\n;\n");
  writeFileSync(resolve(root, "bundles/vendor.js"), vendorContent);

  let bundled = 0;
  for (const htmlFile of htmlFiles) {
    const htmlPath = resolve(root, htmlFile);
    const html = readFileSync(htmlPath, "utf8");

    const pageScripts = getPageScripts(html);
    if (pageScripts.length === 0) continue; // page sans JS (404.html, etc.)

    const slug = htmlFile.replace(".html", "");

    // Concatène les scripts de page dans l'ordre (ignore les fichiers supprimés)
    const existingScripts = [];
    const parts = [];
    for (const base of pageScripts) {
      const fp = resolve(root, base);
      if (!existsSync(fp)) continue;
      existingScripts.push(base);
      parts.push(readFileSync(fp, "utf8"));
    }
    writeFileSync(resolve(root, "bundles", `${slug}.bundle.js`), parts.join("\n;\n"));

    // Met à jour les script tags dans le HTML (data-bundle-sources ne liste que les fichiers existants)
    const newHtml = replaceScriptTags(html, slug, existingScripts);
    writeFileSync(htmlPath, newHtml);
    bundled++;
  }

  console.log(`✅ Bundling : bundles/vendor.js + ${bundled} bundles de pages (10 req → 2)`);
}
