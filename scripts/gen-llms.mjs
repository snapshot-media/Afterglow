/* Génère llms.txt (le résumé du site lu par les assistants IA) à partir des
   mêmes données que les pages : prestations, formules et prix, pages ville,
   articles du journal. Lancé par build.mjs : il ne peut plus se périmer.
   Usage seul : node scripts/gen-llms.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const BASE = "https://afterglowbykevin.ch";

function loadData(root) {
  const window = {};
  const ctx = vm.createContext({ window });
  for (const f of ["kc-presta-data.js", "kc-journal-data.js", "kc-ville-data.js"]) {
    vm.runInContext(readFileSync(resolve(root, f), "utf8"), ctx, { filename: f });
  }
  return window;
}

// slug de prestation → page (mêmes liens que le menu, kc-shared.jsx)
const HREF = {
  mariage: "mariages.html", portrait: "portraits.html", solo: "solo.html", couple: "couple.html",
  famille: "famille.html", studio: "studio.html", maternite: "maternite-grossesse.html",
};
const ORDER = ["mariage", "portrait", "solo", "couple", "famille", "maternite", "studio"];

export function genLlms(root) {
  const W = loadData(root);
  const P = W.KC_PRESTA, J = W.KC_JOURNAL, V = W.KC_VILLE;
  const L = [];
  L.push("# Afterglow by Kevin Chinelli", "");
  L.push("> Photographe en Suisse romande : mariage, séances lifestyle (solo, couple, famille), grossesse et maternité, portrait en studio. Basé à Mézières (VD), il se déplace sans frais dans toute la Suisse romande (Vaud, Genève, Fribourg, Neuchâtel, Valais). Afterglow est consacré aux particuliers ; les portraits d'entreprise et d'équipe passent par Snapshot Media, son studio pour les professionnels.", "");

  L.push("## Prestations et tarifs", "");
  for (const slug of ORDER) {
    const d = P[slug];
    if (!d) continue;
    const parent = d.parent ? P[d.parent] : null;
    const name = parent ? `${parent.title} · ${d.title}` : d.title;
    L.push(`### [${name}](${BASE}/${HREF[slug]})`, "");
    L.push(d.heroHint, "");
    for (const f of d.formules) L.push(`- ${f.name} (${f.tag}) : ${f.price} — ${f.items.join(", ")}.`);
    if (d.entreprise) L.push(`- Entreprises et équipes : portraits professionnels via [Snapshot Media](https://snapshotmedia.ch/services/photographie/portraits-professionnels/).`);
    L.push("");
  }

  L.push("## Pages par ville", "");
  for (const v of Object.values(V)) {
    const file = v.presta ? `photographe-${v.slug}.html` : `photographe-mariage-${v.slug}.html`;
    L.push(`- [${v.h1}](${BASE}/${file})`);
  }
  L.push("");

  L.push("## Journal", "");
  for (const s of J.order) {
    const a = J.articles[s];
    L.push(`- [${a.title}](${BASE}/${a.file}) : ${a.excerpt}`);
  }
  L.push("");

  L.push("## Autres pages", "");
  L.push(`- [Tarifs](${BASE}/tarifs.html) : toutes les formules et la FAQ tarifaire.`);
  L.push(`- [Bon cadeau](${BASE}/bon-cadeau.html) : offrir une séance lifestyle, grossesse ou studio, ou un montant dès CHF 100 ; valable 12 mois, envoyé par e-mail en PDF après paiement sur facture.`);
  L.push(`- [Portfolio](${BASE}/portfolio.html) : sélection d'images, mariage, lifestyle, grossesse, studio.`);
  L.push(`- [À propos](${BASE}/apropos.html) : Kevin Chinelli, son parcours et sa façon de travailler.`);
  L.push(`- [Contact et devis](${BASE}/contact.html) : demande guidée en quelques étapes, réponse sous 48 h.`, "");

  L.push("## Bon à savoir", "");
  L.push("- Déplacement inclus dans toute la Suisse romande.");
  L.push("- Mariage : date bloquée à la signature et au versement d'un acompte de 30 %, solde 10 jours après le mariage. Un seul mariage par jour.");
  L.push("- Galerie privée en ligne, photos retouchées une à une ; galerie complète en option sur les séances lifestyle et maternité.");
  L.push("- Bons cadeaux personnalisés, valables un an.", "");

  L.push("## Contact", "");
  L.push("- E-mail : contact@afterglowbykevin.ch");
  L.push("- Téléphone et WhatsApp : +41 79 850 76 03");
  L.push("- Instagram : https://www.instagram.com/afterglowbykevin/");
  L.push("- Fiche Google : https://g.page/r/Ccd14Q8WzKZuEBM");
  L.push("- Adresse : Ch. de l'Ancien-Tram 18, 1083 Mézières (VD), Suisse", "");

  writeFileSync(resolve(root, "llms.txt"), L.join("\n"));
  return L.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  console.log(`✅ llms.txt généré (${genLlms(root)} lignes)`);
}
