(() => {
  const STATE_FILE = '.image-slots.state.json';

  // Shared sidecar store (lecture seule — écriture via Omelette supprimée)
  const subs = new Set();
  let slots = {};
  let loadP = null;

  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && typeof j === 'object') slots = j; })
      .catch(() => {})
      .then(() => { subs.forEach((fn) => fn()); });
    return loadP;
  }

  function getSlot(id) {
    const v = slots[id];
    if (!v) return null;
    return typeof v === 'string' ? { u: v } : v;
  }

  // ── Custom element ──────────────────────────────────────────────────────
  const stylesheet =
    ':host{display:inline-block;position:relative;vertical-align:top;' +
    '  font:13px/1.3 system-ui,-apple-system,sans-serif;color:rgba(0,0,0,.55);width:240px;height:160px}' +
    '.frame{position:absolute;inset:0;overflow:hidden;background:rgba(0,0,0,.04)}' +
    '.frame img{position:absolute;inset:0;width:100%;height:100%;-webkit-user-drag:none;user-select:none}' +
    '.empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
    '  justify-content:center;gap:6px;text-align:center;padding:12px;box-sizing:border-box;' +
    '  user-select:none}' +
    '.empty svg{opacity:.45}' +
    '.empty .cap{max-width:90%;font-weight:500;letter-spacing:.01em}';

  const icon =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>' +
    '<path d="m21 15-5-5L5 21"/></svg>';

  class ImageSlot extends HTMLElement {
    static get observedAttributes() {
      return ['shape', 'radius', 'mask', 'fit', 'position', 'placeholder', 'src', 'id', 'loading', 'fetchpriority'];
    }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' + stylesheet + '</style>' +
        '<div class="frame" part="frame">' +
        '  <img part="image" alt="" draggable="false" style="display:none">' +
        '  <div class="empty" part="empty">' + icon +
        '    <div class="cap"></div>' +
        '</div>' +
        '</div>';
      this._frame = root.querySelector('.frame');
      this._img = root.querySelector('.frame img');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._subFn = () => this._render();
    }

    connectedCallback() {
      subs.add(this._subFn);
      load();
      this._render();
    }

    disconnectedCallback() {
      subs.delete(this._subFn);
    }

    attributeChangedCallback() { if (this.shadowRoot) this._render(); }

    _render() {
      const mask = this.getAttribute('mask');
      const shape = (this.getAttribute('shape') || 'rounded').toLowerCase();
      let radius = '';
      if (shape === 'circle') radius = '50%';
      else if (shape === 'pill') radius = '9999px';
      else if (shape === 'rounded') {
        const n = parseFloat(this.getAttribute('radius'));
        radius = (Number.isFinite(n) ? n : 12) + 'px';
      }
      this._frame.style.borderRadius = mask ? '' : radius;
      this._frame.style.clipPath = mask || '';

      const fit = this.getAttribute('fit') || 'cover';
      this._img.style.objectFit = fit;
      this._img.style.objectPosition = this.getAttribute('position') || '50% 50%';

      this._cap.textContent = this.getAttribute('placeholder') || 'Drop an image';

      const stored = this.id ? getSlot(this.id) : null;
      const url = (stored && stored.u) || this.getAttribute('src') || '';

      if (url) {
        if (this._img.getAttribute('src') !== url) this._img.src = url;
        this._img.alt = this.getAttribute('alt') || this.getAttribute('placeholder') || '';
        const loadingVal = this.getAttribute('loading') || 'lazy';
        this._img.setAttribute('loading', loadingVal);
        const fp = this.getAttribute('fetchpriority');
        if (fp) this._img.setAttribute('fetchpriority', fp);
        this._img.setAttribute('decoding', fp === 'high' ? 'sync' : 'async');
        this._img.style.display = 'block';
        this._empty.style.display = 'none';
        this.setAttribute('data-filled', '');
      } else {
        this._img.style.display = 'none';
        this._img.removeAttribute('src');
        this._empty.style.display = 'flex';
        this.removeAttribute('data-filled');
      }
    }
  }

  if (!customElements.get('image-slot')) {
    customElements.define('image-slot', ImageSlot);
  }
})();

;
/* ============================================================
   KEVIN CHINELLI — lightbox
   Click any filled <image-slot> inside a [data-lb-group] container to
   open it full-screen; arrow keys / on-screen arrows navigate the group;
   Esc or backdrop click closes. Reads the slot's rendered <img> (open
   shadow DOM), so it shows whatever image the user dropped.
   Plain JS — loaded on every page after image-slot.js.
   ============================================================ */
(function () {
  var editable = !!(window.omelette && window.omelette.writeFile);
  var overlay, imgEl, counterEl, capEl, group = [], idx = 0, lastFocus = null;

  function build() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "kc-lb";
    overlay.innerHTML =
      '<button class="kc-lb-close" aria-label="Fermer">\u00d7</button>' +
      '<button class="kc-lb-nav kc-lb-prev" aria-label="Pr\u00e9c\u00e9dent">\u2190</button>' +
      '<div class="kc-lb-stage"><img alt=""><div class="kc-lb-cap"></div></div>' +
      '<button class="kc-lb-nav kc-lb-next" aria-label="Suivant">\u2192</button>' +
      '<div class="kc-lb-counter"></div>';
    document.body.appendChild(overlay);
    imgEl = overlay.querySelector("img");
    counterEl = overlay.querySelector(".kc-lb-counter");
    capEl = overlay.querySelector(".kc-lb-cap");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Galerie d'images");
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.classList.contains("kc-lb-stage")) close();
    });
    overlay.querySelector(".kc-lb-close").addEventListener("click", close);
    overlay.querySelector(".kc-lb-prev").addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
    overlay.querySelector(".kc-lb-next").addEventListener("click", function (e) { e.stopPropagation(); step(1); });
    // touch swipe on the stage
    var sx = 0, sy = 0, tracking = false;
    var stage = overlay.querySelector(".kc-lb-stage");
    stage.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (!tracking) return; tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
      else if (dy > 70 && Math.abs(dy) > Math.abs(dx)) close();
    }, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (!overlay || !overlay.classList.contains("open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });
  }

  function caption(slot) {
    return (slot.getAttribute("alt") || slot.getAttribute("placeholder") || "").trim();
  }
  function preload(i) {
    [i - 1, i + 1].forEach(function (n) {
      var s = group[(n + group.length) % group.length];
      if (!s) return;
      var im = slotImg(s);
      if (im && im.src) { var pre = new Image(); pre.src = im.src; }
    });
  }
  function slotImg(slot) {
    return slot.shadowRoot && slot.shadowRoot.querySelector('img[part="image"]');
  }
  function isFilled(slot) { return slot.hasAttribute("data-filled"); }
  function isVisible(slot) { return slot.offsetParent !== null || slot.getClientRects().length > 0; }

  function show(i) {
    idx = (i + group.length) % group.length;
    var im = slotImg(group[idx]);
    imgEl.src = im ? im.src : "";
    var cap = caption(group[idx]);
    imgEl.alt = cap;
    capEl.textContent = cap;
    capEl.style.display = cap ? "" : "none";
    counterEl.textContent = (idx + 1) + " / " + group.length;
    var multi = group.length > 1;
    overlay.querySelector(".kc-lb-prev").style.display = multi ? "" : "none";
    overlay.querySelector(".kc-lb-next").style.display = multi ? "" : "none";
    counterEl.style.display = multi ? "" : "none";
    preload(idx);
  }
  function step(d) {
    imgEl.classList.remove("in");
    show(idx + d);
    requestAnimationFrame(function () { imgEl.classList.add("in"); });
  }

  function open(groupEl, slot) {
    build();
    group = Array.prototype.slice.call(groupEl.querySelectorAll("image-slot")).filter(function (s) {
      return isFilled(s) && isVisible(s);
    });
    if (!group.length) return;
    lastFocus = document.activeElement;
    var start = group.indexOf(slot);
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    show(start < 0 ? 0 : start);
    requestAnimationFrame(function () { imgEl.classList.add("in"); });
    var closeBtn = overlay.querySelector(".kc-lb-close");
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove("open");
    imgEl.classList.remove("in");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  var pending = null;
  document.addEventListener("click", function (e) {
    var path = e.composedPath ? e.composedPath() : [];
    // never hijack the image-slot's own edit controls (Replace / Remove)
    for (var i = 0; i < path.length; i++) {
      if (path[i] && path[i].getAttribute && path[i].getAttribute("data-act")) return;
    }
    var slot = null;
    for (var j = 0; j < path.length; j++) {
      if (path[j] && path[j].tagName === "IMAGE-SLOT") { slot = path[j]; break; }
    }
    if (!slot) return;
    var groupEl = slot.closest("[data-lb-group]");
    if (!groupEl) return;
    if (!isFilled(slot)) return;                 // empty → let image-slot open the file browser
    if (slot.hasAttribute("data-reframe")) return;
    if (editable) {
      // wait a beat so a double-click (reframe) cancels the open
      if (pending) { clearTimeout(pending); pending = null; }
      pending = setTimeout(function () { pending = null; open(groupEl, slot); }, 240);
    } else {
      open(groupEl, slot);
    }
  });
  document.addEventListener("dblclick", function () {
    if (pending) { clearTimeout(pending); pending = null; }
  });
})();

;
(()=>{function useTweaks(defaults){return[defaults,()=>{}]}Object.assign(window,{useTweaks});})();

;
(()=>{const{useState,useEffect,useRef}=React;(function(){try{var p=document.createElement("div");p.style.cssText="position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;transition:opacity .05s linear;pointer-events:none",document.documentElement.appendChild(p),requestAnimationFrame(function(){p.style.opacity="1"}),setTimeout(function(){var op=parseFloat(getComputedStyle(p).opacity);op>.9||document.documentElement.classList.add("no-anim"),p.remove()},220)}catch{}})();const KC={PALETTES:{"Noir chaud":["#141210","#b9926b","#f8f5ef"],"Noir profond":["#0f0e0d","#9a8f7e","#efe9df"],Anthracite:["#16181a","#8a97a0","#eef0f1"],"Ardoise cuivre":["#12100f","#a9744f","#f3ede4"]},HEAD_FONTS:{Cinzel:'"Cinzel", Georgia, serif',Cormorant:'"Cormorant Garamond", Georgia, serif'},BODY_FONTS:{Jost:'"Jost", system-ui, sans-serif',Mulish:'"Mulish", system-ui, sans-serif'},HOME:"index.html"},PALETTE_OPTS=Object.values(KC.PALETTES),PRESTA_NAV=[{slug:"mariage",title:"Mariages",short:"Mariages",href:"mariages.html"},{slug:"portrait",title:"Portraits",short:"Portraits",href:"portraits.html"},{slug:"studio",title:"Studio",short:"Studio",href:"studio.html"},{slug:"maternite",title:"Maternit\xE9 & Grossesse",short:"Maternit\xE9",href:"maternite-grossesse.html"}];function Slot({id,ph,alt,style,className,loading,fetchpriority}){return React.createElement("image-slot",{id,shape:"rect",fit:"cover",placeholder:ph,alt:alt||ph,"aria-label":alt||ph,role:"img",style,class:className,loading,fetchpriority})}function Overline({children,className=""}){return React.createElement("div",{className:"overline "+className},React.createElement("span",{className:"tick"}),children)}function Nav({active=""}){const[scrolled,setScrolled]=useState(!1),[open,setOpen]=useState(!1);useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>40);return onScroll(),window.addEventListener("scroll",onScroll,{passive:!0}),()=>window.removeEventListener("scroll",onScroll)},[]),useEffect(()=>(document.body.style.overflow=open?"hidden":"",()=>{document.body.style.overflow=""}),[open]);const menu=ReactDOM.createPortal(React.createElement("div",{className:"mobile-menu"+(open?" is-open":""),onClick:()=>setOpen(!1)},React.createElement("div",{className:"mm-inner",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"mm-group"},React.createElement("span",{className:"mm-label"},"Prestations"),PRESTA_NAV.map(p=>React.createElement("a",{key:p.slug,href:p.href,onClick:()=>setOpen(!1)},p.title))),React.createElement("a",{className:"mm-top",href:"portfolio.html",onClick:()=>setOpen(!1)},"Portfolio"),React.createElement("a",{className:"mm-top",href:"tarifs.html",onClick:()=>setOpen(!1)},"Tarifs"),React.createElement("a",{className:"mm-top",href:"journal.html",onClick:()=>setOpen(!1)},"Journal"),React.createElement("a",{className:"mm-top",href:"apropos.html",onClick:()=>setOpen(!1)},"\xC0 propos"),React.createElement("a",{className:"mm-top",href:"contact.html",onClick:()=>setOpen(!1)},"Contact"))),document.body);return React.createElement(React.Fragment,null,React.createElement("nav",{className:"nav"+(scrolled?" scrolled":"")+(open?" menu-open":"")},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"nav-links"},React.createElement("div",{className:"nav-item nav-extra"+(PRESTA_NAV.some(p=>p.slug===active)?" is-active":"")},React.createElement("a",{href:PRESTA_NAV[0].href,"aria-haspopup":"true"},"Prestations",React.createElement("span",{className:"caret"},"\u25BE")),React.createElement("div",{className:"nav-drop"},PRESTA_NAV.map(p=>React.createElement("a",{key:p.slug,href:p.href,className:active===p.slug?"is-active":""},p.title)))),React.createElement("a",{href:"portfolio.html",className:"nav-extra"+(active==="portfolio"?" is-active":"")},"Portfolio"),React.createElement("a",{href:"tarifs.html",className:"nav-extra"+(active==="tarifs"?" is-active":"")},"Tarifs"),React.createElement("a",{href:"journal.html",className:"nav-extra"+(active==="journal"?" is-active":"")},"Journal"),React.createElement("a",{href:"apropos.html",className:"nav-extra"+(active==="apropos"?" is-active":"")},"\xC0 propos"),React.createElement("a",{href:"contact.html",className:"nav-cta"+(active==="contact"?" is-active":"")},"Contact")),React.createElement("button",{className:"nav-burger","aria-label":"Ouvrir le menu","aria-expanded":open,onClick:()=>setOpen(o=>!o)},React.createElement("span",null),React.createElement("span",null))),menu)}function Footer(){return React.createElement("footer",{className:"s-dark",style:{borderTop:"1px solid var(--line-d)"}},React.createElement("div",{className:"footer"},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"copy"},"\xA9 2026 \u2014 Tous droits r\xE9serv\xE9s \xB7 Site cr\xE9\xE9 par ",React.createElement("a",{href:"https://snapshotmedia.ch",target:"_blank",rel:"noopener"},"Snapshot Media")),React.createElement("div",{className:"social"},React.createElement("a",{href:"apropos.html"},"\xC0 propos"),React.createElement("a",{href:"confidentialite.html"},"Confidentialit\xE9"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener"},"Instagram"),React.createElement("a",{href:"https://g.page/r/Ccd14Q8WzKZuEBM",target:"_blank",rel:"noopener"},"Google"),React.createElement("a",{href:"tel:+41798507603"},"+41 79 850 76 03"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch"},"contact@afterglowbykevin.ch"))))}function RelatedPresta({current}){const items=PRESTA_NAV.filter(p=>p.slug!==current).slice(0,3);return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(32px,4vw,52px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"\xC0 d\xE9couvrir aussi"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"}},"Autres prestations.")),React.createElement("div",{className:"related-grid"},items.map((p,i)=>React.createElement("a",{key:p.slug,href:p.href,className:"related-card reveal d"+(i+1)},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"presta-"+p.slug,ph:p.title,alt:"Photographe "+p.title.toLowerCase()+" en Suisse romande \u2014 Kevin Chinelli",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,p.title),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192")))))))}function CtaContact({overline="Parlons de votre projet",title="R\xE9servez votre date."}){return React.createElement("section",{className:"sec s-darker cta-band"},React.createElement("div",{className:"wrap pad-y",style:{textAlign:"center"}},React.createElement(Overline,{className:"reveal"},overline),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(34px,5.4vw,72px)",margin:"22px 0 38px"}},title),React.createElement("a",{href:"contact.html",className:"link-arrow reveal d2",style:{fontSize:"14px"}},"Me contacter ",React.createElement("span",{className:"ar"},"\u2192"))))}function useReveal(deps=[]){useEffect(()=>{const reveal=()=>{const vh=window.innerHeight;document.querySelectorAll(".reveal:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();r.top<vh*.9&&r.bottom>0&&el.classList.add("in")})};reveal(),window.addEventListener("scroll",reveal,{passive:!0}),window.addEventListener("resize",reveal);const id=setTimeout(reveal,220);return()=>{window.removeEventListener("scroll",reveal),window.removeEventListener("resize",reveal),clearTimeout(id)}},deps)}function useApplyTweaks(t){useEffect(()=>{const r=document.documentElement.style;Array.isArray(t.palette)&&(r.setProperty("--bg",t.palette[0]),r.setProperty("--accent",t.palette[1]),r.setProperty("--cream",t.palette[2])),r.setProperty("--font-display",KC.HEAD_FONTS[t.heading]||KC.HEAD_FONTS.Cinzel),r.setProperty("--font-body",KC.BODY_FONTS[t.body]||KC.BODY_FONTS.Jost)},[t.palette,t.heading,t.body])}Object.assign(window,{KC,PALETTE_OPTS,PRESTA_NAV,Slot,Overline,Nav,Footer,CtaContact,RelatedPresta,useReveal,useApplyTweaks});})();

;
/* ============================================================
   KEVIN CHINELLI — contenu des prestations (FR · Suisse romande)
   Plain data, exposed as window.KC_PRESTA[slug].
   Tarifs alignés sur le marché romand (CHF) — ajustables sur devis.
   ============================================================ */
window.KC_PRESTA = {

  /* ====================== MARIAGES ====================== */
  mariage: {
    slug: "mariage", title: "Mariages", crumb: "Mariages", heroDefault: "bas",
    heroImg: "Photo hero — couple, cérémonie en extérieur",
    heroHint: "Photographe de mariage en Suisse romande — du premier regard au dernier éclat de rire.",
    intro: {
      lead: "Un mariage ne se rejoue pas. Mon travail consiste à en garder la trace juste, sans jamais m'interposer entre vous et votre journée.",
      paragraphs: [
        "Je photographie les mariages comme on se souvient d'une journée : par fragments, par gestes, par émotions.",
        "Un regard échangé avant la cérémonie, une main serrée un peu plus fort, un parent qui retient ses larmes, les rires qui débordent à table, la piste de danse quand la nuit commence vraiment. Mon approche est discrète, naturelle, proche du reportage. Je cherche moins à interrompre qu'à observer, moins à mettre en scène qu'à révéler ce qui existe déjà.",
        "Bien sûr, nous prenons aussi un moment pour vous deux. Une courte parenthèse, souvent à la lumière de fin de journée, pour créer quelques images plus posées, plus calmes, plus intemporelles. Pas une longue séance qui vous éloigne de vos invités, mais une respiration au milieu de l'intensité.",
        "Je travaille principalement en lumière naturelle, avec une présence légère, pour vous laisser vivre pleinement votre journée. Après le mariage, chaque image est soigneusement sélectionnée et travaillée une à une, avec l'envie de préserver l'atmosphère réelle du moment : les couleurs, la lumière, la peau, les émotions.",
        "Vous recevez une galerie privée, élégante et facile à partager, avec des images en haute résolution, prêtes à être gardées, imprimées et transmises.",
      ],
      quote: "« Le plus beau des sourires est celui que l'on ne prépare pas. »",
    },
    gallery: [
      { ph: "Préparatifs — détails de la robe", o: "v" },
      { ph: "Couple — golden hour",              o: "v" },
      { ph: "Regard de la mariée",               o: "v" },
      { ph: "Cérémonie — échange des vœux",      o: "v" },
      { ph: "Alliances",                         o: "v" },
      { ph: "Sortie sous les pétales",           o: "v" },
      { ph: "Fleurs & décor du lieu",            o: "h" },
      { ph: "Émotion d'un invité",               o: "v" },
    ],
    formules: [
      { tag: "Demi-journée · 4 h", name: "Essentiel", price: "CHF 1'290",
        items: ["Couverture 4 h continues — cérémonie & vin d'honneur", "Galerie privée en ligne, téléchargement HD", "Env. 200 photos, toutes retouchées"] },
      { tag: "Le plus choisi · 10 h", name: "Signature", price: "CHF 2'490", feature: true,
        items: ["Couverture 10 h, des préparatifs à la soirée", "Séance engagement offerte", "Galerie privée + sélection de favoris", "Env. 500 photos, toutes retouchées"] },
      { tag: "Sur mesure · 2 jours", name: "Prestige", price: "CHF 4'500",
        items: ["Présence sur 2 jours (veille / brunch)", "Second photographe", "Séance engagement offerte", "Album fine art relié", "Tirage fine art", "Livraison express sous 10 jours"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "Un appel ou un café pour faire connaissance, comprendre votre histoire, votre lieu et vérifier mes disponibilités sur votre date." },
      { n: "02", title: "Repérage & déroulé", text: "On cale ensemble le timing de la journée, les moments à ne pas manquer et, si besoin, on visite les lieux pour anticiper la lumière." },
      { n: "03", title: "Le jour J", text: "Je suis là tôt, en retrait, à l'écoute. Je connais le déroulé par cœur pour saisir l'instant sans jamais avoir à le provoquer." },
      { n: "04", title: "Tri & livraison", text: "Une sélection de 10 photos pour vos réseaux livrée sous 3 à 5 jours. La galerie complète, toutes photos retouchées, est disponible sous 4 semaines (10 jours en formule Prestige)." },
    ],
    inclus: [
      "Appel préparatoire et conseils déroulé", "Repérage des lieux si besoin",
      "Galerie privée en ligne, téléchargement HD", "Toutes les photos livrées retouchées une à une",
      "Sélection réseaux sociaux livrée sous 3–5 jours", "Droits d'usage privé inclus",
      "Double sauvegarde sécurisée pendant 1 an", "Frais de déplacement inclus en Suisse romande",
    ],
    testimonials: [
      { quote: "Kevin a capturé notre mariage avec une justesse rare. Chaque image raconte précisément ce que nous avons ressenti ce jour-là.", who: "Camille & Thomas, Lavaux" },
      { quote: "Discret toute la journée, et pourtant rien ne lui a échappé. Nos photos sont d'une élégance folle.", who: "Sophie & Julien, Fribourg" },
    ],
    faq: [
      { q: "Dans quelles régions vous déplacez-vous ?", a: "Je me déplace avec plaisir pour tout mariage en Suisse romande et au-delà. Le déplacement est inclus dans toute la Suisse romande (Vaud, Genève, Fribourg, Neuchâtel, Valais) — sans frais ni surprise. Pour un mariage ailleurs en Suisse ou à l'étranger, transport et hébergement éventuels sont détaillés clairement dans le devis." },
      { q: "Photographiez-vous plusieurs mariages le même jour ?", a: "Jamais. Je ne réserve qu'un seul mariage par date : vous avez ma disponibilité et mon énergie du matin jusqu'à la fin de soirée." },
      { q: "Qu'est-ce qu'une séance d'engagement ?", a: "C'est une séance de couple, incluse dans les formules Signature et Prestige, réalisée quelques semaines ou mois avant le mariage. On se retrouve une petite heure dans un lieu qui vous ressemble pour des photos détendues, rien que vous deux. L'intérêt est double : vous repartez avec de belles images à utiliser pour votre faire-part, votre site de mariage ou un tirage — et surtout, vous prenez vos marques avec ma façon de travailler. Le jour J, l'appareil est déjà familier et vous êtes naturels devant l'objectif." },
      { q: "Combien de photos recevons-nous, et quand ?", a: "Selon la formule, de 200 à 500+ photos — toutes retouchées, en pleine résolution. Ces nombres sont une estimation, pas un engagement contractuel : je tiens avant tout à ce que chaque image soit juste et aboutie. Je cherche la qualité, pas la quantité — selon le déroulé de la journée, certaines galeries dépassent largement ces repères, d'autres les approchent. Vous recevez une sélection de 10 images sous 3 à 5 jours (parfait pour vos réseaux), puis la galerie complète sous 4 semaines (10 jours en formule Prestige)." },
      { q: "Que se passe-t-il s'il pleut ?", a: "On prévoit toujours un plan B avec vous au repérage : un abri couvert, une arche, une grange ou un coin du lieu de réception. La pluie offre souvent les images les plus tendres — parapluie transparent à l'appui. Et c'est parfois par mauvais temps que naissent les plus belles photos : la lumière y est plus douce, les couleurs plus profondes." },
      { q: "Proposez-vous un album et des tirages ?", a: "Oui. Albums fine art reliés à la main (papier mat ou brillant, couverture lin ou cuir) et tirages d'art encadrés. L'album est proposé en option sur les formules Essentiel et Signature, et inclus dans la formule Prestige. C'est, de loin, ce qui traverse le mieux les années." },
      { q: "Comment réserver notre date ?", a: "La date est bloquée à la signature du contrat et au versement d'un acompte de 30 %. Le solde est réglé 10 jours après le mariage. Je conseille de réserver 8 à 14 mois à l'avance pour les samedis de mai à septembre." },
    ],
  },

  /* ====================== PORTRAITS ====================== */
  portrait: {
    slug: "portrait", title: "Portraits", crumb: "Portraits", heroDefault: "bas",
    heroImg: "Photo hero — portrait en lumière naturelle, extérieur",
    heroHint: "Photographe portrait en Suisse romande, en lumière naturelle.",
    intro: {
      lead: "Une séance portrait, c'est un cadeau qu'on se fait à soi-même : un temps suspendu, rien que pour vous, et des images qui vous ressemblent vraiment.",
      paragraphs: [
        "On commence par marcher et discuter, le temps que l'appareil se fasse oublier. Je vous donne des indications simples et précises — où poser le regard, quoi faire de vos mains — pour que vous n'ayez jamais à « prendre la pose ». Les plus belles images arrivent presque toujours entre deux consignes, quand vous redevenez tout simplement vous-même.",
        "On repousse si souvent les belles photos de soi à « plus tard » : au bon moment, à quand on sera prêt, à quand on aura le temps. Ce moment, c'est maintenant. S'offrir une séance, c'est s'accorder le droit de se voir autrement, de prendre soin de son image et de garder une trace juste de qui l'on est aujourd'hui.",
        "Je travaille la lumière naturelle, en extérieur ou dans un lieu qui compte pour vous : un quai du Léman à Lausanne, une ruelle de la vieille ville de Genève, votre atelier ou votre intérieur. Portrait personnel, artistique ou pour votre image professionnelle, le cadre s'adapte à l'usage que vous ferez des photos. Vous repartez avec une galerie privée et des fichiers haute définition, prêts pour l'impression comme pour le web.",
      ],
      quote: "« Un visage en dit toujours plus qu'un long discours. »",
    },
    gallery: [
      { ph: "Portrait extérieur — lumière douce", o: "v" },
      { ph: "Regard franc", o: "v" },
      { ph: "Lumière de fin de journée", o: "h" },
      { ph: "Portrait en pied", o: "v" },
      { ph: "Attitude lifestyle", o: "v" },
      { ph: "En mouvement", o: "h" },
      { ph: "Profil — contre-jour", o: "v" },
      { ph: "Portrait naturel", o: "v" },
      { ph: "Instant spontané", o: "h" },
    ],
    formules: [
      { tag: "Découverte · 30 min", name: "Essentiel", price: "CHF 180",
        items: ["1 lieu extérieur", "10 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
      { tag: "Le plus choisi · 1 h", name: "Signature", price: "CHF 280", feature: true,
        items: ["2 lieux (intérieur ou extérieur) ou 2 ambiances proches", "25 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
      { tag: "Pro & image de marque", name: "Corporate", price: "Sur devis",
        items: ["Portraits pro & personal branding", "Extérieur, intérieur ou studio", "Portraits d'équipe possibles", "Droits d'usage commercial inclus", "Volume & délai selon vos besoins"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On clarifie l'usage des images, l'ambiance recherchée et le lieu qui vous correspond le mieux." },
      { n: "02", title: "Préparation", text: "Conseils tenues, couleurs et repérage : tout est prêt pour que la séance soit fluide et vous ressemble." },
      { n: "03", title: "La séance", text: "Décontractée et guidée. Je vous dirige avec justesse, vous restez vous-même — et on s'amuse." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, fichiers prêts à l'emploi, web et impression." },
    ],
    inclus: [
      "Conseils lieu, tenues & couleurs", "Direction de pose bienveillante",
      "Toutes les photos livrées retouchées", "Fichiers web et impression HD", "Galerie privée en ligne",
      "Frais de déplacement inclus en Suisse romande",
    ],
    testimonials: [
      { quote: "Je me trouve enfin à mon avantage sur une photo. Naturel, juste, sans surjeu.", who: "Sarah, Lausanne" },
      { quote: "Des portraits qui me ressemblent vraiment — je les utilise partout, du site au LinkedIn.", who: "Damien, Genève" },
    ],
    faq: [
      { q: "Où se déroule la séance ?", a: "Au lieu de votre choix en Suisse romande — quais de Lausanne, vieille ville de Genève, vignobles de Lavaux, forêt, bord de lac, ou votre intérieur — ou dans un cadre que je vous propose selon l'ambiance souhaitée. Je me déplace dans tout le canton de Vaud, à Genève, Fribourg, Neuchâtel et alentours." },
      { q: "Portrait extérieur ou studio, comment choisir ?", a: "Le portrait en extérieur, en lumière naturelle, donne un rendu vivant et personnel. Le studio offre un cadre maîtrisé, idéal pour le corporate et l'éditorial. Si vous hésitez, on en parle : je vous oriente selon l'usage final des images." },
      { q: "Puis-je utiliser les photos pour mon activité ?", a: "Oui. Pour un usage purement personnel, les droits privés sont inclus dans toutes les formules. Pour un usage professionnel ou commercial — site, réseaux, presse, supports imprimés, personal branding, portraits d'équipe — la formule Corporate inclut les droits d'usage commercial et s'établit sur devis selon vos besoins. Dites-moi simplement l'usage prévu, je vous prépare une proposition adaptée." },
      { q: "Combien de tenues puis-je prévoir ?", a: "Une à deux selon la durée. Je vous conseille en amont sur les couleurs et les matières qui rendent le mieux en photo, et qui s'accordent avec le décor." },
      { q: "Je ne suis pas à l'aise devant l'objectif, est-ce un problème ?", a: "C'est le cas de la grande majorité des gens — et c'est précisément mon métier. Je guide pas à pas, sans jamais vous laisser chercher quoi faire. La plupart repartent en se disant que c'était bien plus simple que prévu." },
      { q: "Sous quel délai les images sont-elles livrées ?", a: "Environ deux semaines, avec une livraison express possible en option si vous en avez besoin plus vite." },
    ],
  },

  /* ============== MATERNITÉ & GROSSESSE ============== */
  maternite: {
    slug: "maternite", title: "Maternité & Grossesse", crumb: "Maternité & Grossesse", heroDefault: "bas",
    heroImg: "Photo hero — silhouette de grossesse, lumière douce",
    heroHint: "Photographe grossesse & maternité en Suisse romande — la douceur de l'attente.",
    intro: {
      lead: "Quelques semaines à peine, et tout change. La grossesse est un moment fragile et magnifique qui mérite d'être célébré.",
      paragraphs: [
        "Je photographie la maternité comme une parenthèse avant que tout change : dans les gestes, les silences, les détails.",
        "Une main posée sur le ventre, une silhouette qui se dessine, un regard échangé, cette façon déjà présente d'attendre et d'aimer. Mon approche est douce, calme, naturelle. La séance se déroule à votre rythme, en lumière naturelle ou dans un espace plus intime, avec l'envie de créer des images élégantes, épurées et intemporelles. Rien n'est figé, rien n'est forcé : je vous guide simplement pour trouver des gestes justes, des attitudes naturelles, des images dans lesquelles vous vous reconnaissez.",
        "Vous pouvez venir seule, en couple ou avec vos enfants. La séance s'adapte à votre histoire, à votre énergie du moment, à ce que vous avez envie de montrer ou de garder plus discret.",
        "Chaque image est ensuite soigneusement sélectionnée et retouchée une à une, avec une attention particulière portée à la lumière, aux couleurs, aux tons de peau et à la douceur générale de la galerie.",
        "Vous recevez une galerie privée, élégante et facile à partager, avec des images en haute résolution, prêtes à être gardées, imprimées et transmises.",
        "Si vous le souhaitez, cette histoire peut se poursuivre après la naissance, avec une séance nouveau-né dans les premiers jours ou les premières semaines de vie, pour relier l'attente et l'arrivée.",
      ],
      quote: "« Porter la vie est la plus belle des lumières. »",
    },
    gallery: [
      { ph: "Silhouette en contre-jour", o: "v" },
      { ph: "Douceur de l'attente", o: "h" },
      { ph: "Portrait serein", o: "v" },
      { ph: "En couple", o: "v" },
      { ph: "Drapé — lumière douce", o: "v" },
      { ph: "Portrait intimiste", o: "v" },
      { ph: "La magie de l'attente", o: "h" },
    ],
    formules: [
      { tag: "Solo · 30 min", name: "Lumière", price: "CHF 180",
        items: ["Séance grossesse en solo", "10 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
      { tag: "Le plus choisi · 1 h", name: "Cocon", price: "CHF 280", feature: true,
        items: ["Séance grossesse 1 h", "Seule, en couple ou en famille", "25 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
      { tag: "Grossesse + nouveau-né", name: "Continuité", price: "CHF 480",
        items: ["Séance grossesse + séance nouveau-né", "Seule, en couple ou en famille", "Galerie privée commune", "Env. 40 photos retouchées", "Galerie complète en option"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On échange sur vos envies, le terme prévu et le moment idéal — généralement entre la 30e et la 36e semaine." },
      { n: "02", title: "Préparation", text: "Conseils tenues et déroulé pour que vous arriviez sereine et confiante." },
      { n: "03", title: "La séance", text: "Un temps doux, sans précipitation, à votre rythme et dans une atmosphère apaisée." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à imprimer et à partager." },
    ],
    inclus: [
      "Conseils tenues & préparation",
      "Toutes les photos livrées retouchées", "Galerie privée en ligne", "Droits d'usage privé",
      "Frais de déplacement inclus en Suisse romande",
    ],
    testimonials: [
      { quote: "Une bulle de douceur. Je ne me trouvais jamais photogénique enceinte — Kevin m'a fait changer d'avis.", who: "Marie, Vevey" },
      { quote: "Des images d'une finesse incroyable, qui resteront dans la famille pour toujours.", who: "Élodie & Nicolas, Neuchâtel" },
    ],
    faq: [
      { q: "À quel moment de la grossesse réserver ?", a: "Idéalement entre la 30e et la 36e semaine : le ventre est joliment arrondi et vous êtes encore tout à fait à l'aise pour bouger. Pour un terme estival, pensez à réserver dès le 2e trimestre." },
      { q: "Où a lieu la séance en Suisse romande ?", a: "En studio chauffé (adresse communiquée à la réservation) ou en extérieur — bord du Léman, forêt, lieu qui vous est cher — dans le canton de Vaud, à Genève, Fribourg, Neuchâtel ou le Valais romand." },
      { q: "Faut-il prévoir des tenues ?", a: "Je vous guide en amont sur les couleurs et les matières qui rendent le mieux en photo. Prévoyez des tenues près du corps qui vous mettent à l'aise, plutôt unies. On peut aussi réaliser des images plus épurées ou en sous-vêtements si vous le souhaitez, jamais imposées." },
      { q: "Peut-on faire la séance en couple ou en famille ?", a: "Bien sûr, et c'est très apprécié. La formule Cocon est pensée pour accueillir le ou la partenaire et les aînés." },
      { q: "Proposez-vous des séances nouveau-né ?", a: "Oui, en continuité de la grossesse avec la formule dédiée, idéalement dans les dix premiers jours du bébé, quand il dort encore beaucoup et se love facilement." },
      { q: "Combien de temps dure la séance ?", a: "Comptez environ 30 minutes pour la formule solo et jusqu'à 1 h pour la formule Cocon. On avance à votre rythme, avec des pauses libres et aucune posture inconfortable — c'est votre moment, on prend le temps." },
    ],
  },

  /* ====================== STUDIO ====================== */
  studio: {
    slug: "studio", title: "Studio", crumb: "Studio", heroDefault: "bas",
    heroImg: "Photo hero — portrait studio, fond sobre",
    heroHint: "Portrait studio, corporate & éditorial en Suisse romande.",
    intro: {
      lead: "Un portrait fort en dit plus que mille mots. En studio, chaque détail est dirigé — lumière, posture, expression — pour révéler le meilleur de vous.",
      paragraphs: [
        "Portraits corporate, photos d'équipe, images de marque personnelle, portraits éditoriaux : le studio offre un cadre maîtrisé et reproductible. Pratique quand il faut une cohérence visuelle entre plusieurs personnes, ou des images calibrées pour un site, une page LinkedIn ou la presse.",
        "Je dirige la séance pas à pas, j'ajuste la lumière sur chaque visage et je vous montre les images au fur et à mesure pour valider ensemble. Choix des fonds (clair, sombre, coloré), une ou plusieurs tenues, et un rendu net, élégant et intemporel.",
        "Pour les entreprises, je me déplace avec un studio mobile dans vos locaux à Lausanne, Genève ou ailleurs en Suisse romande, afin de photographier toute l'équipe sur place, sans perte de temps.",
      ],
      quote: "« La lumière sculpte, le regard révèle. »",
    },
    gallery: [
      { ph: "Portrait éditorial — clair", o: "v" },
      { ph: "Portrait corporate", o: "v" },
      { ph: "Clair-obscur", o: "v" },
      { ph: "Attitude / posture", o: "v" },
      { ph: "Fond sobre", o: "v" },
      { ph: "Portrait de profil", o: "v" },
    ],
    formules: [
      { tag: "Express · 30 min", name: "Portrait", price: "CHF 220",
        items: ["Séance 30 min", "1 fond, 1 tenue", "Galerie privée", "5 photos retouchées", "Format web + impression"] },
      { tag: "Le plus choisi · 1 h", name: "Éditorial", price: "CHF 420", feature: true,
        items: ["Séance 1 h", "2 fonds, 2 tenues", "Direction artistique", "15 photos retouchées", "Droits web inclus"] },
      { tag: "Équipes & marques", name: "Corporate", price: "dès CHF 1'400",
        items: ["Demi-journée, studio mobile sur site", "Jusqu'à 12 personnes", "Charte visuelle cohérente", "Retouche uniforme", "Livraison express"] },
    ],
    process: [
      { n: "01", title: "Brief", text: "On définit l'usage des images, le style recherché et l'ambiance visuelle — du portrait single au shooting d'équipe." },
      { n: "02", title: "Préparation", text: "Conseils tenues, fonds et lumière, pour un résultat aligné avec votre image ou votre charte." },
      { n: "03", title: "Séance", text: "Direction précise et bienveillante : je vous guide pose après pose et vous montre les images en direct." },
      { n: "04", title: "Sélection & retouche", text: "Tri ensemble, puis retouche soignée et livraison aux formats utiles (web, print, réseaux)." },
    ],
    inclus: [
      "Studio professionnel équipé", "Direction de pose", "Choix des fonds et lumières",
      "Toutes les photos livrées retouchées", "Formats web et impression", "Galerie privée en ligne",
      "Frais de déplacement inclus en Suisse romande",
    ],
    testimonials: [
      { quote: "Mes nouveaux portraits corporate ont transformé l'image de mon entreprise. Net, élégant, professionnel.", who: "Antoine, CEO · Genève" },
      { quote: "Kevin met instantanément à l'aise. Je déteste être photographiée — là, j'ai adoré le résultat.", who: "Valérie, Morges" },
    ],
    faq: [
      { q: "Où se trouve le studio ?", a: "En Suisse romande ; l'adresse exacte et l'accès vous sont communiqués à la réservation. Pour les séances d'équipe, je me déplace avec un studio mobile dans vos locaux, à Lausanne, Genève, Fribourg, Neuchâtel ou ailleurs dans la région." },
      { q: "À quoi servent ces portraits ?", a: "Photo de profil LinkedIn, page « équipe » d'un site, dossier de presse, couverture de magazine, image d'auteur ou de conférencier… Dites-moi l'usage final : je calibre le cadrage, le format et le fond en conséquence." },
      { q: "Puis-je venir avec plusieurs tenues ?", a: "Oui. Le nombre dépend de la formule. Je vous conseille sur les associations et les couleurs qui rendent le mieux selon le fond choisi." },
      { q: "Comment se passe une séance corporate pour une équipe ?", a: "J'installe un studio mobile dans une salle de vos locaux. Chaque collaborateur passe 5 à 10 minutes ; je garde la même lumière et le même cadrage pour une galerie parfaitement homogène. Idéal pour une charte visuelle d'entreprise cohérente." },
      { q: "Faites-vous des photos de produits ou de l'événementiel ?", a: "Mon cœur de métier reste le portrait et l'humain. Pour du produit ou de l'événementiel d'entreprise, contactez-moi : selon le projet, je le prends en charge ou vous oriente vers un confrère de confiance." },
      { q: "Sous quel délai les images sont-elles livrées ?", a: "Une à deux semaines selon la formule, avec une livraison express possible en option pour les besoins urgents." },
    ],
  },

  /* ====================== COUPLE ====================== */
  couple: {
    slug: "couple", title: "Couple", crumb: "Couple", heroDefault: "bas",
    heroImg: "Photo hero — couple complice en extérieur",
    heroHint: "Photographe couple & fiançailles en Suisse romande.",
    intro: {
      lead: "Pas besoin d'une grande occasion pour immortaliser un amour. Une séance couple, c'est du temps offert à votre complicité.",
      paragraphs: [
        "En extérieur ou en atelier, je crée un espace léger où vous pouvez être vous-mêmes. Plutôt que des poses figées, je vous propose des situations — marcher, se chuchoter quelque chose, se taquiner — et je saisis ce qui naît entre deux. Les plus belles images viennent presque toujours d'un rire partagé.",
        "Fiançailles, anniversaire de rencontre, future demande, ou simplement l'envie de garder une trace de cette saison de votre vie : la séance s'adapte à votre histoire et au décor qui vous ressemble — un coucher de soleil sur le Léman, un sentier en forêt, les vignes de Lavaux ou un appartement cosy un dimanche matin.",
        "Vous repartez avec une galerie privée et des fichiers haute définition, parfaits pour un faire-part, un tirage ou simplement pour vous.",
      ],
      quote: "« S'aimer, c'est regarder ensemble dans la même direction. »",
    },
    gallery: [
      { ph: "Marche complice", o: "v" },
      { ph: "Regard partagé", o: "v" },
      { ph: "Étreinte — golden hour", o: "v" },
      { ph: "Détails des mains", o: "v" },
      { ph: "Rire spontané", o: "v" },
      { ph: "Silhouette au coucher du soleil", o: "h" },
      { ph: "En mouvement", o: "v" },
      { ph: "Plan rapproché", o: "v" },
      { ph: "Paysage & couple", o: "h" },
      { ph: "Tendresse", o: "v" },
    ],
    formules: [
      { tag: "Découverte · 45 min", name: "Escapade", price: "CHF 320",
        items: ["Séance 45 min", "1 lieu extérieur", "Galerie privée", "20 photos retouchées"] },
      { tag: "Le plus choisi · 1 h 30", name: "Complices", price: "CHF 520", feature: true,
        items: ["Séance 1 h 30", "2 lieux ou 2 tenues", "Repérage conseillé", "40 photos retouchées", "Tirage A5 offert"] },
      { tag: "Fiançailles · 2 h", name: "Promesse", price: "CHF 850",
        items: ["Séance 2 h", "Extérieur + atelier", "Mini-film souvenir 30 s", "60 photos retouchées", "Album fine art 20×20"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On parle de vous, de votre histoire et de l'ambiance qui vous ressemble." },
      { n: "02", title: "Lieu & tenues", text: "On choisit ensemble un cadre et des tenues à votre image, et on cale l'heure idéale pour la lumière." },
      { n: "03", title: "La séance", text: "Décontractée et joueuse : je vous propose des situations, vous vivez l'instant, je capte le reste." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à partager." },
    ],
    inclus: [
      "Échange préparatoire", "Conseils lieu & tenues", "Direction décontractée",
      "Toutes les photos livrées retouchées", "Galerie privée en ligne", "Droits d'usage privé",
      "Frais de déplacement inclus en Suisse romande",
    ],
    testimonials: [
      { quote: "On riait tellement qu'on a oublié l'appareil. Les photos sont à notre image : vivantes et vraies.", who: "Inès & Karim, Montreux" },
      { quote: "Le cadeau de fiançailles parfait. On a hâte de retravailler avec Kevin pour le mariage.", who: "Laura & Maxime, Sion" },
    ],
    faq: [
      { q: "Où se déroule la séance ?", a: "Au lieu de votre choix en Suisse romande — rives du Léman, vignobles de Lavaux, vieille ville, forêt ou votre intérieur — ou dans un cadre que je vous propose. Je me déplace dans le canton de Vaud, à Genève, Fribourg, Neuchâtel, en Valais romand et alentours." },
      { q: "Quel est le meilleur moment de la journée ?", a: "L'heure dorée, juste avant le coucher du soleil : la lumière y est chaude et flatteuse. On peut aussi profiter d'une lumière matinale, plus calme et plus fraîche, selon le lieu." },
      { q: "Et s'il pleut le jour J ?", a: "On reporte sans frais à une date proche, ou on bascule en atelier pour une séance plus intimiste. La météo romande étant ce qu'elle est, on garde toujours une porte de sortie." },
      { q: "Combien de temps dure une séance ?", a: "De 45 minutes à 2 heures selon la formule — le temps de se détendre, d'oublier l'objectif et de profiter l'un de l'autre." },
      { q: "Peut-on l'offrir en cadeau ?", a: "Oui, je propose des bons cadeaux personnalisés, valables un an. Une belle idée pour une demande, un anniversaire ou les fêtes." },
      { q: "On veut s'en servir pour notre faire-part de mariage, c'est possible ?", a: "Bien sûr. Beaucoup de couples font leur séance couple ou fiançailles quelques mois avant le mariage, pour le faire-part et le site. C'est aussi un excellent moyen de se familiariser avec ma façon de travailler avant le jour J." },
    ],
  },

  /* ====================== FAMILLE ====================== */
  famille: {
    slug: "famille", title: "Famille", crumb: "Famille", heroDefault: "bas",
    heroImg: "Photo hero — famille complice en extérieur, lumière dorée",
    heroHint: "Photographe de famille en Suisse romande — des images vraies, sans poses figées.",
    intro: {
      lead: "Les enfants grandissent vite, et les vraies images de famille — celles où tout le monde rit pour de bon — sont les plus précieuses. Mon rôle : capter votre tribu telle qu'elle est, complice et vivante.",
      paragraphs: [
        "Oubliez le « tout le monde regarde l'objectif et sourit ». Je crée une parenthèse de jeu et de complicité — on marche, on se chamaille, on se câline — et je saisis les regards, les fous rires et les gestes tendres entre deux. Les enfants restent eux-mêmes, et les images vous ressemblent vraiment.",
        "En extérieur et en lumière naturelle — au bord du Léman, en forêt, dans les vignes de Lavaux — ou chez vous, dans votre cocon, pour des images intimes du quotidien. La séance s'adapte à l'âge des enfants et à votre rythme : on prend le temps qu'il faut, sans pression.",
        "Séance famille classique, arrivée d'un nouveau-né, séance multigénérationnelle avec les grands-parents, ou rendez-vous annuel pour suivre la tribu qui grandit : on construit la séance autour de votre histoire.",
      ],
      quote: "« Une famille, c'est une histoire qu'on n'a jamais fini de photographier. »",
    },
    gallery: [
      { ph: "Famille complice en extérieur", o: "h" },
      { ph: "Fou rire d'enfant", o: "v" },
      { ph: "Câlin parent-enfant", o: "v" },
      { ph: "Course dans l'herbe", o: "h" },
      { ph: "Détail — petites mains", o: "v" },
      { ph: "Portrait de fratrie", o: "v" },
      { ph: "Tendresse à contre-jour", o: "v" },
      { ph: "Trois générations réunies", o: "v" },
      { ph: "Jeu à l'heure dorée", o: "v" },
      { ph: "Instant du quotidien", o: "v" },
    ],
    formules: [
      { tag: "Découverte · 1 h", name: "Tribu", price: "CHF 390",
        items: ["Séance 1 h en extérieur", "1 lieu en Suisse romande", "Galerie privée en ligne", "20 photos retouchées", "Fichiers web + impression"] },
      { tag: "Le plus choisi · 1 h 30", name: "Complices", price: "CHF 590", feature: true,
        items: ["Séance 1 h 30", "Extérieur ou à domicile", "Jusqu'à 6 personnes", "35 photos retouchées", "Tirage A4 offert"] },
      { tag: "Multigénération · 2 h", name: "Tribu élargie", price: "CHF 890",
        items: ["Séance 2 h", "Jusqu'à 12 personnes (grands-parents inclus)", "2 lieux ou 2 ambiances", "50 photos retouchées", "Album fine art 20×20"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On échange sur votre famille, l'âge des enfants, l'ambiance et le lieu qui vous ressemblent." },
      { n: "02", title: "Préparation", text: "Conseils tenues et couleurs accordées, choix du lieu et de l'horaire idéal selon l'âge des plus petits." },
      { n: "03", title: "La séance", text: "Du jeu, pas de poses figées. Je guide en douceur, au rythme des enfants — et on s'amuse pour de vrai." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à imprimer et à partager avec toute la famille." },
    ],
    inclus: [
      "Échange préparatoire", "Conseils tenues & couleurs accordées", "Séance en extérieur ou à domicile",
      "Direction bienveillante, au rythme des enfants", "Toutes les photos livrées retouchées", "Galerie privée en ligne",
      "Frais de déplacement inclus en Suisse romande",
    ],
    testimonials: [
      { quote: "Les premières photos de famille où nos enfants sont vraiment eux-mêmes. On rit à chaque fois qu'on les regarde.", who: "Famille Rochat, Lausanne" },
      { quote: "Kevin a réuni trois générations avec une facilité déconcertante. Un souvenir inestimable pour nous tous.", who: "Famille Pereira, Fribourg" },
    ],
    faq: [
      { q: "À partir de quel âge photographier les enfants ?", a: "À tout âge — du nouveau-né aux adolescents. Pour les bébés, on privilégie les dix premiers jours ou la période après 6 mois (quand ils tiennent assis). Pour les plus grands, la séance se transforme en jeu : c'est souvent là que naissent les plus belles images." },
      { q: "Où se déroule la séance photo de famille ?", a: "Au lieu de votre choix — bord du Léman, forêt, vignes de Lavaux, parc — ou à votre domicile pour des images intimes du quotidien. Le déplacement est inclus dans toute la Suisse romande, sans frais." },
      { q: "Comment ça se passe avec des enfants en bas âge ou agités ?", a: "C'est tout l'intérêt du reportage : je ne cherche pas à les figer. On joue, on bouge, on fait des pauses goûter si besoin. Je m'adapte à leur rythme et à leur humeur — les enfants qui « ne tiennent pas en place » donnent souvent les photos les plus vivantes." },
      { q: "Peut-on faire une séance avec les grands-parents ?", a: "Oui, et c'est très demandé. La formule Tribu élargie est pensée pour les séances multigénérationnelles, jusqu'à douze personnes — un magnifique cadeau pour réunir toute la famille autour d'images qui restent." },
      { q: "Que porter pour une séance photo de famille ?", a: "Des tenues coordonnées, sans être assorties à l'identique : une palette de 2 ou 3 couleurs douces et naturelles fonctionne très bien. Évitez les gros logos et les motifs chargés. Je vous envoie des conseils personnalisés avant la séance." },
      { q: "Sous quel délai les photos sont-elles livrées ?", a: "Environ deux semaines, dans une galerie privée en ligne, en haute définition pour l'impression comme pour le partage. Une livraison express est possible en option." },
    ],
  },
};

;
(()=>{const{useState}=React,PRESTA_OPTS=window.PRESTA_NAV,Q=new URLSearchParams(window.location.search),TYPES=[{key:"Mariage",href:"mariages.html"},{key:"Portrait",href:"portraits.html"},{key:"Studio",href:"studio.html"},{key:"Maternit\xE9 & Grossesse",href:"maternite-grossesse.html"},{key:"Bon cadeau",href:""},{key:"Autre",href:""}],FORMULES={Mariage:[{name:"Essentiel \u2014 6 h",price:"CHF 1'290"},{name:"Signature \u2014 10 h",price:"CHF 2'690"},{name:"Prestige \u2014 2 jours",price:"d\xE8s CHF 4'500"},{name:"Je ne sais pas encore",price:""}],Portrait:[{name:"Signature \u2014 45 min",price:"CHF 320"},{name:"Lumi\xE8re \u2014 1 h 30",price:"CHF 520"},{name:"Pr\xE9sence \u2014 2 h (pro)",price:"CHF 850"},{name:"Je ne sais pas encore",price:""}],Studio:[{name:"Portrait \u2014 30 min",price:"CHF 220"},{name:"\xC9ditorial \u2014 1 h",price:"CHF 420"},{name:"Corporate \u2014 \xE9quipe",price:"d\xE8s CHF 1'400"},{name:"Je ne sais pas encore",price:""}],"Maternit\xE9 & Grossesse":[{name:"Lumi\xE8re \u2014 1 h studio",price:"CHF 380"},{name:"Cocon \u2014 1 h 30",price:"CHF 590"},{name:"Continuit\xE9 \u2014 grossesse + nouveau-n\xE9",price:"CHF 980"},{name:"Je ne sais pas encore",price:""}],Couple:[{name:"Escapade \u2014 45 min",price:"CHF 320"},{name:"Complices \u2014 1 h 30",price:"CHF 520"},{name:"Promesse \u2014 fian\xE7ailles 2 h",price:"CHF 850"},{name:"Je ne sais pas encore",price:""}],Famille:[{name:"Tribu \u2014 1 h",price:"CHF 390"},{name:"Complices \u2014 1 h 30",price:"CHF 590"},{name:"Tribu \xE9largie \u2014 2 h",price:"CHF 890"},{name:"Je ne sais pas encore",price:""}]},REGIONS=["Vaud / Lausanne","Gen\xE8ve","Fribourg","Neuch\xE2tel","Valais","Riviera / Montreux","Autre / \xE0 d\xE9finir"];function normType(v){if(!v)return"";const hit=TYPES.find(t=>t.key.toLowerCase()===v.toLowerCase()||t.key.toLowerCase().startsWith(v.toLowerCase()));return hit?hit.key:v}function ContactApp(){const[t,setTweak]=useTweaks({palette:KC.PALETTES["Noir chaud"],heading:"Cinzel",body:"Jost"});useApplyTweaks(t);const[step,setStep]=useState(0),[sent,setSent]=useState(!1),[sending,setSending]=useState(!1),[sendError,setSendError]=useState(""),[err,setErr]=useState({}),[a,setA]=useState({type:normType(Q.get("type")||""),formule:"",date:Q.get("date")||"",region:"",nom:"",email:"",tel:"",message:"",website:""});useReveal([step,sent]);const set=(k,v)=>setA(s=>({...s,[k]:v})),hasFormules=!!FORMULES[a.type],STEPS=["Prestation",hasFormules?"Formule":null,"Date & lieu","Coordonn\xE9es","R\xE9capitulatif"].filter(Boolean),validateStep=i=>{const e={},label2=STEPS[i];return label2==="Prestation"&&!a.type&&(e.type="Choisissez une prestation."),label2==="Coordonn\xE9es"&&(a.nom.trim()||(e.nom="Indiquez votre nom."),/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)||(e.email="Adresse email invalide.")),setErr(e),Object.keys(e).length===0},next=()=>{validateStep(step)&&setStep(s=>Math.min(s+1,STEPS.length-1))},back=()=>setStep(s=>Math.max(s-1,0)),submit=async()=>{setSending(!0),setSendError("");try{const res=await fetch("contact.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)}),j=await res.json().catch(()=>({}));res.ok&&j&&j.ok?setSent(!0):res.status===429?setSendError("Trop d'envois en peu de temps. Patientez quelques minutes, puis r\xE9essayez."):setSendError("Une erreur est survenue \xE0 l'envoi. R\xE9essayez, ou \xE9crivez-moi directement \xE0 contact@afterglowbykevin.ch.")}catch{setSendError("Connexion impossible. V\xE9rifiez votre r\xE9seau, ou \xE9crivez-moi \xE0 contact@afterglowbykevin.ch.")}finally{setSending(!1)}},label=STEPS[step],estimate=hasFormules&&a.formule?(FORMULES[a.type].find(f=>f.name===a.formule)||{}).price:"";return React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,{active:"contact"}),React.createElement("main",null,React.createElement("section",{className:"sec s-dark contact-page",style:{paddingTop:"clamp(140px,15vw,210px)",paddingBottom:"clamp(80px,11vw,150px)"}},React.createElement("div",{className:"wrap-narrow"},React.createElement("div",{style:{marginBottom:"clamp(34px,5vw,56px)",textAlign:"center"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Parlons de votre projet"),React.createElement("h1",{className:"display reveal d1",style:{fontSize:"clamp(36px,5.4vw,72px)",marginTop:"18px"}},"Demandez votre devis.")),sent?React.createElement("div",{className:"form-sent reveal",style:{margin:"0 auto",maxWidth:"560px"}},React.createElement("div",{className:"fs-mark"},"\u2713"),React.createElement("h3",null,"Merci, votre demande est bien partie."),React.createElement("p",null,"Je l'ai bien re\xE7ue et je vous r\xE9ponds personnellement sous 48\xA0h ouvr\xE9es. \xC0 tr\xE8s vite\xA0!"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch",className:"link-arrow"},"contact@afterglowbykevin.ch ",React.createElement("span",{className:"ar"},"\u2192"))):React.createElement("div",{className:"funnel reveal"},React.createElement("div",{className:"fn-steps",role:"list"},STEPS.map((s,i)=>React.createElement("div",{key:s,className:"fn-step"+(i===step?" current":"")+(i<step?" done":""),role:"listitem"},React.createElement("span",{className:"fn-num"},i<step?"\u2713":i+1),React.createElement("span",{className:"fn-lbl"},s)))),React.createElement("div",{className:"fn-panel"},label==="Prestation"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"Quel type de s\xE9ance vous int\xE9resse\xA0?"),React.createElement("div",{className:"fn-grid"},TYPES.map(ty=>React.createElement("button",{key:ty.key,type:"button",className:"fn-opt"+(a.type===ty.key?" sel":""),onClick:()=>{set("type",ty.key),set("formule","")}},ty.key))),err.type&&React.createElement("span",{className:"field-err"},err.type)),label==="Formule"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"Une formule en t\xEAte\xA0? ",React.createElement("span",{className:"fn-q-sub"},"(indicatif \u2014 ajustable sur devis)")),React.createElement("div",{className:"fn-list"},FORMULES[a.type].map(f=>React.createElement("button",{key:f.name,type:"button",className:"fn-row"+(a.formule===f.name?" sel":""),onClick:()=>set("formule",f.name)},React.createElement("span",null,f.name),f.price&&React.createElement("span",{className:"fn-price"},f.price))))),label==="Date & lieu"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"Quand et o\xF9\xA0?"),React.createElement("div",{className:"field"},React.createElement("label",null,"Date envisag\xE9e"),React.createElement("input",{className:"control",type:"date",value:a.date,onChange:e=>set("date",e.target.value)})),React.createElement("div",{className:"field"},React.createElement("label",null,"Lieu / r\xE9gion"),React.createElement("select",{className:"control",value:a.region,onChange:e=>set("region",e.target.value)},React.createElement("option",{value:""},"S\xE9lectionner"),REGIONS.map(r=>React.createElement("option",{key:r,value:r},r))))),label==="Coordonn\xE9es"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"Comment vous joindre\xA0?"),React.createElement("div",{className:"field-row"},React.createElement("div",{className:"field"+(err.nom?" error":"")},React.createElement("label",null,"Nom"),React.createElement("input",{className:"control",type:"text",value:a.nom,onChange:e=>set("nom",e.target.value),placeholder:"Votre nom"}),err.nom&&React.createElement("span",{className:"field-err"},err.nom)),React.createElement("div",{className:"field"+(err.email?" error":"")},React.createElement("label",null,"Email"),React.createElement("input",{className:"control",type:"email",value:a.email,onChange:e=>set("email",e.target.value),placeholder:"vous@email.com"}),err.email&&React.createElement("span",{className:"field-err"},err.email))),React.createElement("div",{className:"field"},React.createElement("label",null,"T\xE9l\xE9phone ",React.createElement("span",{className:"opt"},"(facultatif)")),React.createElement("input",{className:"control",type:"tel",value:a.tel,onChange:e=>set("tel",e.target.value),placeholder:"+41 \u2026"})),React.createElement("div",{className:"field"},React.createElement("label",null,"Votre message ",React.createElement("span",{className:"opt"},"(facultatif)")),React.createElement("textarea",{className:"control",rows:"4",value:a.message,onChange:e=>set("message",e.target.value),placeholder:"Le lieu, l'ambiance souhait\xE9e, vos questions\u2026"})),React.createElement("input",{type:"text",name:"website",tabIndex:"-1",autoComplete:"off","aria-hidden":"true",value:a.website,onChange:e=>set("website",e.target.value),style:{position:"absolute",left:"-9999px",width:"1px",height:"1px",opacity:0}})),label==="R\xE9capitulatif"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"On y est. Un dernier coup d'\u0153il\xA0:"),React.createElement("dl",{className:"fn-recap"},React.createElement("div",null,React.createElement("dt",null,"Prestation"),React.createElement("dd",null,a.type||"\u2014")),hasFormules&&React.createElement("div",null,React.createElement("dt",null,"Formule"),React.createElement("dd",null,a.formule||"\u2014",estimate?" \xB7 "+estimate:"")),React.createElement("div",null,React.createElement("dt",null,"Date"),React.createElement("dd",null,a.date||"\xE0 d\xE9finir")),React.createElement("div",null,React.createElement("dt",null,"Lieu"),React.createElement("dd",null,a.region||"\xE0 d\xE9finir")),React.createElement("div",null,React.createElement("dt",null,"Nom"),React.createElement("dd",null,a.nom||"\u2014")),React.createElement("div",null,React.createElement("dt",null,"Email"),React.createElement("dd",null,a.email||"\u2014")),a.tel&&React.createElement("div",null,React.createElement("dt",null,"T\xE9l\xE9phone"),React.createElement("dd",null,a.tel))),React.createElement("p",{className:"fn-note"},"En envoyant, votre demande m'est transmise directement. Je vous r\xE9ponds personnellement sous 48\xA0h.")),sendError&&React.createElement("p",{className:"field-err",style:{textAlign:"center",marginBottom:"12px"}},sendError),React.createElement("div",{className:"fn-actions"},step>0?React.createElement("button",{type:"button",className:"fn-back",onClick:back},"\u2190 Retour"):React.createElement("span",null),label==="R\xE9capitulatif"?React.createElement("button",{type:"button",className:"dc-btn fn-send",onClick:submit,disabled:sending},sending?"Envoi\u2026":"Envoyer ma demande"," ",React.createElement("span",{className:"ar"},"\u2192")):React.createElement("button",{type:"button",className:"dc-btn",onClick:next},"Continuer ",React.createElement("span",{className:"ar"},"\u2192"))))),React.createElement("div",{className:"fn-aside reveal d1"},React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch"},"contact@afterglowbykevin.ch"),React.createElement("span",{className:"jl-dot"},"\xB7"),React.createElement("a",{href:"tel:+41798507603"},"+41 79 850 76 03"),React.createElement("span",{className:"jl-dot"},"\xB7"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener"},"@afterglowbykevin"),React.createElement("span",{className:"jl-dot"},"\xB7"),React.createElement("span",null,"R\xE9ponse sous 48 h"))))),React.createElement(Footer,null))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(ContactApp,null));})();

;
/* ============================================================
   KEVIN CHINELLI — polish & accessibility
   • Skip link (a11y)  • subtle parallax on static heroes
   • tasteful "Voir" cursor over zoomable gallery images
   Vanilla, every page. All effects respect prefers-reduced-motion.
   ============================================================ */
(function () {
  if (window.__kcPolish) return; window.__kcPolish = true;
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var finePointer = false;
  try { finePointer = matchMedia("(pointer: fine)").matches; } catch (e) {}

  /* ---------- skip link ---------- */
  function addSkip() {
    if (document.querySelector(".skip-link")) return true;
    var main = document.querySelector("main");
    if (!main) return false;
    if (!main.id) main.id = "contenu";
    main.setAttribute("tabindex", "-1");
    var a = document.createElement("a");
    a.className = "skip-link";
    a.href = "#" + main.id;
    a.textContent = "Aller au contenu";
    document.body.insertBefore(a, document.body.firstChild);
    return true;
  }

  /* ---------- parallax (static heroes only; NOT the home carousel) ---------- */
  function initParallax() {
    if (reduce) return false;
    var targets = [].slice.call(document.querySelectorAll(".phero .bg, .art-hero .bg, .ap-hero .portrait"));
    if (!targets.length) return false;
    targets.forEach(function (t) { t.style.willChange = "transform"; t.style.transform = "scale(1.12)"; });
    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY || 0;
      targets.forEach(function (t) {
        var off = Math.max(-70, Math.min(70, y * 0.12));
        t.style.transform = "translate3d(0," + off + "px,0) scale(1.12)";
      });
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
    return true;
  }

  /* ---------- inertia scroll (mouse wheel) ---------- */
  function initInertia() {
    if (reduce) return;
    var vy = 0, raf = 0;
    var FRICTION = 0.91, STOP = 0.08, MULT = 0.18, CAP = 520;
    var html = document.documentElement;
    function step() {
      if (Math.abs(vy) < STOP) {
        vy = 0; raf = 0;
        html.style.scrollBehavior = "";  /* restaure smooth pour les ancres */
        return;
      }
      window.scrollBy(0, vy);
      vy *= FRICTION;
      raf = requestAnimationFrame(step);
    }
    window._stopInertia = function () { vy = 0; html.style.scrollBehavior = ""; };
    document.addEventListener("wheel", function (e) {
      /* trackpad → petits deltas continus, déjà gérés nativement */
      if (e.deltaMode === 0 && Math.abs(e.deltaY) < 50) return;
      var tag = e.target && e.target.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return;
      var el = e.target;
      while (el && el !== document.body) {
        var cs = getComputedStyle(el);
        if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight) return;
        el = el.parentElement;
      }
      e.preventDefault();
      /* désactive scroll-behavior:smooth pendant l'inertia (sinon chaque scrollBy
         lance une micro-animation CSS qui entre en conflit avec la suivante) */
      html.style.scrollBehavior = "auto";
      var d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      vy = Math.max(-CAP, Math.min(CAP, vy + d * MULT));
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: false, capture: true });
  }

  /* ---------- "Voir" cursor over zoomable gallery images ---------- */
  function initCursor() {
    if (reduce || !finePointer) return;
    var dot = document.createElement("div");
    dot.className = "kc-cursor";
    dot.innerHTML = '<span>Voir</span>';
    document.body.appendChild(dot);
    var x = 0, y = 0, raf = null;
    function move(e) {
      x = e.clientX; y = e.clientY;
      if (!raf) raf = requestAnimationFrame(function () {
        raf = null;
        dot.style.transform = "translate(" + (x - 1) + "px," + (y - 1) + "px)";
      });
    }
    function over(e) {
      var p = e.composedPath ? e.composedPath() : [];
      var hit = false;
      for (var i = 0; i < p.length; i++) {
        var el = p[i];
        if (el && el.tagName === "IMAGE-SLOT" && el.hasAttribute("data-filled") &&
            el.closest && el.closest("[data-lb-group]") && !el.hasAttribute("data-reframe")) { hit = true; break; }
      }
      dot.classList.toggle("on", hit);
    }
    window.addEventListener("mousemove", move, { passive: true });
    document.addEventListener("mouseover", over, { passive: true });
    document.addEventListener("mouseleave", function () { dot.classList.remove("on"); });
  }

  function init() {
    initInertia();
    initCursor();
    // React apps mount async (Babel) — retry skip link + parallax until <main> exists.
    var tries = 0;
    var state = { skip: false, par: reduce };
    (function tick() {
      if (!state.skip) state.skip = addSkip();
      if (!state.par) state.par = initParallax();
      tries++;
      if ((!state.skip || !state.par) && tries < 40) setTimeout(tick, 120);
    })();
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();

;
/* ============================================================
   KEVIN CHINELLI — page transitions
   JS fade-out on internal navigation + fade-in on load (universal,
   respects prefers-reduced-motion). Plain <script>, no dependencies.
   ============================================================ */
(function () {
  var html = document.documentElement;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A skipped View Transition (e.g. when a navigation is interrupted) rejects a
  // promise that is otherwise harmless; keep it from spamming the console.
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    var msg = (r && (r.message || r)) + "";
    if (/Transition was skipped/i.test(msg)) e.preventDefault();
  });

  // Always clear a stale "leaving" state (e.g. when restored from bfcache).
  window.addEventListener("pageshow", function () {
    document.body && document.body.classList.remove("is-leaving");
  });

  if (reduce) return; // honour reduced motion — no fades

  // Fade the page in on load…
  html.classList.add("kc-anim-pages");

  // …and fade out before following an internal link.
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download")) return;
    var raw = a.getAttribute("href");
    if (!raw || raw.charAt(0) === "#") return;
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) return;

    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    // same page, just a hash → let the browser scroll
    if (url.pathname === location.pathname && url.hash) return;

    e.preventDefault();
    document.body.classList.add("is-leaving");
    setTimeout(function () { location.href = a.href; }, 300);
  });
})();
