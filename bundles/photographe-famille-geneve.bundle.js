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
      if (!stored || !stored.s || this.querySelector(':scope > img, :scope > picture')) return;
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
        const set = stored && stored.s;
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
(()=>{const{useState,useEffect,useRef}=React;(function(){try{var p=document.createElement("div");p.style.cssText="position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;transition:opacity .05s linear;pointer-events:none",document.documentElement.appendChild(p),requestAnimationFrame(function(){p.style.opacity="1"}),setTimeout(function(){var op=parseFloat(getComputedStyle(p).opacity);op>.9||document.documentElement.classList.add("no-anim"),p.remove()},220)}catch{}})();const KC={PALETTES:{"Noir chaud":["#141210","#b9926b","#f8f5ef"],"Noir profond":["#0f0e0d","#9a8f7e","#efe9df"],Anthracite:["#16181a","#8a97a0","#eef0f1"],"Ardoise cuivre":["#12100f","#a9744f","#f3ede4"]},HEAD_FONTS:{Cinzel:'"Cinzel", Georgia, serif',Cormorant:'"Cormorant Garamond", Georgia, serif'},BODY_FONTS:{Jost:'"Jost", system-ui, sans-serif',Mulish:'"Mulish", system-ui, sans-serif'},HOME:"/",WHATSAPP:"https://wa.me/41798507603?text="+encodeURIComponent("Bonjour Kevin, je vous \xE9cris depuis le site Afterglow au sujet d'une s\xE9ance photo : "),PRO_URL:"https://snapshotmedia.ch/services/photographie/portraits-professionnels/"},PALETTE_OPTS=Object.values(KC.PALETTES),PRESTA_NAV=[{slug:"mariage",title:"Mariages",short:"Mariages",href:"mariages.html"},{slug:"portrait",title:"Lifestyle",short:"Lifestyle",href:"portraits.html",children:[{slug:"solo",title:"Solo",href:"solo.html"},{slug:"couple",title:"Couple",href:"couple.html"},{slug:"famille",title:"Famille",href:"famille.html"}]},{slug:"studio",title:"Studio",short:"Studio",href:"studio.html"},{slug:"maternite",title:"Maternit\xE9 & Grossesse",short:"Maternit\xE9",href:"maternite-grossesse.html"}],PRESTA_PARENT={};PRESTA_NAV.forEach(p=>(p.children||[]).forEach(c=>{PRESTA_PARENT[c.slug]=p.slug}));function Slot({id,ph,alt,style,className,loading,fetchpriority,media}){return React.createElement("image-slot",{id,shape:"rect",fit:"cover",placeholder:ph,alt:alt||ph,"aria-label":alt||ph,role:"img",style,class:className,loading,fetchpriority,media})}function Overline({children,className=""}){return React.createElement("div",{className:"overline "+className},React.createElement("span",{className:"tick"}),children)}function Nav({active=""}){const[scrolled,setScrolled]=useState(!1),[open,setOpen]=useState(!1);useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>40);return onScroll(),window.addEventListener("scroll",onScroll,{passive:!0}),()=>window.removeEventListener("scroll",onScroll)},[]),useEffect(()=>(document.body.style.overflow=open?"hidden":"",()=>{document.body.style.overflow=""}),[open]);const menu=ReactDOM.createPortal(React.createElement("div",{className:"mobile-menu"+(open?" is-open":""),onClick:()=>setOpen(!1)},React.createElement("div",{className:"mm-inner",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"mm-group"},React.createElement("span",{className:"mm-label"},"Prestations"),PRESTA_NAV.map(p=>[React.createElement("a",{key:p.slug,href:p.href,onClick:()=>setOpen(!1)},p.title),...(p.children||[]).map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"mm-sub",onClick:()=>setOpen(!1)},c.title))]),React.createElement("a",{href:"bon-cadeau.html",onClick:()=>setOpen(!1)},"Bon cadeau")),React.createElement("a",{className:"mm-top",href:"portfolio.html",onClick:()=>setOpen(!1)},"Portfolio"),React.createElement("a",{className:"mm-top",href:"tarifs.html",onClick:()=>setOpen(!1)},"Tarifs"),React.createElement("a",{className:"mm-top",href:"journal.html",onClick:()=>setOpen(!1)},"Journal"),React.createElement("a",{className:"mm-top",href:"apropos.html",onClick:()=>setOpen(!1)},"\xC0 propos"),React.createElement("a",{className:"mm-top",href:"contact.html",onClick:()=>setOpen(!1)},"Contact"))),document.body);return React.createElement(React.Fragment,null,React.createElement("nav",{className:"nav"+(scrolled?" scrolled":"")+(open?" menu-open":"")},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"nav-links"},React.createElement("div",{className:"nav-item nav-extra"+(active==="cadeau"||PRESTA_NAV.some(p=>p.slug===active||p.slug===PRESTA_PARENT[active])?" is-active":"")},React.createElement("a",{href:PRESTA_NAV[0].href,"aria-haspopup":"true"},"Prestations",React.createElement("span",{className:"caret"},"\u25BE")),React.createElement("div",{className:"nav-drop"},PRESTA_NAV.map(p=>[React.createElement("a",{key:p.slug,href:p.href,className:active===p.slug?"is-active":""},p.title),...(p.children||[]).map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"nd-sub"+(active===c.slug?" is-active":"")},c.title))]),React.createElement("a",{href:"bon-cadeau.html",className:"nd-gift"+(active==="cadeau"?" is-active":"")},"Bon cadeau"))),React.createElement("a",{href:"portfolio.html",className:"nav-extra"+(active==="portfolio"?" is-active":"")},"Portfolio"),React.createElement("a",{href:"tarifs.html",className:"nav-extra"+(active==="tarifs"?" is-active":"")},"Tarifs"),React.createElement("a",{href:"journal.html",className:"nav-extra"+(active==="journal"?" is-active":"")},"Journal"),React.createElement("a",{href:"apropos.html",className:"nav-extra"+(active==="apropos"?" is-active":"")},"\xC0 propos"),React.createElement("a",{href:"contact.html",className:"nav-cta"+(active==="contact"?" is-active":"")},"Contact")),React.createElement("button",{className:"nav-burger","aria-label":"Ouvrir le menu","aria-expanded":open,onClick:()=>setOpen(o=>!o)},React.createElement("span",null),React.createElement("span",null))),menu)}function Footer(){return React.createElement("footer",{className:"s-dark",style:{borderTop:"1px solid var(--line-d)"}},React.createElement("div",{className:"footer"},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"copy"},"\xA9 2026 \u2014 Tous droits r\xE9serv\xE9s \xB7 Site cr\xE9\xE9 par ",React.createElement("a",{href:"https://snapshotmedia.ch",target:"_blank",rel:"noopener"},"Snapshot Media")),React.createElement(FooterLinks,null),React.createElement(FooterZones,null)))}const ZONES=[{label:"Mariage \xE0 Lausanne",href:"photographe-mariage-lausanne.html"},{label:"Mariage \xE0 Gen\xE8ve",href:"photographe-mariage-geneve.html"},{label:"Mariage \xE0 Montreux",href:"photographe-mariage-montreux.html"},{label:"Famille \xE0 Lausanne",href:"photographe-famille-lausanne.html"},{label:"Famille \xE0 Gen\xE8ve",href:"photographe-famille-geneve.html"}];function FooterZones(){return React.createElement("div",{className:"zones"},React.createElement("span",{className:"zones-label"},"Par r\xE9gion"),ZONES.map(z=>React.createElement("a",{key:z.href,href:z.href},z.label)))}function FooterLinks(){return React.createElement("div",{className:"social"},React.createElement("a",{href:"apropos.html"},"\xC0 propos"),React.createElement("a",{href:"bon-cadeau.html"},"Bon cadeau"),React.createElement("a",{href:"confidentialite.html"},"Confidentialit\xE9"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener","data-umami-event":"instagram"},"Instagram"),React.createElement("a",{href:"https://g.page/r/Ccd14Q8WzKZuEBM",target:"_blank",rel:"noopener","data-umami-event":"fiche-google"},"Google"),React.createElement("a",{href:KC.WHATSAPP,target:"_blank",rel:"noopener","data-umami-event":"whatsapp"},"WhatsApp"),React.createElement("a",{href:"tel:+41798507603","data-umami-event":"telephone"},"+41 79 850 76 03"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch","data-umami-event":"email"},"contact@afterglowbykevin.ch"))}function RelatedPresta({current}){const parentSlug=PRESTA_PARENT[current],parent=PRESTA_NAV.find(p=>p.slug===parentSlug),items=parent?[parent,...parent.children.filter(c=>c.slug!==current)].slice(0,3):PRESTA_NAV.filter(p=>p.slug!==current).slice(0,3);return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(32px,4vw,52px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"\xC0 d\xE9couvrir aussi"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"}},parent?"Les autres s\xE9ances lifestyle.":"Autres prestations.")),React.createElement("div",{className:"related-grid"},items.map((p,i)=>React.createElement("a",{key:p.slug,href:p.href,className:"related-card reveal d"+(i+1)},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"presta-"+p.slug,ph:p.title,alt:"Photographe "+p.title.toLowerCase()+" en Suisse romande \u2014 Kevin Chinelli",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,p.title),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192")))))))}function CtaContact({overline="Parlons de votre projet",title="R\xE9servez votre date.",href="contact.html",label="Me contacter"}){return React.createElement("section",{className:"sec s-darker cta-band"},React.createElement("div",{className:"wrap pad-y",style:{textAlign:"center"}},React.createElement(Overline,{className:"reveal"},overline),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(34px,5.4vw,72px)",margin:"22px 0 38px"}},title),React.createElement("a",{href,className:"link-arrow reveal d2",style:{fontSize:"14px"}},label," ",React.createElement("span",{className:"ar"},"\u2192"))))}function useReveal(deps=[]){useEffect(()=>{const reveal=()=>{const vh=window.innerHeight;document.querySelectorAll(".reveal:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();r.top<vh*.9&&r.bottom>0&&el.classList.add("in")})};reveal(),window.addEventListener("scroll",reveal,{passive:!0}),window.addEventListener("resize",reveal);const id=setTimeout(reveal,220);return()=>{window.removeEventListener("scroll",reveal),window.removeEventListener("resize",reveal),clearTimeout(id)}},deps)}function useApplyTweaks(t){useEffect(()=>{const r=document.documentElement.style;Array.isArray(t.palette)&&(r.setProperty("--bg",t.palette[0]),r.setProperty("--accent",t.palette[1]),r.setProperty("--cream",t.palette[2])),r.setProperty("--font-display",KC.HEAD_FONTS[t.heading]||KC.HEAD_FONTS.Cinzel),r.setProperty("--font-body",KC.BODY_FONTS[t.body]||KC.BODY_FONTS.Jost)},[t.palette,t.heading,t.body])}Object.assign(window,{KC,PALETTE_OPTS,PRESTA_NAV,PRESTA_PARENT,Slot,Overline,Nav,Footer,FooterLinks,CtaContact,RelatedPresta,useReveal,useApplyTweaks});})();

;
/* ============================================================
   KEVIN CHINELLI — Landing pages locales (SEO local par ville)
   window.KC_VILLE[slug]. Contenu unique et substantiel par ville
   (pas de pages "doorway"). Lu par kc-ville-app.jsx.
   ============================================================ */
window.KC_VILLE = {

  /* ===================== LAUSANNE ===================== */
  lausanne: {
    slug: "lausanne", ville: "Lausanne", region: "Vaud",
    h1: "Photographe de mariage à Lausanne",
    heroImg: "Couple de mariés sur les quais d'Ouchy à Lausanne, lac Léman",
    heroHint: "Reportage de mariage à Lausanne et sur les rives du Léman — discret, à hauteur d'émotion.",
    intro: {
      lead: "Se marier à Lausanne, c'est conjuguer la ville et le lac : une cathédrale gothique perchée sur la colline, les quais d'Ouchy ouverts sur le Léman, et la lumière changeante de la baie. Je connais cette ville et ses recoins, et je sais où la lumière sera la plus belle à chaque heure de votre journée.",
      paragraphs: [
        "Photographe basé en Suisse romande, je couvre les mariages à Lausanne sans frais de déplacement : de la préparation en centre-ville à la cérémonie civile à l'Hôtel de Ville de la place de la Palud, jusqu'à la réception sur les hauteurs ou au bord de l'eau. Mon approche reste la même partout — du reportage, peu de poses, beaucoup d'attention aux instants qui passent vite.",
        "Lausanne offre des décors variés à quelques minutes les uns des autres : on peut enchaîner une séance de couple devant la cathédrale, sur les escaliers du Marché, puis terminer à l'heure dorée sur les quais d'Ouchy ou dans les vignes de Lavaux toutes proches.",
      ],
      quote: "« La ville et le lac, dans une même journée. »",
    },
    lieux: {
      title: "Les plus beaux lieux de mariage à Lausanne",
      list: [
        "La cathédrale de Lausanne et l'esplanade de la Cité — vue plongeante sur les toits et le lac.",
        "Les quais d'Ouchy et le Beau-Rivage Palace — l'élégance au bord du Léman.",
        "L'Hôtel de Ville, place de la Palud — pour la cérémonie civile au cœur de la vieille ville.",
        "Les escaliers du Marché et la place de la Riponne — ambiance urbaine et intime.",
        "Le bois de Sauvabelin et son lac — un écrin de verdure à dix minutes du centre.",
        "Les vignes de Lavaux, à l'est de la ville — imbattables au coucher du soleil.",
      ],
    },
    faq: [
      { q: "Vous déplacez-vous gratuitement à Lausanne ?", a: "Oui, Lausanne est dans ma zone de couverture principale : aucun frais de déplacement. Je me déplace aussi librement dans tout le canton de Vaud, à Genève, Fribourg, Neuchâtel et en Valais romand." },
      { q: "Connaissez-vous les lieux de mariage lausannois ?", a: "Très bien — de la cathédrale aux quais d'Ouchy, en passant par l'Hôtel de Ville, Sauvabelin et les domaines de Lavaux. Au repérage, on cale ensemble le déroulé et les meilleurs spots selon l'heure et la lumière de votre date." },
      { q: "Peut-on faire les photos de couple sur les quais ?", a: "Absolument. Les quais d'Ouchy et le bord du Léman sont parfaits à l'heure dorée. Pour éviter la foule estivale, on privilégie le début de matinée ou la fin de journée." },
    ],
    related: [
      { article: "journal-lieux-mariage-vaud-leman.html", articleTitle: "Se marier dans le canton de Vaud : 10 lieux autour du Léman" },
      { article: "journal-lieux-mariage-lavaux.html", articleTitle: "Où se marier en Lavaux : 8 lieux face au Léman" },
      { article: "journal-spots-photo-couple-leman.html", articleTitle: "Spots photo de couple autour du Léman" },
    ],
  },

  /* ===================== GENÈVE ===================== */
  geneve: {
    slug: "geneve", ville: "Genève", region: "Genève",
    h1: "Photographe de mariage à Genève",
    heroImg: "Couple de mariés dans la vieille ville de Genève, ruelles pavées",
    heroHint: "Reportage de mariage à Genève, de la vieille ville aux rives du lac.",
    intro: {
      lead: "Genève marie l'élégance internationale et le charme d'une vieille ville médiévale. Entre la cathédrale Saint-Pierre, les ruelles de la Cité, les parcs au bord du lac et le jet d'eau, la ville offre des décors d'une grande variété pour un reportage de mariage.",
      paragraphs: [
        "Je photographie les mariages à Genève sans frais de déplacement depuis la Suisse romande. De la cérémonie civile à la Salle des mariages, à la réception dans un domaine de la campagne genevoise ou sur les bords du lac, je suis votre journée en reportage, discrètement, du premier regard au dernier éclat de rire.",
        "Genève est idéale pour varier les ambiances en peu de temps : on passe des marronniers de la promenade de la Treille aux quais et au jet d'eau, puis aux ruelles de la vieille ville pour des images plus intimes.",
      ],
      quote: "« Le raffinement d'une ville ouverte sur le monde. »",
    },
    lieux: {
      title: "Les plus beaux lieux de mariage à Genève",
      list: [
        "La vieille ville et la cathédrale Saint-Pierre — ruelles pavées et perspectives historiques.",
        "Le Parc des Bastions et la promenade de la Treille — marronniers et bancs romantiques.",
        "Les Bains des Pâquis — lumière du matin et vue sur le jet d'eau.",
        "Le Parc La Grange et ses roseraies — l'un des plus beaux jardins de la ville.",
        "Les quais et le jet d'eau — l'image emblématique de Genève.",
        "Les domaines viticoles de la campagne genevoise — pour une réception au vert.",
      ],
    },
    faq: [
      { q: "Intervenez-vous à Genève sans supplément ?", a: "Oui. Le déplacement pour un mariage à Genève est inclus dans la formule — il est chiffré au forfait dans le devis, sans mauvaise surprise. Je couvre l'ensemble de la Suisse romande : Vaud, Genève, Fribourg, Neuchâtel et le Valais romand." },
      { q: "Où faire les photos de couple à Genève ?", a: "La vieille ville et la cathédrale Saint-Pierre pour le cachet historique, le Parc des Bastions pour la verdure, et les quais ou les Bains des Pâquis pour le lac et le jet d'eau. On choisit selon votre déroulé et la lumière du jour." },
      { q: "Gérez-vous les cérémonies civiles à Genève ?", a: "Oui, j'ai l'habitude des salles des mariages et des contraintes de lumière en intérieur. On anticipe ensemble le timing pour ne rien manquer de l'échange des consentements." },
    ],
    related: [
      { article: "journal-ou-se-marier-geneve.html", articleTitle: "Où se marier à Genève : lieux et décors de rêve" },
      { article: "journal-lieux-mariage-la-cote.html", articleTitle: "Se marier sur La Côte : châteaux, vignes et bord du lac" },
      { article: "journal-spots-photo-couple-leman.html", articleTitle: "Spots photo de couple autour du Léman" },
    ],
  },

  /* ===================== MONTREUX ===================== */
  montreux: {
    slug: "montreux", ville: "Montreux", region: "Riviera vaudoise",
    h1: "Photographe de mariage à Montreux",
    heroImg: "Couple de mariés sur les quais fleuris de Montreux, château de Chillon",
    heroHint: "Reportage de mariage à Montreux et sur la Riviera, face aux Alpes et au Léman.",
    intro: {
      lead: "Montreux et la Riviera vaudoise offrent l'un des décors les plus spectaculaires de Suisse : les quais fleuris, le château de Chillon posé sur l'eau, les vignes de Lavaux à l'ouest et les Alpes en toile de fond. Un cadre de carte postale pour un mariage face au lac.",
      paragraphs: [
        "Je couvre les mariages à Montreux, Vevey, Clarens et sur toute la Riviera sans frais de déplacement. Reportage discret, séance de couple à l'heure dorée sur les quais ou au château de Chillon, et toute la souplesse pour s'adapter à la météo changeante du haut-lac.",
        "La Riviera permet des contrastes saisissants en peu de distance : la douceur méditerranéenne des quais et de leurs massifs fleuris, la pierre monumentale de Chillon, puis la hauteur et la fraîcheur des Rochers-de-Naye pour les plus aventureux.",
      ],
      quote: "« Le lac, les fleurs et les Alpes, réunis. »",
    },
    lieux: {
      title: "Les plus beaux lieux de mariage à Montreux et sur la Riviera",
      list: [
        "Le château de Chillon — décor monumental, posé sur le Léman.",
        "Les quais fleuris de Montreux — massifs colorés et Alpes en arrière-plan.",
        "Le Montreux Palace et les grands hôtels de la Belle Époque — élégance d'époque.",
        "Glion et les hauteurs de Caux — vue panoramique sur le haut-lac.",
        "Vevey, sa place du Marché et la Confrérie — charme d'une ville au bord de l'eau.",
        "Les vignes de Lavaux, en limite ouest — pour l'heure dorée dans les terrasses.",
      ],
    },
    faq: [
      { q: "Vous déplacez-vous à Montreux et sur la Riviera ?", a: "Oui. Le déplacement pour un mariage à Montreux, Vevey ou sur la Riviera est inclus dans la formule — chiffré au forfait dans le devis, sans surprise. Je couvre l'ensemble de la Suisse romande." },
      { q: "Peut-on faire des photos au château de Chillon ?", a: "Oui, les abords du château offrent un décor spectaculaire. L'accès aux intérieurs et certaines zones peut nécessiter une autorisation : on anticipe ce point ensemble lors de la préparation." },
      { q: "Quelle est la meilleure heure pour les quais de Montreux ?", a: "L'heure dorée, en fin de journée : la lumière chaude sublime les massifs fleuris et le lac, avec les Alpes qui rosissent en arrière-plan. Le matin tôt est aussi superbe et plus calme." },
    ],
    related: [
      { article: "journal-lieux-mariage-lavaux.html", articleTitle: "Où se marier en Lavaux : 8 lieux face au Léman" },
      { article: "journal-lieux-mariage-vaud-leman.html", articleTitle: "Se marier dans le canton de Vaud : 10 lieux autour du Léman" },
    ],
  },

  /* ===================== FAMILLE × LAUSANNE ===================== */
  "famille-lausanne": {
    slug: "famille-lausanne", ville: "Lausanne", region: "Vaud",
    presta: { slug: "famille", href: "famille.html", label: "famille", crumb: "Famille", card: "La prestation famille" },
    h1: "Photographe de famille à Lausanne",
    heroImg: "Famille complice sur les quais d'Ouchy à Lausanne, lumière dorée",
    heroHint: "Photographe de famille à Lausanne — des images vraies, au rythme des enfants.",
    intro: {
      lead: "Une séance photo de famille à Lausanne, c'est profiter d'une ville à taille humaine, ouverte sur le lac : des quais où les enfants courent, des parcs, et la lumière du Léman en toile de fond. Je capte votre tribu telle qu'elle est, complice et vivante.",
      paragraphs: [
        "Basé en Suisse romande, je me déplace à Lausanne sans frais : quais d'Ouchy, parcs de la ville, bois de Sauvabelin, ou directement chez vous pour des images intimes du quotidien. Pas de poses figées — on joue, on bouge, et je saisis les vrais moments.",
        "Lausanne permet de varier les ambiances en une seule séance : la verdure d'un parc, les galets du bord du lac, puis une glace partagée à l'heure dorée. La séance s'adapte à l'âge des enfants et à leur énergie du jour.",
      ],
      quote: "« Les enfants grandissent vite — gardons-en la trace, ici, maintenant. »",
    },
    lieux: {
      title: "Mes lieux préférés pour une séance famille à Lausanne",
      list: [
        "Les quais d'Ouchy et le parc du Denantou — espace, lac et lumière douce.",
        "Le bois de Sauvabelin et son lac — nature et liberté à dix minutes du centre.",
        "Le parc de Mon-Repos — allées arborées et cadre paisible.",
        "Les hauteurs et vignes de Lavaux, tout proches — pour l'heure dorée.",
        "À domicile, dans votre quotidien — le matin du week-end, en pyjama, est souvent parfait.",
      ],
    },
    faq: [
      { q: "Vous déplacez-vous gratuitement à Lausanne pour une séance famille ?", a: "Oui, Lausanne est dans ma zone de couverture principale : aucun frais de déplacement. Je me déplace aussi dans tout le canton de Vaud, à Genève, Fribourg, Neuchâtel et en Valais romand." },
      { q: "Où faire les photos de famille à Lausanne ?", a: "En extérieur — quais d'Ouchy, Sauvabelin, parc de Mon-Repos, vignes de Lavaux — ou à votre domicile pour des images du quotidien. On choisit selon l'âge des enfants et l'ambiance que vous aimez." },
      { q: "Quel est le meilleur moment pour une séance avec des enfants ?", a: "En fin d'après-midi pour la belle lumière, mais surtout au moment où les enfants sont le plus disponibles (après la sieste, après le goûter). On s'adapte à leur rythme — c'est la clé de photos réussies." },
    ],
    related: [
      { article: "journal-spots-seance-photo-lausanne.html", articleTitle: "Les plus beaux endroits pour une séance photo à Lausanne" },
      { article: "journal-quelle-tenue-seance-portrait.html", articleTitle: "Quelle tenue porter pour une séance portrait ?" },
    ],
  },

  /* ===================== FAMILLE × GENÈVE ===================== */
  "famille-geneve": {
    slug: "famille-geneve", ville: "Genève", region: "Genève",
    presta: { slug: "famille", href: "famille.html", label: "famille", crumb: "Famille", card: "La prestation famille" },
    h1: "Photographe de famille à Genève",
    heroImg: "Famille complice dans un parc de Genève, lumière naturelle",
    heroHint: "Photographe de famille à Genève — des images vraies, sans poses figées.",
    intro: {
      lead: "Une séance photo de famille à Genève profite de parcs magnifiques et des rives du lac : de la verdure, de l'espace pour courir, et le jet d'eau en arrière-plan. Mon approche reste la même — capter les fous rires et la complicité, pas la pose parfaite.",
      paragraphs: [
        "Je photographie les familles à Genève sans frais de déplacement depuis la Suisse romande. Parc des Bastions, Parc La Grange, bords du lac, ou votre intérieur : on choisit le cadre qui vous ressemble et qui laisse les enfants être eux-mêmes.",
        "Genève offre de superbes décors verdoyants à deux pas du centre, parfaits pour une séance vivante où l'on marche, on joue et on se câline. La durée et le déroulé s'ajustent à l'âge des plus petits.",
      ],
      quote: "« Une famille, c'est une histoire qu'on n'a jamais fini de photographier. »",
    },
    lieux: {
      title: "Mes lieux préférés pour une séance famille à Genève",
      list: [
        "Le Parc La Grange et ses roseraies — l'un des plus beaux jardins de la ville.",
        "Le Parc des Bastions — marronniers, allées et grand échiquier qui amuse les enfants.",
        "Les bords du lac et les Bains des Pâquis — lumière du matin et vue sur le jet d'eau.",
        "La vieille ville et la promenade de la Treille — pour une touche plus urbaine.",
        "À domicile — pour des images tendres du quotidien familial.",
      ],
    },
    faq: [
      { q: "Intervenez-vous à Genève sans supplément pour une séance famille ?", a: "Oui, Genève fait partie de ma zone de couverture en Suisse romande : pas de frais de déplacement. Je rayonne aussi sur Vaud, Fribourg, Neuchâtel et le Valais romand." },
      { q: "Quels lieux pour une séance famille à Genève ?", a: "Le Parc La Grange et le Parc des Bastions pour la verdure, les bords du lac pour la lumière et le jet d'eau, ou votre domicile. On choisit selon l'âge des enfants et l'ambiance souhaitée." },
      { q: "Comment ça se passe avec de jeunes enfants ?", a: "Tout en souplesse : on joue, on bouge, on fait des pauses si besoin. Je ne cherche jamais à les figer — les enfants spontanés donnent les plus belles images." },
    ],
    related: [
      { article: "journal-quelle-tenue-seance-portrait.html", articleTitle: "Quelle tenue porter pour une séance portrait ?" },
      { article: "journal-portrait-studio-ou-exterieur.html", articleTitle: "Portrait en studio ou en extérieur : lequel choisir ?" },
    ],
  },
};

;
(()=>{const V=window.KC_VILLE[window.KC_VILLE_SLUG],VP=V.presta||{slug:"mariage",href:"mariages.html",label:"mariage",crumb:"Mariages",card:"La prestation mariage"},VLOCAL=VP.label.charAt(0).toUpperCase()+VP.label.slice(1)+" \xE0 "+V.ville;function VilleReassure(){const points=["D\xE9placement inclus \xE0 "+V.ville,"R\xE9ponse sous 48 h"];return VP.slug==="mariage"&&points.push("1 seul mariage par jour"),points.push("Tarifs transparents"),React.createElement("section",{className:"reassure s-dark","aria-label":"Engagements"},React.createElement("div",{className:"wrap reassure-row"},points.map((p,i)=>React.createElement("div",{key:i,className:"reassure-item"},React.createElement("span",{className:"rdot"}),p))))}function VillesSoeurs(){const others=Object.values(window.KC_VILLE).filter(o=>o.slug!==V.slug&&(o.presta||{slug:"mariage"}).slug===VP.slug);if(others.length===0)return null;const Cap=VP.label.charAt(0).toUpperCase()+VP.label.slice(1);return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap",style:{textAlign:"center"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Par r\xE9gion"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",margin:"18px 0 clamp(28px,3.5vw,44px)"}},"Je me d\xE9place aussi ailleurs."),React.createElement("div",{className:"villes-row reveal d1"},others.map(o=>React.createElement("a",{key:o.slug,href:"photographe-"+(o.presta?o.slug:"mariage-"+o.slug)+".html",className:"ville-chip"},Cap," \xE0 ",o.ville," ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("a",{href:VP.href,className:"ville-chip"},"Partout en Suisse romande ",React.createElement("span",{className:"ar"},"\u2192")))))}function VilleApp(){const[t,setTweak]=useTweaks({palette:KC.PALETTES["Noir chaud"],heading:"Cinzel",body:"Jost"});return useApplyTweaks(t),useReveal([]),React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,{active:VP.slug}),React.createElement("main",null,React.createElement("section",{className:"phero bas"},React.createElement("div",{className:"bg"},React.createElement(Slot,{id:"ville-hero-"+V.slug,ph:V.heroImg,alt:V.h1+" \u2014 Kevin Chinelli, photographe en Suisse romande",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"scrim"}),React.createElement("div",{className:"phero-content"},React.createElement("div",{className:"crumb reveal in"},React.createElement("a",{href:KC.HOME},"Accueil"),React.createElement("span",null,"/"),React.createElement("a",{href:VP.href},VP.crumb),React.createElement("span",null,"/"),React.createElement("span",null,V.ville)),React.createElement("h1",{className:"reveal in d1"},V.h1),React.createElement("p",{className:"hint reveal in d2"},V.heroHint))),React.createElement(VilleReassure,null),React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},VLOCAL),React.createElement("div",{className:"intro-grid",style:{marginTop:"clamp(34px,4vw,58px)"}},React.createElement("p",{className:"lead reveal d1"},V.intro.lead),React.createElement("div",{className:"body reveal d2"},V.intro.paragraphs.map((p,i)=>React.createElement("p",{key:i},p)),React.createElement("div",{className:"intro-quote"},V.intro.quote))))),React.createElement("section",{className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap-narrow"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(30px,4vw,52px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Rep\xE9rage"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"}},V.lieux.title)),React.createElement("ul",{className:"art-list reveal d1"},V.lieux.list.map((li,i)=>React.createElement("li",{key:i},li))))),React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap related-grid",style:{gridTemplateColumns:"1fr 1fr"}},React.createElement("a",{href:VP.href,className:"related-card reveal"},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"ville-cta-presta-"+V.slug,ph:VP.card,alt:VP.card+" en Suisse romande \u2014 Kevin Chinelli",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,VP.card),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192"))),React.createElement("a",{href:"tarifs.html",className:"related-card reveal d1"},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"ville-cta-tarif-"+V.slug,ph:"Tarifs photographe Suisse romande",alt:"Tarifs photographe en Suisse romande",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,"Voir les tarifs"),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192"))))),React.createElement("section",{className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap-narrow"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(34px,4vw,56px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Questions fr\xE9quentes"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(28px,3.4vw,46px)",marginTop:"20px"}},VLOCAL,".")),React.createElement("div",{className:"faq reveal d1"},V.faq.map((f,i)=>React.createElement("details",{key:i,open:i===0},React.createElement("summary",null,f.q,React.createElement("span",{className:"pm"})),React.createElement("div",{className:"ans"},f.a)))),V.related&&V.related.length>0&&React.createElement("div",{className:"ville-reads reveal"},V.related.map(r=>React.createElement("a",{key:r.article,href:r.article,className:"link-arrow"},"\xC0 lire : ",r.articleTitle," ",React.createElement("span",{className:"ar"},"\u2192")))))),React.createElement(VillesSoeurs,null),React.createElement(CtaContact,{overline:VLOCAL,title:VP.slug==="mariage"?"V\xE9rifions votre date.":"R\xE9servez votre s\xE9ance."})),React.createElement(Footer,null))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(VilleApp,null));})();

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
