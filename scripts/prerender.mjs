/* ============================================================
   PRÉ-RENDU SSG — injecte le HTML rendu par React dans #root
   à la compilation, pour que Google voie le contenu complet
   sans exécuter le JS (le site reste un SPA React côté client).

   Stratégie « prerender + render client » (PAS d'hydratation) :
   - On exécute les composants côté Node via react-dom/server.
   - Le HTML produit est injecté dans <div id="root">…</div>.
   - Côté client, createRoot().render() (code inchangé) REMPLACE
     proprement ce contenu — aucun risque de mismatch d'hydratation.
   - Si une page échoue au pré-rendu, on la laisse telle quelle :
     dégradation gracieuse vers le rendu client (comportement actuel).

   Mécanique de partage inter-fichiers reproduite : dans le navigateur,
   `window` EST l'objet global, donc Object.assign(window, {Nav,…})
   dans kc-shared expose Nav/Slot/… comme variables globales que les
   fichiers d'app suivants lisent par nom. On reproduit ça en faisant
   `window === globalThis` dans le sandbox vm.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { syncPage, finishPage } from "./seo-sync.mjs";
import { readManifest } from "./gen-variants.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const ReactDOMServer = require("react-dom/server");

// Scripts à exécuter en SSR : la base partagée, les données, l'app.
// Tout le reste (lib React, image-slot, lightbox, cta, polish, transitions,
// edit-mode, tweaks) est du comportement navigateur sans valeur SEO.
const SSR_SCRIPT = /^(tweaks-panel|kc-shared|kc-app|kc-.+-data|kc-.+-app)\.js$/;

/* ---------- shim DOM minimal et défensif ---------- */
// Nœud universel : toute lecture de propriété renvoie un nœud chaînable,
// `style` est un vrai objet, les méthodes DOM/événement sont des no-op.
function makeNode() {
  const style = {};
  const node = new Proxy(function () { return node; }, {
    get(_t, prop) {
      if (prop === "style") return style;
      if (prop === "classList") return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (prop === "getBoundingClientRect") return () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
      if (prop === "querySelectorAll") return () => [];
      if (prop === "querySelector") return () => null;
      if (prop === "getAttribute") return () => null;
      if (prop === "appendChild" || prop === "removeChild" || prop === "remove" ||
          prop === "insertBefore" || prop === "setAttribute" || prop === "removeAttribute" ||
          prop === "addEventListener" || prop === "removeEventListener" ||
          prop === "setPointerCapture" || prop === "releasePointerCapture" || prop === "focus" || prop === "blur")
        return () => {};
      if (prop === Symbol.toPrimitive) return () => "";
      if (prop === "nodeType") return 1;
      return node; // chaînage : document.documentElement.style…, body.appendChild…
    },
    set() { return true; },
    apply() { return node; },
  });
  return node;
}

function makeSandbox() {
  let captured = null;
  const ReactDOM = {
    createRoot: () => ({ render: (el) => { captured = el; }, unmount() {} }),
    hydrateRoot: (_c, el) => { captured = el; return { render() {}, unmount() {} }; },
    render: (el) => { captured = el; },
    createPortal: () => null,        // portails (menu mobile) : ignorés en SSR
    flushSync: (fn) => (fn ? fn() : undefined),
    findDOMNode: () => null,
    unstable_batchedUpdates: (fn) => (fn ? fn() : undefined),
  };

  class StubObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }

  const sandbox = {
    React,
    ReactDOM,
    console,
    document: {
      createElement: () => makeNode(),
      createTextNode: () => makeNode(),
      getElementById: () => makeNode(),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {},
      documentElement: makeNode(),
      body: makeNode(),
      head: makeNode(),
    },
    navigator: { userAgent: "ssr", language: "fr-CH" },
    location: { href: "https://afterglowbykevin.ch/", search: "", pathname: "/", hash: "", origin: "https://afterglowbykevin.ch" },
    history: { pushState() {}, replaceState() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ opacity: "1", getPropertyValue: () => "" }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,           // pas d'async en SSR : les effets diffèrés sont inutiles
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    ResizeObserver: StubObserver,
    IntersectionObserver: StubObserver,
    MutationObserver: StubObserver,
    customElements: { get: () => undefined, define() {}, whenDefined: () => Promise.resolve() },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
    Event: class { constructor(t) { this.type = t; } },
    HTMLElement: class {},
    URLSearchParams,
    URL,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    scrollTo() {}, scrollBy() {},
    innerWidth: 1280, innerHeight: 800, scrollY: 0, scrollX: 0, devicePixelRatio: 2,
    parent: { postMessage() {} },
    omelette: undefined,           // jamais en mode édition côté SSR
  };

  const ctx = vm.createContext(sandbox);
  // window === objet global du contexte (comme dans un navigateur), pour que
  // Object.assign(window, {Nav,…}) crée de vraies variables globales.
  vm.runInContext("var window = this; var self = this; this.globalThis = this; this.frames = this; this.top = this;", ctx);
  return { ctx, sandbox, getCaptured: () => captured };
}

// Réinitialise #root à vide, qu'il contienne déjà un pré-rendu marqué ou non.
// Les marqueurs <!--ssg--> sont uniques → strip fiable malgré les <div> imbriqués.
const ROOT_ANY = /<div id="root">(?:<!--ssg-->[\s\S]*?<!--\/ssg-->)?<\/div>/;
function resetRoot(html) {
  return html.replace(ROOT_ANY, '<div id="root"></div>');
}

/* ---------- pré-rendu d'une page ----------
   Renvoie le HTML à écrire, ou null si la page n'est pas concernée. */
function prerenderPage(root, htmlFile, htmlRaw, sidecar, variants) {
  const html = resetRoot(htmlRaw);
  if (!/<div id="root"><\/div>/.test(html)) return null; // pas de point de montage

  // 1) scripts inline qui posent les globals de page (KC_SLUG, KC_VILLE_SLUG, …)
  const inlineGlobals = [];
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const code = m[1];
    if (/window\.KC_\w+\s*=/.test(code)) inlineGlobals.push(code);
  }

  // 2) scripts locaux à exécuter (ordre du HTML), query ?v= retirée.
  // Si le HTML a déjà été bundlé (data-bundle-sources), on expand l'attribut
  // pour retrouver la liste des fichiers source originaux.
  const scripts = [];
  for (const m of html.matchAll(/<script([^>]*)>/g)) {
    const attrs = m[1];

    // HTML bundlé → data-bundle-sources liste les fichiers originaux
    const sourcesM = attrs.match(/data-bundle-sources="([^"]+)"/);
    if (sourcesM) {
      for (const s of sourcesM[1].split(",")) {
        if (SSR_SCRIPT.test(s)) scripts.push(s);
      }
      continue;
    }

    const srcM = attrs.match(/src="([^"?]+)/);
    if (!srcM) continue;
    const base = srcM[1].split("/").pop();
    if (SSR_SCRIPT.test(base)) scripts.push(base);
  }
  if (!scripts.some((s) => /-app\.js$/.test(s))) return null; // pas d'app → page non React

  const { ctx, getCaptured } = makeSandbox();

  // 3) exécute : globals inline, puis shared/data/app dans l'ordre
  for (const code of inlineGlobals) vm.runInContext(code, ctx);
  for (const base of scripts) {
    const file = resolve(root, base);
    if (!existsSync(file)) throw new Error(`script manquant : ${base}`);
    vm.runInContext(readFileSync(file, "utf8"), ctx, { filename: base });
  }

  const el = getCaptured();
  if (!el) throw new Error("aucun élément capté (createRoot non appelé)");

  const rendered = ReactDOMServer.renderToString(el);
  const out = html.replace(/<div id="root"><\/div>/, () => `<div id="root"><!--ssg-->${rendered}<!--/ssg--></div>`);
  // FAQ, fil d'Ariane, offres, préchargements… recalculés depuis le rendu (voir seo-sync.mjs)
  return syncPage(out, { rendered, ctx, sidecar, variants });
}

/* ---------- API ---------- */
export function prerenderAll(root, htmlFiles) {
  let ok = 0, skipped = 0, failed = 0;
  const sidecarPath = resolve(root, ".image-slots.state.json");
  const sidecar = existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, "utf8")) : {};
  const variants = readManifest(root); // versions réduites des photos (gen-variants.mjs)
  for (const htmlFile of htmlFiles) {
    const path = resolve(root, htmlFile);
    const html = readFileSync(path, "utf8");
    try {
      const out = prerenderPage(root, htmlFile, html, sidecar, variants);
      if (out == null) {
        // page non React : on s'assure juste qu'aucun pré-rendu périmé ne traîne
        const clean = finishPage(resetRoot(html));
        if (clean !== html) writeFileSync(path, clean);
        skipped++;
        continue;
      }
      writeFileSync(path, out);
      ok++;
    } catch (err) {
      failed++;
      // échec → on réinitialise #root à vide (rendu client = comportement actuel)
      const clean = resetRoot(html);
      if (clean !== html) writeFileSync(path, clean);
      console.warn(`  ⚠ pré-rendu ignoré pour ${htmlFile} : ${err.message}`);
    }
  }
  console.log(`✅ Pré-rendu SSG : ${ok} pages injectées, ${skipped} ignorées, ${failed} en échec (rendu client conservé)`);
  return { ok, skipped, failed };
}
