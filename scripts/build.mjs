/* Pré-compile chaque .jsx (source) en .js classique minifié, chargé tel quel
   par les pages HTML. Remplace la transpilation Babel dans le navigateur.

   - Sémantique « classic script » préservée : pas de bundling, pas d'IIFE, on
     transforme fichier par fichier. Le partage inter-fichiers se fait via
     window (Object.assign dans kc-shared.jsx / tweaks-panel.jsx).
   - minifyIdentifiers DÉSACTIVÉ : aucun symbole global ne doit être renommé.
   Usage : npm run build */
import { build, transform } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { prerenderAll } from "./prerender.mjs";
import { bundleAll } from "./bundle-scripts.mjs";
import { downloadFonts } from "./download-fonts.mjs";
import { genLlms } from "./gen-llms.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- CSS : minifie chaque feuille en .min.css (référencée par les pages) ---
const CSS = ["kc.css", "kc-pages.css"];
for (const file of CSS) {
  const css = readFileSync(resolve(root, file), "utf8");
  const out = await transform(css, { loader: "css", minify: true });
  const min = file.replace(/\.css$/, ".min.css");
  writeFileSync(resolve(root, min), out.code);
  console.log(`  ${file} → ${min} (${(out.code.length / 1024).toFixed(1)} Ko)`);
}

const ENTRIES = [
  "tweaks-panel.jsx",
  "kc-shared.jsx",
  "kc-app.jsx",
  "kc-apropos-app.jsx",
  "kc-article-app.jsx",
  "kc-avis-app.jsx",
  "kc-contact-app.jsx",
  "kc-journal-app.jsx",
  "kc-legal-app.jsx",
  "kc-portfolio-app.jsx",
  "kc-presta-app.jsx",
  "kc-tarifs-app.jsx",
  "kc-ville-app.jsx",
];

await build({
  entryPoints: ENTRIES.map((f) => resolve(root, f)),
  outdir: root,
  outExtension: { ".js": ".js" },
  bundle: false,            // transform-only : un fichier .js par fichier .jsx
  // IIFE : chaque fichier garde ses const/let dans sa propre portée. Sans ça,
  // les `const {useState} = React` en tête de plusieurs fichiers entrent en
  // collision dans l'environnement lexical global partagé des classic scripts
  // (« Identifier already declared »). Le partage inter-fichiers passe par
  // window (Object.assign dans kc-shared.js / tweaks-panel.js), pas par la portée.
  format: "iife",
  loader: { ".jsx": "jsx" },
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false, // critique : ne pas renommer les globals
  legalComments: "none",
  target: "es2019",
  logLevel: "info",
});

console.log("✅ JSX pré-compilé en .js");

const htmlFiles = readdirSync(root).filter((f) => f.endsWith(".html"));

// Polices locales (skip si fonts/fonts.css existe déjà)
await downloadFonts();

// Pré-rendu SSG : injecte le HTML React dans #root (doit tourner APRÈS la
// compilation des .js, car il les exécute côté Node).
// prerender.mjs gère les deux cas : refs originales ou data-bundle-sources (HTML déjà bundlé).
prerenderAll(root, htmlFiles);

// llms.txt : résumé pour les assistants IA, depuis les mêmes données que les pages
console.log(`✅ llms.txt généré (${genLlms(root)} lignes)`);

// Bundling JS : 10 requêtes → 2 par page (vendor + page-bundle).
// Doit tourner APRÈS prerender (pour que la logique SSG n'ait pas à lire les bundles
// mais les sources originales), et APRÈS downloadFonts.
bundleAll(root, htmlFiles);

// Remplace les liens Google Fonts par fonts/fonts.css local sur toutes les pages.
let fontUpdated = 0;
for (const htmlFile of htmlFiles) {
  const fp = resolve(root, htmlFile);
  const original = readFileSync(fp, "utf8");
  let html = original;

  // Retire les preconnect Google Fonts (inutiles avec les polices locales)
  html = html.replace(/<link[^>]+preconnect[^>]+fonts\.googleapis\.com[^>]*>\n?/g, "");
  html = html.replace(/<link[^>]+preconnect[^>]+fonts\.gstatic\.com[^>]*>\n?/g, "");
  // Remplace le <link> stylesheet Google Fonts (href ou src en premier)
  html = html.replace(
    /<link[^>]+(?:href|src)="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[^>]*>/g,
    '<link rel="stylesheet" href="fonts/fonts.css">'
  );

  if (html !== original) { writeFileSync(fp, html); fontUpdated++; }
}
if (fontUpdated > 0) console.log(`✅ Polices locales : ${fontUpdated} pages mises à jour`);

// Stamp a ?v=YYYYMMDD querystring on every local JS/CSS reference in all HTML
// files so browser caches are invalidated after each deployment.
// Couvre désormais : lib/, kc*, tweaks*, image-slot*, bundles/, fonts/fonts.css
const version = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const assetRe = /(<(?:script|link)[^>]+(?:src|href)=")((?:(?:lib\/|bundles\/|kc|tweaks|image-slot)[^"?]*|kc\.min\.css|kc-pages\.min\.css|fonts\/fonts\.css)[^"?]*)(\?v=[^"]*)?(")([^>]*>)/g;
let stampCount = 0;
for (const htmlFile of htmlFiles) {
  const fp = resolve(root, htmlFile);
  const original = readFileSync(fp, "utf8");
  const stamped = original.replace(assetRe, (_, pre, path, _v, quote, post) =>
    `${pre}${path}?v=${version}${quote}${post}`
  );
  if (stamped !== original) { writeFileSync(fp, stamped); stampCount++; }
}
console.log(`✅ Cache version ${version} appliquée (${stampCount} fichiers HTML)`);
