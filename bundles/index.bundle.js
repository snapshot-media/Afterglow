(() => {
  const STATE_FILE = '.image-slots.state.json';

  // Correspondance id → image. Le build (scripts/seo-sync.mjs) écrit dans chaque page celles
  // qu'elle affiche (<script type="application/json" id="kc-slots">) : l'image s'affiche sans
  // attendre de requête. Le fichier complet n'est demandé que pour un id absent de la page.
  const subs = new Set();
  let slots = {};
  let loadP = null;
  try {
    const inline = document.getElementById('kc-slots');
    if (inline) slots = JSON.parse(inline.textContent) || {};
  } catch (e) { slots = {}; }

  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && typeof j === 'object') slots = Object.assign({}, j, slots); })
      .catch(() => {})
      .then(() => { subs.forEach((fn) => fn()); });
    return loadP;
  }

  // { u: image d'origine, s: srcset des versions réduites (absent hors de #kc-slots) }
  function getSlot(id) {
    const v = slots[id];
    if (!v) return null;
    return typeof v === 'string' ? { u: v } : v;
  }

  // media="(max-width:600px)" : l'image n'est chargée que si la condition est vraie
  // (la version téléphone d'un héros ne se télécharge plus sur ordinateur, et inversement).
  const mqls = new Map();
  function mediaMatches(q, fn) {
    if (!q || !window.matchMedia) return true;
    let m = mqls.get(q);
    if (!m) {
      m = { mql: matchMedia(q), fns: new Set() };
      const fire = () => m.fns.forEach((f) => f());
      if (m.mql.addEventListener) m.mql.addEventListener('change', fire);
      else if (m.mql.addListener) m.mql.addListener(fire);
      mqls.set(q, m);
    }
    m.fns.add(fn);
    return m.mql.matches;
  }
  function mediaForget(fn) { mqls.forEach((m) => m.fns.delete(fn)); }

  // Cadre redimensionné (fenêtre, rotation) : la taille d'affichage change, le navigateur reprend
  // au besoin une version plus grande. Un seul observateur pour tous les emplacements.
  let ro = null;
  function sizeWatch(el) {
    if (!window.ResizeObserver) return;
    if (!ro) ro = new ResizeObserver((entries) => entries.forEach((e) => e.target._resized && e.target._resized()));
    if (!el._watched) { el._watched = true; ro.observe(el); }
  }
  function sizeForget(el) { if (ro && el._watched) { ro.unobserve(el); el._watched = false; } }

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
      return ['shape', 'radius', 'mask', 'fit', 'position', 'placeholder', 'src', 'id', 'loading', 'fetchpriority', 'media', 'sizes'];
    }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      // <slot> : l'image écrite dans le HTML au build reste affichée telle quelle
      // jusqu'au rendu React, qui recrée l'élément sans elle.
      root.innerHTML =
        '<style>' + stylesheet + '</style>' +
        '<div class="frame" part="frame">' +
        '  <img part="image" alt="" draggable="false" style="display:none">' +
        '  <div class="empty" part="empty">' + icon +
        '    <div class="cap"></div>' +
        '</div>' +
        '  <slot></slot>' +
        '</div>';
      this._frame = root.querySelector('.frame');
      this._img = root.querySelector('.frame img');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._subFn = () => this._render();
    }

    connectedCallback() {
      subs.add(this._subFn);
      if (this.id && !(this.id in slots)) load();
      this._render();
    }

    disconnectedCallback() {
      subs.delete(this._subFn);
      mediaForget(this._subFn);
      sizeForget(this);
    }

    // React (et l'analyse du HTML) posent les attributs un à un avant l'insertion : rendre seulement
    // une fois l'élément dans la page, quand media, loading et fetchpriority sont tous connus.
    attributeChangedCallback() { if (this.shadowRoot && this.isConnected) this._render(); }

    // Largeur à laquelle la photo sera dessinée — MÊME calcul que scripts/seo-sync.mjs (heroSizes et
    // le script data-kc-sizes), pour que le navigateur reprenne la version déjà chargée par le HTML.
    // La photo remplit son cadre (cover) : en hauteur, elle peut déborder la largeur du cadre.
    _sizes(stored) {
      const own = this.getAttribute('sizes');
      if (own) return own;
      if ((this.getAttribute('loading') || 'lazy') !== 'lazy') {
        return '(max-aspect-ratio: ' + stored.w + '/' + stored.h + ') ' + Math.ceil(100 * stored.w / stored.h) + 'vh, 100vw';
      }
      const r = this.getBoundingClientRect();
      if (!r.width) return '100vw';
      const ar = (this.getAttribute('fit') || 'cover') === 'cover' ? stored.w / stored.h : 0;
      return Math.ceil(Math.max(r.width, r.height * ar)) + 'px';
    }

    _resized() {
      const stored = this.id ? getSlot(this.id) : null;
      if (!stored || typeof stored.s !== 'string' || this.querySelector(':scope > img, :scope > picture')) return;
      const s = this._sizes(stored);
      if (this._img.getAttribute('sizes') !== s) this._img.setAttribute('sizes', s);
    }

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

      // Image pré-rendue (HTML du build) : on la laisse s'afficher, rien à charger.
      if (this.querySelector(':scope > img, :scope > picture')) {
        this._img.style.display = 'none';
        this._empty.style.display = 'none';
        this.setAttribute('data-filled', '');
        return;
      }

      const stored = this.id ? getSlot(this.id) : null;
      const url = (stored && stored.u) || this.getAttribute('src') || '';
      const shown = mediaMatches(this.getAttribute('media'), this._subFn);

      if (url && !shown && !this._img.getAttribute('src')) {
        // hors de sa condition media (et jamais chargée) : rien à télécharger
        this._img.style.display = 'none';
        this._empty.style.display = 'none';
        this.setAttribute('data-filled', '');
      } else if (url) {
        this._img.alt = this.getAttribute('alt') || this.getAttribute('placeholder') || '';
        this._img.setAttribute('loading', this.getAttribute('loading') || 'lazy');
        const fp = this.getAttribute('fetchpriority');
        if (fp) this._img.setAttribute('fetchpriority', fp);
        else this._img.removeAttribute('fetchpriority');
        this._img.setAttribute('decoding', fp === 'high' ? 'sync' : 'async');
        // Versions réduites (images/w/, scripts/gen-variants.mjs) : le navigateur prend la plus petite
        // qui suffit au cadre. sizes : même règle que le build (seo-sync.mjs), pour retomber sur la
        // version déjà chargée par l'image du HTML. src reste l'original (agrandissement, kc-lightbox).
        // (dans .image-slots.state.json, « s » est un ancien réglage d'échelle, un nombre : ce n'est un srcset
        // que dans la correspondance #kc-slots écrite par le build)
        const set = stored && typeof stored.s === 'string' ? stored.s : null;
        if (set) {
          this._img.setAttribute('sizes', this._sizes(stored));
          if (this._img.getAttribute('srcset') !== set) this._img.setAttribute('srcset', set);
          if (!this.getAttribute('sizes') && (this.getAttribute('loading') || 'lazy') === 'lazy') sizeWatch(this);
        } else {
          this._img.removeAttribute('srcset');
          this._img.removeAttribute('sizes');
        }
        if (this._img.getAttribute('src') !== url) this._img.src = url;
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
(()=>{const{useState,useEffect,useRef}=React,PALETTES={"Noir chaud":["#141210","#b9926b","#f8f5ef"],"Noir profond":["#0f0e0d","#9a8f7e","#efe9df"],Anthracite:["#16181a","#8a97a0","#eef0f1"],"Ardoise cuivre":["#12100f","#a9744f","#f3ede4"]},PALETTE_OPTS=Object.values(PALETTES),HEAD_FONTS={Cinzel:'"Cinzel", Georgia, serif',Cormorant:'"Cormorant Garamond", Georgia, serif'},BODY_FONTS={Jost:'"Jost", system-ui, sans-serif',Mulish:'"Mulish", system-ui, sans-serif'},TWEAK_DEFAULTS={palette:["#141210","#b9926b","#f8f5ef"],heading:"Cinzel",body:"Jost",heroVariant:"a",prestaLayout:"grille",aboutLayout:"split"},LIFESTYLE_SUB=[{slug:"solo",title:"Solo",href:"solo.html"},{slug:"couple",title:"Couple",href:"couple.html"},{slug:"famille",title:"Famille",href:"famille.html"}],PRESTATIONS=[{n:"01",title:"Mariages",id:"presta-mariage",href:"mariages.html",img:"Photo de groupe d'un mariage au bord du L\xE9man",text:"De la promesse \xE9chang\xE9e aux derniers pas de danse \u2014 une narration sensible et discr\xE8te de votre journ\xE9e, au plus pr\xE8s de l'\xE9motion, sans mise en sc\xE8ne inutile."},{n:"02",title:"Lifestyle",id:"presta-portrait",href:"portraits.html",img:"S\xE9ance lifestyle \u2014 portrait en lumi\xE8re naturelle, Suisse romande",text:"Seul, \xE0 deux ou en famille : des images vraies, en lumi\xE8re naturelle, dans un lieu qui vous ressemble."},{n:"03",title:"Studio",id:"presta-studio",href:"studio.html",img:"Portrait en studio sur fond sombre",text:"Portraits \xE9ditoriaux en studio. Lumi\xE8re ma\xEEtris\xE9e, direction soign\xE9e et tirages d'exception pour une pr\xE9sence qui marque."},{n:"04",title:"Maternit\xE9 & Grossesse",short:"Maternit\xE9",id:"presta-maternite",href:"maternite-grossesse.html",img:"S\xE9ance grossesse en lumi\xE8re naturelle, champ de bl\xE9",text:"La douceur de l'attente, saisie en studio ou en lumi\xE8re naturelle. Des images intemporelles, dans l'intimit\xE9 et le calme du moment."}],WHATSAPP="https://wa.me/41798507603?text="+encodeURIComponent("Bonjour Kevin, je vous \xE9cris depuis le site Afterglow au sujet d'une s\xE9ance photo : ");function Slot({id,ph,alt,style,loading,fetchpriority,media}){return React.createElement("image-slot",{id,shape:"rect",fit:"cover",placeholder:ph,alt:alt||ph,"aria-label":alt||ph,role:"img",style,loading,fetchpriority,media})}function Overline({children,className=""}){return React.createElement("div",{className:"overline "+className},React.createElement("span",{className:"tick"}),children)}function Nav(){const[scrolled,setScrolled]=useState(!1),[open,setOpen]=useState(!1);useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>40);return onScroll(),window.addEventListener("scroll",onScroll,{passive:!0}),()=>window.removeEventListener("scroll",onScroll)},[]),useEffect(()=>(document.body.style.overflow=open?"hidden":"",()=>{document.body.style.overflow=""}),[open]);const menu=ReactDOM.createPortal(React.createElement("div",{className:"mobile-menu"+(open?" is-open":""),onClick:()=>setOpen(!1)},React.createElement("div",{className:"mm-inner",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"mm-group"},React.createElement("span",{className:"mm-label"},"Prestations"),PRESTATIONS.map(p=>[React.createElement("a",{key:p.id,href:p.href,onClick:()=>setOpen(!1)},p.title),...p.id==="presta-portrait"?LIFESTYLE_SUB.map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"mm-sub",onClick:()=>setOpen(!1)},c.title)):[]]),React.createElement("a",{href:"bon-cadeau.html",onClick:()=>setOpen(!1)},"Bon cadeau")),React.createElement("a",{className:"mm-top",href:"portfolio.html",onClick:()=>setOpen(!1)},"Portfolio"),React.createElement("a",{className:"mm-top",href:"tarifs.html",onClick:()=>setOpen(!1)},"Tarifs"),React.createElement("a",{className:"mm-top",href:"journal.html",onClick:()=>setOpen(!1)},"Journal"),React.createElement("a",{className:"mm-top",href:"apropos.html",onClick:()=>setOpen(!1)},"\xC0 propos"),React.createElement("a",{className:"mm-top",href:"#contact",onClick:()=>setOpen(!1)},"Contact"))),document.body);return React.createElement(React.Fragment,null,React.createElement("nav",{className:"nav"+(scrolled?" scrolled":"")+(open?" menu-open":"")},React.createElement("a",{href:"#hero",className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"nav-links"},React.createElement("div",{className:"nav-item nav-extra"},React.createElement("a",{href:PRESTATIONS[0].href,"aria-haspopup":"true"},"Prestations",React.createElement("span",{className:"caret"},"\u25BE")),React.createElement("div",{className:"nav-drop"},PRESTATIONS.map(p=>[React.createElement("a",{key:p.id,href:p.href},p.title),...p.id==="presta-portrait"?LIFESTYLE_SUB.map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"nd-sub"},c.title)):[]]),React.createElement("a",{href:"bon-cadeau.html",className:"nd-gift"},"Bon cadeau"))),React.createElement("a",{href:"portfolio.html",className:"nav-extra"},"Portfolio"),React.createElement("a",{href:"tarifs.html",className:"nav-extra"},"Tarifs"),React.createElement("a",{href:"journal.html",className:"nav-extra"},"Journal"),React.createElement("a",{href:"apropos.html",className:"nav-extra"},"\xC0 propos"),React.createElement("a",{href:"#contact",className:"nav-cta"},"Contact")),React.createElement("button",{className:"nav-burger","aria-label":"Ouvrir le menu","aria-expanded":open,onClick:()=>setOpen(o=>!o)},React.createElement("span",null),React.createElement("span",null))),menu)}const HOME_HERO={over:"Photographe en Suisse romande",title:"Afterglow",by:"by Kevin Chinelli",tag:"L'\xE9motion d'un instant, et la lumi\xE8re qui s'attarde."};function HeroCtas({light}){return React.createElement("div",{className:"hh-ctas reveal in d3"},React.createElement("a",{className:"hh-btn"+(light?" on-img":""),href:"contact.html"},"R\xE9server une date ",React.createElement("span",{className:"ar"},"\u2192")),React.createElement("a",{className:"hh-link",href:"portfolio.html"},"Voir le portfolio"))}function HomeHero({variant="a"}){const H=HOME_HERO;return variant==="b"?React.createElement("section",{id:"hero",className:"hhero vb"},React.createElement("div",{className:"hh-text"},React.createElement("h1",{className:"hh-h1"},React.createElement("span",{className:"overline hh-over reveal in"},H.over),React.createElement("span",{className:"hh-title reveal in d1"},H.title)),React.createElement("div",{className:"hh-by reveal in d1"},H.by),React.createElement("p",{className:"hh-tag reveal in d2"},H.tag),React.createElement(HeroCtas,null),React.createElement("div",{className:"hh-meta reveal in d3"},"Mariage \xB7 Couple \xB7 Studio \xB7 Maternit\xE9")),React.createElement("div",{className:"hh-img"},React.createElement(Slot,{id:"home-hero-split",ph:"Image hero \u2014 portrait vertical",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}}))):variant==="c"?React.createElement("section",{id:"hero",className:"hhero vc"},React.createElement("div",{className:"hh-inner"},React.createElement("div",{className:"hh-kicker reveal in"},H.title," \u2014 ",H.by),React.createElement("h1",{className:"hh-statement reveal in d1"},"L'\xE9motion d'un instant,",React.createElement("br",null),React.createElement("em",null,"et la lumi\xE8re qui s'attarde.")),React.createElement(HeroCtas,null)),React.createElement("div",{className:"hh-strip reveal in d2"},React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"home-hero-strip-1",ph:"S\xE9lection \u2014 1",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"home-hero-strip-2",ph:"S\xE9lection \u2014 2",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"home-hero-strip-3",ph:"S\xE9lection \u2014 3",style:{width:"100%",height:"100%"}})))):React.createElement("section",{id:"hero",className:"hhero va"},React.createElement("div",{className:"hh-bg"},React.createElement(Slot,{id:"home-hero-full",ph:"Image hero \u2014 pleine page",alt:"Une maman et son nouveau-n\xE9 dans un pr\xE9, au soleil couchant \u2014 Kevin Chinelli, photographe en Suisse romande",loading:"eager",fetchpriority:"high",media:"(min-width:601px)",style:{width:"100%",height:"100%"}}),React.createElement(Slot,{id:"home-hero-mobile",ph:"Image hero \u2014 portrait mobile",alt:"Portrait en lumi\xE8re d'automne, en for\xEAt \u2014 Kevin Chinelli, photographe en Suisse romande",loading:"eager",fetchpriority:"high",media:"(max-width:600px)",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"scrim"}),React.createElement("div",{className:"hh-inner"},React.createElement("h1",{className:"hh-h1"},React.createElement("span",{className:"overline hh-over reveal in"},H.over),React.createElement("span",{className:"hh-title reveal in d1"},H.title)),React.createElement("div",{className:"hh-by reveal in d1"},H.by),React.createElement("p",{className:"hh-tag reveal in d2"},H.tag),React.createElement(HeroCtas,{light:!0}),React.createElement("div",{className:"hh-meta on-img reveal in d3"},"Mariage \xB7 Couple \xB7 Famille \xB7 Studio \xB7 Maternit\xE9")),React.createElement("div",{className:"hh-scroll reveal in d3"},React.createElement("svg",{viewBox:"0 0 14 52",fill:"none",stroke:"currentColor",strokeWidth:"0.9",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},React.createElement("line",{x1:"7",y1:"1",x2:"7",y2:"41"}),React.createElement("polyline",{points:"1 35 7 41 13 35"}))))}const ABOUT_INTRO="Depuis une dizaine d'ann\xE9es que je travaille \xE0 travers l'image, j'ai appris une chose : les moments qui comptent ne se mettent pas en sc\xE8ne. Mon travail, c'est d'\xEAtre l\xE0 \u2014 attentif, discret, \xE0 l'\xE9coute \u2014 au moment exact o\xF9 quelque chose de vrai se passe.";function About(){return React.createElement("section",{id:"about",className:"sec s-light pad-y about-ed"},React.createElement("div",{className:"wrap about-ed-grid"},React.createElement("div",{className:"about-ed-text"},React.createElement(Overline,{className:"reveal"},"Photographe \xB7 Suisse romande"),React.createElement("h2",{className:"display about-ed-hdl reveal d1"},"Pour les moments qui m\xE9ritent de rester."),React.createElement("p",{className:"about-ed-intro reveal d1"},"Des mariages aux portraits de famille, je travaille au plus pr\xE8s de ce qui se passe vraiment \u2014 avec discr\xE9tion, patience, et le regard de quelqu'un qui cherche l'\xE9motion juste plut\xF4t que la belle image convenue."),React.createElement("hr",{className:"hair about-ed-rule reveal d2"}),React.createElement("p",{className:"about-ed-name reveal d2"},"Kevin Chinelli"),React.createElement("p",{className:"reveal d2"},ABOUT_INTRO),React.createElement("a",{href:"apropos.html",className:"link-arrow reveal d3"},"En savoir plus ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("div",{className:"about-ed-photo reveal d2"},React.createElement("figure",{className:"about-ed-frame"},React.createElement(Slot,{id:"about-photo",ph:"Kevin Chinelli \u2014 photographe en Suisse romande",alt:"Kevin Chinelli, photographe en Suisse romande",loading:"lazy",style:{width:"100%",height:"100%"}})))))}function PrestationsBandes(){return React.createElement("div",null,PRESTATIONS.map((p,i)=>React.createElement("div",{key:p.id,className:"band reveal "+(i%2===1?"flip":"")},React.createElement("div",{className:"band-img"},React.createElement(Slot,{id:p.id,ph:p.img,style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"band-txt"},React.createElement("div",{className:"num"},p.n),React.createElement("h3",null,p.title),React.createElement("p",null,p.text),React.createElement("a",{href:p.href,className:"link-arrow",style:{marginTop:"6px"}},"D\xE9couvrir ",React.createElement("span",{className:"ar"},"\u2192"))))))}function PrestationsGrille(){return React.createElement("div",{className:"wrap",style:{paddingBottom:"clamp(90px,12vw,170px)"}},React.createElement("div",{className:"svc-grid"},PRESTATIONS.map(p=>React.createElement("a",{key:p.id,href:p.href,className:"svc-card reveal"},React.createElement(Slot,{id:p.id,ph:p.img,style:{width:"100%",height:"100%"}}),React.createElement("div",{className:"veil"}),React.createElement("div",{className:"svc-body"},React.createElement("div",{className:"num"},p.n),React.createElement("h3",null,p.title),React.createElement("span",{className:"link-arrow"},"D\xE9couvrir ",React.createElement("span",{className:"ar"},"\u2192")))))))}function Prestations({layout}){return React.createElement("section",{id:"prestations",className:"sec s-dark"},React.createElement("div",{className:"wrap",style:{paddingTop:"clamp(90px,12vw,150px)",paddingBottom:"clamp(50px,6vw,80px)",textAlign:"center"}},React.createElement(Overline,{className:"reveal"},"Prestations"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(30px,4vw,56px)",marginTop:"22px"}},"\xC0 chaque histoire, son \xE9criture.")),React.createElement(layout==="grille"?PrestationsGrille:PrestationsBandes,null))}function Gallery(){return React.createElement("section",{id:"portfolio",className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{style:{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:"clamp(34px,4vw,60px)",flexWrap:"wrap",gap:"20px"}},React.createElement("div",null,React.createElement(Overline,{className:"reveal"},"Travaux choisis"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(28px,3.4vw,48px)",marginTop:"18px"}},"Une s\xE9lection.")),React.createElement("a",{href:"portfolio.html",className:"link-arrow reveal d1"},"Voir le portfolio ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("div",{className:"gal-mosaic reveal d1","data-lb-group":"portfolio"},React.createElement("div",{className:"gm-cell gm-p3"},React.createElement(Slot,{id:"home-p3",ph:"Portrait lifestyle en ext\xE9rieur, chapeau et fleurs",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-m5"},React.createElement(Slot,{id:"home-m5",ph:"Mariage \u2014 la mari\xE9e et deux enfants d'honneur",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-m6"},React.createElement(Slot,{id:"home-m6",ph:"Mariage \u2014 la mari\xE9e et son bouquet",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-g5"},React.createElement(Slot,{id:"home-g5",ph:"S\xE9ance grossesse \xE0 contre-jour",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-p5"},React.createElement(Slot,{id:"home-p5",ph:"Portrait lifestyle au bord du L\xE9man",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-m8"},React.createElement(Slot,{id:"home-m8",ph:"Mariage \u2014 d\xE9tail des fleurs",style:{width:"100%",height:"100%"}})))))}const PROCESS=[{n:"01",title:"On se parle",text:"Un \xE9change sans engagement pour comprendre votre projet, vos envies, et trouver ensemble la date id\xE9ale."},{n:"02",title:"La s\xE9ance",text:"Je vous guide avec discr\xE9tion. Pas de poses fig\xE9es \u2014 juste la lumi\xE8re, le moment, ce qui se passe naturellement."},{n:"03",title:"La s\xE9lection",text:"Je prends le temps de s\xE9lectionner et retoucher chaque image avec soin. Votre galerie est pr\xEAte sous trois semaines."},{n:"04",title:"La livraison",text:"Vos photos en haute r\xE9solution, dans une galerie priv\xE9e en ligne. Des souvenirs pour toujours."}];function Process(){return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},"Comment \xE7a se passe"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(28px,3.4vw,48px)",marginTop:"18px",marginBottom:"clamp(50px,7vw,90px)"}},"De la prise de contact",React.createElement("br",null),"\xE0 vos souvenirs."),React.createElement("div",{className:"process-grid"},PROCESS.map((s,i)=>React.createElement("div",{key:s.n,className:"process-step reveal d"+(i+1)},React.createElement("div",{className:"process-num"},s.n),React.createElement("h3",{className:"process-title"},s.title),React.createElement("p",{className:"process-text"},s.text))))))}function Contact(){const[sent,setSent]=useState(!1),[err,setErr]=useState({}),[sending,setSending]=useState(!1),[sendError,setSendError]=useState("");return React.createElement("section",{id:"contact",className:"sec s-darker contact"},React.createElement("div",{className:"wrap pad-y"},React.createElement("div",{className:"grid",style:{textAlign:"center"}},React.createElement("div",null,React.createElement(Overline,{className:"reveal"},"Parlons de votre projet"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(34px,5.4vw,70px)",marginTop:"22px"}},"R\xE9servez votre date.")),sent?React.createElement("div",{className:"form-sent reveal d2"},React.createElement("div",{className:"fs-mark"},"\u2713"),React.createElement("h3",null,"Merci, votre demande est bien partie."),React.createElement("p",null,"Je l'ai bien re\xE7ue et je vous r\xE9ponds personnellement sous 48\xA0h ouvr\xE9es. \xC0 tr\xE8s vite\xA0!"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch",className:"link-arrow"},"contact@afterglowbykevin.ch ",React.createElement("span",{className:"ar"},"\u2192"))):React.createElement("form",{className:"form reveal d2",noValidate:!0,onSubmit:async e=>{e.preventDefault();const f=e.target,data={nom:f.nom.value.trim(),email:f.email.value.trim(),type:f.type.value,message:f.message.value.trim()},errs={};if(data.nom||(errs.nom="Indiquez votre nom."),/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)||(errs.email="Adresse email invalide."),data.message||(errs.message="\xC9crivez quelques mots sur votre projet."),setErr(errs),!Object.keys(errs).length){setSending(!0),setSendError("");try{const res=await fetch("contact.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}),j=await res.json().catch(()=>({}));res.ok&&j&&j.ok?(setSent(!0),window.umami&&window.umami.track("demande-envoyee",{type:data.type||"non pr\xE9cis\xE9",page:"accueil"})):res.status===429?setSendError("Trop d'envois en peu de temps. Patientez quelques minutes, puis r\xE9essayez."):setSendError("Une erreur est survenue \xE0 l'envoi. R\xE9essayez, ou \xE9crivez-moi directement \xE0 contact@afterglowbykevin.ch.")}catch{setSendError("Connexion impossible. V\xE9rifiez votre r\xE9seau, ou \xE9crivez-moi \xE0 contact@afterglowbykevin.ch.")}finally{setSending(!1)}}}},React.createElement("div",{className:"field-row"},React.createElement("div",{className:"field"+(err.nom?" error":"")},React.createElement("label",{htmlFor:"hc-nom"},"Nom"),React.createElement("input",{className:"control",id:"hc-nom",name:"nom",type:"text",placeholder:"Votre nom",autoComplete:"name"}),err.nom&&React.createElement("span",{className:"field-err"},err.nom)),React.createElement("div",{className:"field"+(err.email?" error":"")},React.createElement("label",{htmlFor:"hc-email"},"Email"),React.createElement("input",{className:"control",id:"hc-email",name:"email",type:"email",placeholder:"vous@email.com",autoComplete:"email"}),err.email&&React.createElement("span",{className:"field-err"},err.email))),React.createElement("div",{className:"field"},React.createElement("label",{htmlFor:"hc-type"},"Type de shooting"),React.createElement("select",{className:"control",id:"hc-type",name:"type",defaultValue:""},React.createElement("option",{value:"",disabled:!0},"S\xE9lectionner"),PRESTATIONS.map(p=>React.createElement("option",{key:p.id,value:p.title},p.title)),React.createElement("option",{value:"autre"},"Autre"))),React.createElement("div",{className:"field"+(err.message?" error":"")},React.createElement("label",{htmlFor:"hc-message"},"Message"),React.createElement("textarea",{className:"control",id:"hc-message",name:"message",rows:"4",placeholder:"Parlez-moi de votre projet, de la date envisag\xE9e\u2026"}),err.message&&React.createElement("span",{className:"field-err"},err.message)),sendError&&React.createElement("span",{className:"field-err",style:{display:"block",marginBottom:"12px"}},sendError),React.createElement("button",{className:"btn-submit",type:"submit",disabled:sending},sending?"Envoi\u2026":"Envoyer"," ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("div",{className:"contact-direct reveal d3"},React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch","data-umami-event":"email"},"contact@afterglowbykevin.ch")))))}function Footer(){return React.createElement("footer",{className:"s-dark",style:{borderTop:"1px solid var(--line-d)"}},React.createElement("div",{className:"footer"},React.createElement("div",{className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"copy"},"\xA9 2026 \u2014 Tous droits r\xE9serv\xE9s \xB7 Site cr\xE9\xE9 par ",React.createElement("a",{href:"https://snapshotmedia.ch",target:"_blank",rel:"noopener"},"Snapshot Media")),React.createElement("div",{className:"social"},React.createElement("a",{href:"apropos.html"},"\xC0 propos"),React.createElement("a",{href:"bon-cadeau.html"},"Bon cadeau"),React.createElement("a",{href:"confidentialite.html"},"Confidentialit\xE9"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener","data-umami-event":"instagram"},"Instagram"),React.createElement("a",{href:"https://g.page/r/Ccd14Q8WzKZuEBM",target:"_blank",rel:"noopener","data-umami-event":"fiche-google"},"Google"),React.createElement("a",{href:WHATSAPP,target:"_blank",rel:"noopener","data-umami-event":"whatsapp"},"WhatsApp"),React.createElement("a",{href:"tel:+41798507603","data-umami-event":"telephone"},"+41 79 850 76 03"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch","data-umami-event":"email"},"contact@afterglowbykevin.ch")),React.createElement("div",{className:"zones"},React.createElement("span",{className:"zones-label"},"Par r\xE9gion"),React.createElement("a",{href:"photographe-mariage-lausanne.html"},"Mariage \xE0 Lausanne"),React.createElement("a",{href:"photographe-mariage-geneve.html"},"Mariage \xE0 Gen\xE8ve"),React.createElement("a",{href:"photographe-mariage-montreux.html"},"Mariage \xE0 Montreux"),React.createElement("a",{href:"photographe-famille-lausanne.html"},"Famille \xE0 Lausanne"),React.createElement("a",{href:"photographe-famille-geneve.html"},"Famille \xE0 Gen\xE8ve"))))}function App(){const[t,setTweak]=useTweaks(TWEAK_DEFAULTS);return useEffect(()=>{const r=document.documentElement.style;Array.isArray(t.palette)&&(r.setProperty("--bg",t.palette[0]),r.setProperty("--accent",t.palette[1]),r.setProperty("--cream",t.palette[2])),r.setProperty("--font-display",HEAD_FONTS[t.heading]||HEAD_FONTS.Cinzel),r.setProperty("--font-body",BODY_FONTS[t.body]||BODY_FONTS.Jost)},[t.palette,t.heading,t.body]),useEffect(()=>{function ease(t2){return t2<.5?4*t2*t2*t2:(t2-1)*(2*t2-2)*(2*t2-2)+1}function smoothTo(target,dur){const start=window.scrollY,dist=target-start;let t0=null;document.documentElement.style.scrollBehavior="auto";function step(now){t0||(t0=now);const p=Math.min((now-t0)/dur,1);window.scrollTo(0,start+dist*ease(p)),p<1?requestAnimationFrame(step):document.documentElement.style.scrollBehavior=""}requestAnimationFrame(step)}function onClick(e){const a=e.target.closest('a[href^="#"]');if(!a)return;const id=a.getAttribute("href").slice(1),el=id?document.getElementById(id):null;if(id&&!el)return;e.preventDefault(),window._stopInertia&&window._stopInertia();const y=el?el.getBoundingClientRect().top+window.scrollY:0;smoothTo(y,900)}return document.addEventListener("click",onClick),()=>document.removeEventListener("click",onClick)},[]),useEffect(()=>{const reveal=()=>{const vh=window.innerHeight;document.querySelectorAll(".reveal:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();r.top<vh*.88&&r.bottom>0&&el.classList.add("in")})};reveal(),window.addEventListener("scroll",reveal,{passive:!0}),window.addEventListener("resize",reveal);const id=setTimeout(reveal,200);return()=>{window.removeEventListener("scroll",reveal),window.removeEventListener("resize",reveal),clearTimeout(id)}},[t.prestaLayout,t.aboutLayout,t.heroVariant]),React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,null),React.createElement("main",null,React.createElement(HomeHero,{variant:t.heroVariant}),React.createElement(About,null),React.createElement(Prestations,{layout:t.prestaLayout}),React.createElement(Gallery,null),React.createElement(Process,null),React.createElement(Contact,null)),React.createElement(Footer,null))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App,null));})();

;
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
   JS fade-out on internal navigation + fade-in of the next page
   (respects prefers-reduced-motion). Plain <script>, no dependencies.

   The fade-in only follows an internal link: the click leaves a
   timestamp in sessionStorage ("kc-fade"), and a tiny script at the
   top of every <head> (scripts/seo-sync.mjs, finishPage) adds
   html.kc-anim-pages BEFORE the first paint. A visitor arriving from
   Google sees the page at once: a body starting at opacity 0 hides
   every paint from Chrome's LCP (it measured nothing at all), and
   adding the class after the first paint made the page blink.
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

  // Fade out before following an internal link (the next page fades in, see above).
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
    try { sessionStorage.setItem("kc-fade", String(Date.now())); } catch (err) {}
    document.body.classList.add("is-leaving");
    setTimeout(function () { location.href = a.href; }, 300);
  });
})();
