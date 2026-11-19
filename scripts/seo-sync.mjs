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
   - <img> écrite dans chaque <image-slot> du pré-rendu + correspondance id → image (#kc-slots)
   - lang="fr-CH", <noscript> de secours (le pré-rendu suffit), fondu d'entrée après lien interne
   - script de mesure Umami (si UMAMI_WEBSITE_ID est renseigné)
   ============================================================ */

import { srcsetOf } from "./gen-variants.mjs";

export const BASE = "https://afterglowbykevin.ch";

// Mesure d'audience : Umami auto-hébergé, servi sous /u/ (même origine → CSP inchangée).
// Laisser vide pour couper la mesure : aucun script n'est alors injecté.
// Site « Afterglow » dans Umami (https://stats.snapshotmedia.ch), créé le 19.11.2026 — identifiant public.
export const UMAMI_WEBSITE_ID = "29a3b336-b78e-4056-8efc-6018b3092291";

const LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;

const decode = (s) => s
  .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;|&#xa0;|&#160;/gi, " ").replace(/&amp;/g, "&");
// (les balises deviennent des espaces : « page <a>Bon cadeau</a>. » donnerait « Bon cadeau . », d'où le dernier replace,
// limité au point, à la virgule et à la parenthèse, qui ne prennent jamais d'espace avant en français)
const text = (h) => decode(h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").replace(/\s+([.,)])/g, "$1").trim();
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
const slotAttr = (attrs, name) => (attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`)) || [])[1];
const slotUrl = (sidecar, id) => {
  const v = id && sidecar[id];
  return v ? (typeof v === "string" ? v : v.u) || null : null;
};
function readEagerSlots(rendered) {
  const out = [];
  for (const m of rendered.matchAll(/<image-slot ([^>]*)>/g)) {
    if (!/loading="eager"/.test(m[1])) continue;
    const id = slotAttr(m[1], "id");
    if (id && !out.some((s) => s.id === id)) out.push({ id, media: slotAttr(m[1], "media") || null, sizes: slotAttr(m[1], "sizes") || null });
  }
  return out;
}

/* ---------- images écrites dans le HTML ----------
   Sans cela, une photo n'apparaît qu'une fois le JavaScript chargé et exécuté (le composant
   <image-slot> la cherche dans .image-slots.state.json) : sur téléphone, c'était l'essentiel du
   temps d'affichage du héros. Le build écrit donc l'image dans chaque <image-slot> du pré-rendu ;
   le composant la laisse affichée (son <slot>) jusqu'au rendu React. Un emplacement qui porte
   media= devient un <picture> sans image par défaut : hors de sa condition, rien n'est téléchargé. */
/* sizes : la largeur à laquelle la photo sera dessinée, pour que le navigateur prenne la plus petite
   version réduite qui suffit. Les photos remplissent leur cadre (object-fit: cover) : une photo en
   largeur dans un cadre en hauteur est dessinée plus large que le cadre (jusqu'à 2,6 fois sur le
   site, mesuré le 19.11). « sizes=auto » de Chrome, qui ne regarde que le cadre, la rendrait floue.
   - héros (eager, chargés avant toute mise en page) : cadre = l'écran ; si l'écran est plus étroit
     que la photo, c'est la hauteur qui commande : (max-aspect-ratio: L/H) <100·L/H>vh, sinon 100vw ;
   - les autres (lazy) : 100vw dans le HTML, puis la taille exacte, max(largeur, hauteur × L/H) du
     cadre, posée par le petit script data-kc-sizes avant tout chargement, et par image-slot.js
     (même calcul, sinon le navigateur prendrait la même photo deux fois en deux tailles). */
export const heroSizes = (m) => `(max-aspect-ratio: ${m.W}/${m.H}) ${Math.ceil((100 * m.W) / m.H)}vh, 100vw`;
const SIZES_SCRIPT = '<script data-kc-sizes>(function(){var l=document.querySelectorAll("image-slot>img[data-ar]");' +
  'for(var i=0;i<l.length;i++){var g=l[i],r=g.parentNode.getBoundingClientRect();' +
  'if(r.width)g.sizes=Math.ceil(Math.max(r.width,r.height*g.getAttribute("data-ar")))+"px"}})()</script>';

function fillSlots(rendered, sidecar, variants) {
  return rendered.replace(/<image-slot ([^>]*)><\/image-slot>/g, (whole, attrs) => {
    const url = slotUrl(sidecar, slotAttr(attrs, "id"));
    if (!url) return whole;
    const alt = slotAttr(attrs, "alt") ?? slotAttr(attrs, "placeholder") ?? "";
    const loading = slotAttr(attrs, "loading") || "lazy";
    const fp = slotAttr(attrs, "fetchpriority");
    const fit = slotAttr(attrs, "fit") || "cover";
    const pos = slotAttr(attrs, "position");
    const media = slotAttr(attrs, "media");
    const set = srcsetOf(variants, url);
    const m = variants[url];
    const own = slotAttr(attrs, "sizes");
    const sizes = !set ? "" : ` sizes="${own || (loading === "lazy" ? "100vw" : heroSizes(m))}"`;
    // rapport largeur / hauteur pour le script data-kc-sizes (0 hors cover : la largeur du cadre suffit)
    const ar = set && !own && loading === "lazy" ? ` data-ar="${fit === "cover" ? m.W / m.H : 0}"` : "";
    const style = (fit !== "cover" ? `object-fit:${fit};` : "") + (pos ? `object-position:${pos};` : "");
    const img = `<img alt="${alt}" loading="${loading}"` + (fp ? ` fetchpriority="${fp}"` : ` decoding="async"`) +
      (style ? ` style="${style}"` : "");
    const light = media
      ? `<picture><source media="${media}" srcset="${attr(set || url)}"${sizes}>${img}></picture>`
      : `${img}${set ? ` srcset="${attr(set)}"${sizes}${ar}` : ""} src="${attr(url)}">`;
    return `<image-slot ${attrs}>${light}</image-slot>`;
  });
}
// La correspondance id → image des emplacements de la page, lue par image-slot.js sans requête
// (avec, quand la photo a des versions réduites, leur srcset et ses dimensions : { u, s, w, h }).
function slotMap(rendered, sidecar, variants) {
  const map = {};
  for (const m of rendered.matchAll(/<image-slot ([^>]*)>/g)) {
    const id = slotAttr(m[1], "id");
    const url = slotUrl(sidecar, id);
    if (!url) continue;
    const set = srcsetOf(variants, url);
    map[id] = set ? { u: url, s: set, w: variants[url].W, h: variants[url].H } : url;
  }
  return map;
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
export function syncPage(html, { rendered, ctx, sidecar, variants = {} }) {
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
  const eager = readEagerSlots(rendered).filter((s) => slotUrl(sidecar, s.id));
  const hasMobile = eager.some((s) => /-mobile$/.test(s.id));
  const preloads = eager.map((s) => {
    const q = s.media || (hasMobile ? (/-mobile$/.test(s.id) ? "(max-width:600px)" : "(min-width:601px)") : null);
    const url = slotUrl(sidecar, s.id);
    const set = srcsetOf(variants, url);
    // imagesrcset / imagesizes identiques à ceux de l'image : le préchargement prend la même version
    return `<link rel="preload" as="image" href="${attr(url)}"` +
      (set ? ` imagesrcset="${attr(set)}" imagesizes="${s.sizes || heroSizes(variants[url])}"` : "") +
      `${q ? ` media="${q}"` : ""} fetchpriority="high">`;
  });
  html = html.replace(/<link rel="preload" as="image"[^>]*>\r?\n?/g, "");
  // la correspondance des images est désormais dans la page : plus de requête à précharger
  html = html.replace(/<link rel="preload" href="\.image-slots\.state\.json"[^>]*>\r?\n?/g, "");
  if (preloads.length) html = html.replace(/(<link rel="stylesheet")/, preloads.join("\n") + "\n$1");

  // 4) images écrites dans le pré-rendu + correspondance id → image pour image-slot.js
  html = html.replace(/<!--ssg-->([\s\S]*?)<!--\/ssg-->/, (_m, inner) => `<!--ssg-->${fillSlots(inner, sidecar, variants)}<!--/ssg-->`);
  // taille exacte des photos « lazy » avant leur chargement (voir heroSizes) : juste après le contenu
  html = html.replace(/<script data-kc-sizes>[\s\S]*?<\/script>\r?\n?/g, "");
  if (html.includes(" data-ar=")) html = html.replace("<!--/ssg--></div>", () => `<!--/ssg--></div>\n${SIZES_SCRIPT}`);
  html = html.replace(/<script type="application\/json" id="kc-slots">[\s\S]*?<\/script>\r?\n?/g, "");
  const map = slotMap(rendered, sidecar, variants);
  if (Object.keys(map).length) {
    const json = JSON.stringify(map).replace(/</g, "\\u003c");
    html = html.replace("</head>", `<script type="application/json" id="kc-slots">${json}</script>\n</head>`);
  }

  return finishPage(html);
}

/* Valable aussi pour les pages sans React (404) : langue, <noscript>, mesure. */
export function finishPage(html) {
  html = html.replace(/<html lang="fr">/, '<html lang="fr-CH">');
  // Fondu d'entrée après un lien interne seulement (kc-transitions.js laisse « kc-fade » au clic) :
  // la classe doit être là avant le premier affichage, d'où ce script en tête, avant les feuilles de style.
  html = html.replace(/<script data-kc-fade>[\s\S]*?<\/script>\r?\n?/g, "");
  const FADE = '<script data-kc-fade>try{var t=+sessionStorage.getItem("kc-fade");sessionStorage.removeItem("kc-fade");' +
    'if(t&&Date.now()-t<5000&&!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("kc-anim-pages")}catch(e){}</script>';
  html = html.replace(/(<meta charset="UTF-8">\r?\n?)/i, (m) => m + FADE + "\n");
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
