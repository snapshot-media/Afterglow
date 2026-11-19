/* ============================================================
   KEVIN CHINELLI — barre d'action sur téléphone (≤ 600 px)
   Vanilla, chargée sur toutes les pages (aucune dépendance React).

   Choix de Kevin le 19.11.2026 sur maquette (https://claude.ai/artifact/USShVWXQJyFBD9j3GsEGop) :
   forme A (barre pleine largeur), visible dès le héros passé, libellé selon la page.
   - « Écrire » : WhatsApp sur le 079 (pro), même message que le pied de page.
   - bouton doré : le formulaire, déjà réglé sur la prestation de la page (contact.html?type=…).
   - masquée sur le héros, quand le bandeau final (.cta-band ; section.contact sur l'accueil) ou le pied de page entre à l'écran,
     quand une photo est agrandie ou le menu ouvert ; absente de Contact et Confidentialité.
   - sur ordinateur : rien (le bouton Contact du menu reste visible).

   Remplace l'ancien bouton flottant « Demander un devis » + WhatsApp, invisible depuis le
   pré-rendu : il se plaçait d'après le <footer> lu au chargement, que React remplace ensuite
   (élément détaché → rectangle à zéro → bouton poussé hors de l'écran). Ici, rien n'est gardé
   en mémoire : héros, bandeau et pied de page sont relus à chaque calcul.
   ============================================================ */
(function () {
  if (window.__kcCta) return; window.__kcCta = true;

  var file = (location.pathname.split("/").pop() || "").replace(/\.html$/, "") || "index";
  if (file === "contact" || file === "confidentialite") return;

  // Thème de la page → libellé et prestation du formulaire
  var J = window.KC_JOURNAL;
  var art = window.KC_ARTICLE && J && J.articles ? J.articles[window.KC_ARTICLE] : null;
  var CAT = { "Mariage": "mariage", "Portrait": "portrait", "Couple": "couple", "Studio": "studio", "Maternité": "maternite" };
  var theme = window.KC_VILLE_SLUG ? (/^famille/.test(window.KC_VILLE_SLUG) ? "famille" : "mariage")
    : art ? CAT[art.category]
    : file === "bon-cadeau" ? "cadeau"
    : window.KC_SLUG;
  var SEANCE = "Réserver une séance";
  var MAP = {
    mariage: ["Réserver une date", "Mariage"],
    portrait: [SEANCE, "Lifestyle"], solo: [SEANCE, "Lifestyle"], couple: [SEANCE, "Lifestyle"], famille: [SEANCE, "Lifestyle"],
    studio: [SEANCE, "Studio"],
    maternite: [SEANCE, "Maternité & Grossesse"],
    cadeau: ["Commander un bon", "Bon cadeau"],
  };
  var pick = MAP[theme] || ["Réserver une date", ""];
  var href = "contact.html" + (pick[1] ? "?type=" + encodeURIComponent(pick[1]) : "");
  var WA = "https://wa.me/41798507603?text=" + encodeURIComponent("Bonjour Kevin, je vous écris depuis le site Afterglow au sujet d'une séance photo : ");

  var css = ''
    + '.kc-bar{display:none}'
    + '@media(max-width:600px){'
    + '.kc-bar{position:fixed;left:0;right:0;bottom:0;z-index:870;display:grid;grid-template-columns:auto 1fr;gap:10px;'
    + '  padding:12px 16px 26px;background:rgba(20,18,16,.94);border-top:1px solid rgba(248,245,239,.14);'
    + '  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font-family:var(--font-body,"Jost",system-ui,sans-serif);'
    + '  transition:transform .32s cubic-bezier(.2,.7,.2,1),opacity .32s}'
    + '.kc-bar.off{opacity:0;transform:translateY(24px);pointer-events:none}'
    + '.kc-bar a{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:50px;padding:0 22px;min-width:0;'
    + '  font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:500;text-decoration:none;white-space:nowrap}'
    + '.kc-bar .kb-wa{background:transparent;color:#f8f5ef;border:1px solid rgba(248,245,239,.38)}'
    + '.kc-bar .kb-go{background:#b9926b;color:#141210;border:1px solid #b9926b}'
    + '.kc-bar svg{width:18px;height:18px;flex:none}'
    + '}'
    // écrans étroits : mêmes boutons, un peu moins d'air, pour que les libellés longs tiennent
    + '@media(max-width:380px){.kc-bar a{padding:0 14px;letter-spacing:.14em}}'
    + '@media(max-width:350px){.kc-bar a{font-size:11px;letter-spacing:.1em;padding:0 12px}.kc-bar{gap:8px;padding-left:12px;padding-right:12px}}'
    + 'body:has(.kc-lb.open) .kc-bar,body:has(.nav.menu-open) .kc-bar,body:has(.mobile-menu.is-open) .kc-bar'
    + '{opacity:0!important;pointer-events:none!important}'
    + '@media print{.kc-bar{display:none!important}}'
    + '@media (prefers-reduced-motion:reduce){.kc-bar{transition:none}}';

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var waSvg = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  var bar = document.createElement("div");
  bar.className = "kc-bar off";
  bar.setAttribute("role", "navigation");
  bar.setAttribute("aria-label", "Réserver ou écrire");
  bar.innerHTML =
      '<a class="kb-wa" href="' + WA + '" target="_blank" rel="noopener" data-umami-event="barre-whatsapp" aria-label="Écrire sur WhatsApp">' + waSvg + 'Écrire</a>'
    + '<a class="kb-go" href="' + href + '" data-umami-event="barre-reserver">' + pick[0] + ' <span aria-hidden="true">→</span></a>';
  document.body.appendChild(bar);

  // Visible quand le bas du héros a passé le milieu de l'écran, jusqu'à ce que le bandeau final
  // (ou le pied de page) arrive au-dessus de la barre. Éléments relus à chaque fois (React les remplace).
  var HERO = ".phero, .hhero, .hero, .art-hero";
  var raf = 0;
  function update() {
    raf = 0;
    var vh = window.innerHeight;
    var hero = document.querySelector(HERO);
    var passed = hero ? hero.getBoundingClientRect().bottom < vh / 2 : window.scrollY > vh / 2;
    var end = document.querySelector(".cta-band, section.contact") || document.querySelector("footer"); // section.contact : fin de l'accueil
    var atEnd = end ? end.getBoundingClientRect().top < vh - 90 : false;
    bar.classList.toggle("off", !(passed && !atEnd));
  }
  function ask() { if (!raf) raf = requestAnimationFrame(update); }
  window.addEventListener("scroll", ask, { passive: true });
  window.addEventListener("resize", ask);
  window.addEventListener("load", ask);
  ask();
})();
