/* Génère sitemap.xml à partir des pages HTML publiques.
   lastmod = date de dernière modif du fichier (mtime) → signal fiable.
   Usage : npm run sitemap (à relancer quand le contenu change). */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://afterglowbykevin.ch";
// 404, wireframes (dev), avis (noindex tant qu'il n'y a pas de vrais avis).
// Couple et famille sont revenus le 19.11.2026 comme sous-pages de Lifestyle.
const EXCLUDE = /^(404\.html|Wireframe|avis\.html)/i;

// priorité / fréquence selon le type de page
function rank(name) {
  if (name === "index.html") return { p: "1.0", f: "monthly" };
  if (/^(mariages|portraits|studio|maternite-grossesse)\.html$/.test(name)) return { p: "0.9", f: "monthly" };
  if (/^(solo|couple|famille)\.html$/.test(name)) return { p: "0.8", f: "monthly" };
  if (/^photographe-/.test(name)) return { p: "0.8", f: "monthly" };
  if (/^(tarifs|portfolio)\.html$/.test(name)) return { p: "0.8", f: "monthly" };
  if (name === "journal.html") return { p: "0.7", f: "monthly" };
  if (name === "contact.html") return { p: "0.7", f: "yearly" };
  if (name === "confidentialite.html") return { p: "0.2", f: "yearly" };
  if (/^journal-/.test(name)) return { p: "0.6", f: "yearly" };
  return { p: "0.6", f: "yearly" };
}

const pages = readdirSync(root)
  .filter((f) => f.endsWith(".html") && !EXCLUDE.test(f))
  .sort();

const urls = pages.map((name) => {
  const loc = name === "index.html" ? `${BASE}/` : `${BASE}/${name}`;
  const lastmod = statSync(resolve(root, name)).mtime.toISOString().slice(0, 10);
  const { p, f } = rank(name);
  const img = name === "index.html"
    ? `<image:image><image:loc>${BASE}/og-default.png</image:loc><image:title>Afterglow by Kevin Chinelli — Photographe en Suisse romande</image:title></image:image>`
    : "";
  return `  <url><loc>${loc}</loc><changefreq>${f}</changefreq><priority>${p}</priority><lastmod>${lastmod}</lastmod>${img}</url>`;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>
`;

writeFileSync(resolve(root, "sitemap.xml"), xml, "utf8");
console.log(`✅ sitemap.xml généré (${pages.length} pages)`);
