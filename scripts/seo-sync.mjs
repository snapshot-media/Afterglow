/* ============================================================
   SYNCHRO SEO — appelée par prerender.mjs pour chaque page rendue.

   Le <head> de chaque page est écrit à la main (titre, description,
   og:*, JSON-LD). Ce qui DOIT refléter le contenu visible n'est plus
   tenu à la main : il est recalculé ici à partir du rendu React et des
   données (kc-presta-data.js, kc-journal-data.js) à chaque build.

   - FAQPage       ← les <details> de la FAQ affichée (texte identique)
   - BreadcrumbList← le fil d'Ariane affiché (.crumb)
   - Service       ← nom, offres et prix des formules (pages prestation)
   - BlogPosting   ← titre, description, dates, image, auteur (articles)
   - meta description / og:description des articles ← metaDesc des données
   - <link rel="preload" as="image"> ← les images héros réellement affichées
   - lang="fr-CH", <noscript> de secours (le pré-rendu suffit)
   - script de mesure Umami (si UMAMI_WEBSITE_ID est renseigné)
   ============================================================ */

export const BASE = "https://afterglowbykevin.ch";

// Mesure d'audience : Umami auto-hébergé, servi sous /u/ (même origine → CSP inchangée).
// Laisser vide pour couper la mesure : aucun script n'est alors injecté.
// Site « Afterglow » dans Umami (https://stats.snapshotmedia.ch), créé le 19.11.2026 — identifiant public.
export const UMAMI_WEBSITE_ID = "29a3b336-b78e-4056-8efc-6018b3092291";

const LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;

const decode = (s) => s
  .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;|&#xa0;|&#160;/gi, " ").replace(/&amp;/g, "&");
const text = (h) => decode(h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const abs = (href) => {
  if (!href || href === "/" || href === "./" || href === "index.html") return BASE + "/";
  if (/^https?:/.test(href)) return href;
  return BASE + "/" + href.replace(/^\.?\//, "");
};

/* ---------- lecture du rendu ---------- */
function readFaq(rendered) {
  const out = [];
  const re = /<details[^>]*>\s*<summary>([\s\S]*?)<span class="pm"><\/span><\/summary>\s*<div class="ans">([\s\S]*?)<\/div>\s*<\/details>/g;
  for (const m of rendered.matchAll(re)) out.push({ q: text(m[1]), a: text(m[2]) });
  return out;
}
function readCrumb(rendered) {
  const m = rendered.match(/<div class="crumb[^"]*">([\s\S]*?)<\/div>/);
  if (!m) return null;
  const items = [];
  for (const t of m[1].matchAll(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>|<span>([\s\S]*?)<\/span>/g)) {
    if (t[1] !== undefined) items.push({ name: text(t[2]), href: t[1] });
    else if (text(t[3]) !== "/") items.push({ name: text(t[3]), href: null });
  }
  return items.length ? items : null;
}
function readEagerSlots(rendered) {
  const ids = [];
  for (const m of rendered.matchAll(/<image-slot ([^>]*)>/g)) {
    if (!/loading="eager"/.test(m[1])) continue;
    const id = (m[1].match(/id="([^"]+)"/) || [])[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/* ---------- JSON-LD ---------- */
function upsert(nodes, type, node) {
  const i = nodes.findIndex((n) => [].concat(n["@type"]).includes(type));
  if (i >= 0) nodes[i] = node; else nodes.push(node);
}
function remove(nodes, type) {
  const i = nodes.findIndex((n) => [].concat(n["@type"]).includes(type));
  if (i >= 0) nodes.splice(i, 1);
}
function priceOf(s) {
  const m = String(s).replace(/['’]/g, "").match(/(\d+)/);
  return m ? m[1] : null;
}

/* ---------- API ---------- */
export function syncPage(html, { rendered, ctx, sidecar }) {
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const metaDesc = decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
  const ogImage = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  const P = ctx.KC_PRESTA || {};
  const slug = ctx.KC_SLUG;
  const article = ctx.KC_ARTICLE && ctx.KC_JOURNAL ? ctx.KC_JOURNAL.articles[ctx.KC_ARTICLE] : null;
  const presta = !article && !ctx.KC_VILLE_SLUG && P[slug] ? P[slug] : null;

  // 1) articles : description de la page ← metaDesc des données
  if (article && article.metaDesc) {
    const d = attr(article.metaDesc);
    html = html
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${d}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${d}">`)
      .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${d}">`);
  }

  // 2) JSON-LD
  const ldm = html.match(LD_RE);
  if (ldm && canonical) {
    const parsed = JSON.parse(ldm[1]);
    const nodes = Array.isArray(parsed) ? parsed : [parsed];

    const faq = readFaq(rendered);
    if (faq.length) {
      upsert(nodes, "FAQPage", {
        "@context": "https://schema.org", "@type": "FAQPage", url: canonical,
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      });
    } else remove(nodes, "FAQPage");

    const crumb = readCrumb(rendered);
    if (crumb) {
      if (article) crumb[crumb.length - 1] = { name: article.title, href: null };
      upsert(nodes, "BreadcrumbList", {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: crumb.map((c, i) => ({
          "@type": "ListItem", position: i + 1, name: c.name,
          item: i === crumb.length - 1 ? canonical : abs(c.href),
        })),
      });
    }

    if (presta) {
      const offers = presta.formules.filter((f) => priceOf(f.price)).map((f) => ({
        "@type": "Offer", name: f.name,
        description: f.tag + " — " + f.items.join(", "),
        priceCurrency: "CHF", price: priceOf(f.price),
        ...(f.price.startsWith("dès") ? { priceSpecification: { "@type": "PriceSpecification", minPrice: priceOf(f.price), priceCurrency: "CHF" } } : {}),
      }));
      const name = presta.schemaName || presta.title;
      upsert(nodes, "Service", {
        "@context": "https://schema.org", "@type": "Service",
        name, serviceType: name, url: canonical, description: metaDesc,
        areaServed: "Suisse romande", provider: { "@id": BASE + "/#business" },
        offers,
      });
    }

    if (article) {
      const i = nodes.findIndex((n) => n["@type"] === "BlogPosting");
      if (i >= 0) {
        nodes[i] = {
          ...nodes[i],
          headline: article.title,
          description: article.metaDesc || nodes[i].description,
          datePublished: article.date,
          dateModified: article.updated || article.date,
          image: ogImage || nodes[i].image,
          author: { "@type": "Person", "@id": BASE + "/#kevin", name: "Kevin Chinelli", url: BASE + "/apropos.html" },
        };
      }
    }

    const json = JSON.stringify(nodes.length === 1 ? nodes[0] : nodes, null, 2).replace(/<\//g, "<\\/");
    html = html.replace(LD_RE, () => `<script type="application/ld+json">\n${json}\n</script>`);
  }

  // 3) préchargement des images héros réellement affichées (desktop / mobile ≤ 600 px)
  const eager = readEagerSlots(rendered).filter((id) => sidecar[id] && sidecar[id].u);
  const hasMobile = eager.some((id) => /-mobile$/.test(id));
  const preloads = eager.map((id) => {
    const media = hasMobile ? (/-mobile$/.test(id) ? ' media="(max-width:600px)"' : ' media="(min-width:601px)"') : "";
    return `<link rel="preload" as="image" href="${sidecar[id].u}"${media} fetchpriority="high">`;
  });
  html = html.replace(/<link rel="preload" as="image"[^>]*>\r?\n?/g, "");
  if (preloads.length) {
    const anchor = html.match(/<link rel="preload" href="\.image-slots\.state\.json"[^>]*>\r?\n/);
    if (anchor) html = html.replace(anchor[0], anchor[0] + preloads.join("\n") + "\n");
    else html = html.replace(/(<link rel="stylesheet")/, preloads.join("\n") + "\n$1");
  }

  return finishPage(html);
}

/* Valable aussi pour les pages sans React (404) : langue, <noscript>, mesure. */
export function finishPage(html) {
  html = html.replace(/<html lang="fr">/, '<html lang="fr-CH">');
  // Le pré-rendu met déjà tout le contenu dans le HTML : l'ancien bloc <noscript> (doublon,
  // avec un second H1 et un menu périmé) est retiré. Sans JavaScript, on affiche simplement
  // les éléments animés, qui restent sinon transparents.
  html = html.replace(/<noscript>\s*<div id="seo-fallback"[\s\S]*?<\/noscript>\r?\n?/, "");
  const NS = '<noscript><style>.reveal{opacity:1!important;transform:none!important}</style></noscript>';
  if (!html.includes(NS)) html = html.replace("</head>", NS + "\n</head>");
  html = html.replace(/<script defer src="\/u\/script\.js"[^>]*><\/script>\r?\n?/g, "");
  html = html.replace(/<script data-umami-optout>[\s\S]*?<\/script>\r?\n?/g, "");
  if (UMAMI_WEBSITE_ID) {
    // Exclure un appareil des statistiques sans console (iPhone compris) : ouvrir une page avec
    // #sans-stats (#avec-stats pour revenir). Umami lit localStorage « umami.disabled » avant chaque envoi.
    const OPTOUT = '<script data-umami-optout>try{var h=location.hash;if(h==="#sans-stats"||h==="#avec-stats"){' +
      'h==="#sans-stats"?localStorage.setItem("umami.disabled","1"):localStorage.removeItem("umami.disabled");' +
      'history.replaceState(null,"",location.pathname+location.search);' +
      'alert(h==="#sans-stats"?"Cet appareil n\\u2019est plus compt\\u00e9 dans les statistiques.":"Cet appareil est de nouveau compt\\u00e9 dans les statistiques.")}}catch(e){}</script>';
    html = html.replace("</head>", `${OPTOUT}\n<script defer src="/u/script.js" data-website-id="${UMAMI_WEBSITE_ID}" data-domains="afterglowbykevin.ch"></script>\n</head>`);
  }
  return html;
}
