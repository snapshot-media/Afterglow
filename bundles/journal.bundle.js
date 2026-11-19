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
(()=>{const{useState,useEffect,useRef}=React;(function(){try{var p=document.createElement("div");p.style.cssText="position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;transition:opacity .05s linear;pointer-events:none",document.documentElement.appendChild(p),requestAnimationFrame(function(){p.style.opacity="1"}),setTimeout(function(){var op=parseFloat(getComputedStyle(p).opacity);op>.9||document.documentElement.classList.add("no-anim"),p.remove()},220)}catch{}})();const KC={PALETTES:{"Noir chaud":["#141210","#b9926b","#f8f5ef"],"Noir profond":["#0f0e0d","#9a8f7e","#efe9df"],Anthracite:["#16181a","#8a97a0","#eef0f1"],"Ardoise cuivre":["#12100f","#a9744f","#f3ede4"]},HEAD_FONTS:{Cinzel:'"Cinzel", Georgia, serif',Cormorant:'"Cormorant Garamond", Georgia, serif'},BODY_FONTS:{Jost:'"Jost", system-ui, sans-serif',Mulish:'"Mulish", system-ui, sans-serif'},HOME:"/",WHATSAPP:"https://wa.me/41798507603?text="+encodeURIComponent("Bonjour Kevin, je vous \xE9cris depuis le site Afterglow au sujet d'une s\xE9ance photo : "),PRO_URL:"https://snapshotmedia.ch/services/photographie/portraits-professionnels/"},PALETTE_OPTS=Object.values(KC.PALETTES),PRESTA_NAV=[{slug:"mariage",title:"Mariages",short:"Mariages",href:"mariages.html"},{slug:"portrait",title:"Lifestyle",short:"Lifestyle",href:"portraits.html",children:[{slug:"solo",title:"Solo",href:"solo.html"},{slug:"couple",title:"Couple",href:"couple.html"},{slug:"famille",title:"Famille",href:"famille.html"}]},{slug:"studio",title:"Studio",short:"Studio",href:"studio.html"},{slug:"maternite",title:"Maternit\xE9 & Grossesse",short:"Maternit\xE9",href:"maternite-grossesse.html"}],PRESTA_PARENT={};PRESTA_NAV.forEach(p=>(p.children||[]).forEach(c=>{PRESTA_PARENT[c.slug]=p.slug}));function Slot({id,ph,alt,style,className,loading,fetchpriority,media}){return React.createElement("image-slot",{id,shape:"rect",fit:"cover",placeholder:ph,alt:alt||ph,"aria-label":alt||ph,role:"img",style,class:className,loading,fetchpriority,media})}function Overline({children,className=""}){return React.createElement("div",{className:"overline "+className},React.createElement("span",{className:"tick"}),children)}function Nav({active=""}){const[scrolled,setScrolled]=useState(!1),[open,setOpen]=useState(!1);useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>40);return onScroll(),window.addEventListener("scroll",onScroll,{passive:!0}),()=>window.removeEventListener("scroll",onScroll)},[]),useEffect(()=>(document.body.style.overflow=open?"hidden":"",()=>{document.body.style.overflow=""}),[open]);const menu=ReactDOM.createPortal(React.createElement("div",{className:"mobile-menu"+(open?" is-open":""),onClick:()=>setOpen(!1)},React.createElement("div",{className:"mm-inner",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"mm-group"},React.createElement("span",{className:"mm-label"},"Prestations"),PRESTA_NAV.map(p=>[React.createElement("a",{key:p.slug,href:p.href,onClick:()=>setOpen(!1)},p.title),...(p.children||[]).map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"mm-sub",onClick:()=>setOpen(!1)},c.title))]),React.createElement("a",{href:"bon-cadeau.html",onClick:()=>setOpen(!1)},"Bon cadeau")),React.createElement("a",{className:"mm-top",href:"portfolio.html",onClick:()=>setOpen(!1)},"Portfolio"),React.createElement("a",{className:"mm-top",href:"tarifs.html",onClick:()=>setOpen(!1)},"Tarifs"),React.createElement("a",{className:"mm-top",href:"journal.html",onClick:()=>setOpen(!1)},"Journal"),React.createElement("a",{className:"mm-top",href:"apropos.html",onClick:()=>setOpen(!1)},"\xC0 propos"),React.createElement("a",{className:"mm-top",href:"contact.html",onClick:()=>setOpen(!1)},"Contact"))),document.body);return React.createElement(React.Fragment,null,React.createElement("nav",{className:"nav"+(scrolled?" scrolled":"")+(open?" menu-open":"")},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"nav-links"},React.createElement("div",{className:"nav-item nav-extra"+(active==="cadeau"||PRESTA_NAV.some(p=>p.slug===active||p.slug===PRESTA_PARENT[active])?" is-active":"")},React.createElement("a",{href:PRESTA_NAV[0].href,"aria-haspopup":"true"},"Prestations",React.createElement("span",{className:"caret"},"\u25BE")),React.createElement("div",{className:"nav-drop"},PRESTA_NAV.map(p=>[React.createElement("a",{key:p.slug,href:p.href,className:active===p.slug?"is-active":""},p.title),...(p.children||[]).map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"nd-sub"+(active===c.slug?" is-active":"")},c.title))]),React.createElement("a",{href:"bon-cadeau.html",className:"nd-gift"+(active==="cadeau"?" is-active":"")},"Bon cadeau"))),React.createElement("a",{href:"portfolio.html",className:"nav-extra"+(active==="portfolio"?" is-active":"")},"Portfolio"),React.createElement("a",{href:"tarifs.html",className:"nav-extra"+(active==="tarifs"?" is-active":"")},"Tarifs"),React.createElement("a",{href:"journal.html",className:"nav-extra"+(active==="journal"?" is-active":"")},"Journal"),React.createElement("a",{href:"apropos.html",className:"nav-extra"+(active==="apropos"?" is-active":"")},"\xC0 propos"),React.createElement("a",{href:"contact.html",className:"nav-cta"+(active==="contact"?" is-active":"")},"Contact")),React.createElement("button",{className:"nav-burger","aria-label":"Ouvrir le menu","aria-expanded":open,onClick:()=>setOpen(o=>!o)},React.createElement("span",null),React.createElement("span",null))),menu)}function Footer(){return React.createElement("footer",{className:"s-dark",style:{borderTop:"1px solid var(--line-d)"}},React.createElement("div",{className:"footer"},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"copy"},"\xA9 2026 \u2014 Tous droits r\xE9serv\xE9s \xB7 Site cr\xE9\xE9 par ",React.createElement("a",{href:"https://snapshotmedia.ch",target:"_blank",rel:"noopener"},"Snapshot Media")),React.createElement(FooterLinks,null),React.createElement(FooterZones,null)))}const ZONES=[{label:"Mariage \xE0 Lausanne",href:"photographe-mariage-lausanne.html"},{label:"Mariage \xE0 Gen\xE8ve",href:"photographe-mariage-geneve.html"},{label:"Mariage \xE0 Montreux",href:"photographe-mariage-montreux.html"},{label:"Famille \xE0 Lausanne",href:"photographe-famille-lausanne.html"},{label:"Famille \xE0 Gen\xE8ve",href:"photographe-famille-geneve.html"}];function FooterZones(){return React.createElement("div",{className:"zones"},React.createElement("span",{className:"zones-label"},"Par r\xE9gion"),ZONES.map(z=>React.createElement("a",{key:z.href,href:z.href},z.label)))}function FooterLinks(){return React.createElement("div",{className:"social"},React.createElement("a",{href:"apropos.html"},"\xC0 propos"),React.createElement("a",{href:"bon-cadeau.html"},"Bon cadeau"),React.createElement("a",{href:"confidentialite.html"},"Confidentialit\xE9"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener","data-umami-event":"instagram"},"Instagram"),React.createElement("a",{href:"https://g.page/r/Ccd14Q8WzKZuEBM",target:"_blank",rel:"noopener","data-umami-event":"fiche-google"},"Google"),React.createElement("a",{href:KC.WHATSAPP,target:"_blank",rel:"noopener","data-umami-event":"whatsapp"},"WhatsApp"),React.createElement("a",{href:"tel:+41798507603","data-umami-event":"telephone"},"+41 79 850 76 03"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch","data-umami-event":"email"},"contact@afterglowbykevin.ch"))}function RelatedPresta({current}){const parentSlug=PRESTA_PARENT[current],parent=PRESTA_NAV.find(p=>p.slug===parentSlug),items=parent?[parent,...parent.children.filter(c=>c.slug!==current)].slice(0,3):PRESTA_NAV.filter(p=>p.slug!==current).slice(0,3);return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(32px,4vw,52px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"\xC0 d\xE9couvrir aussi"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"}},parent?"Les autres s\xE9ances lifestyle.":"Autres prestations.")),React.createElement("div",{className:"related-grid"},items.map((p,i)=>React.createElement("a",{key:p.slug,href:p.href,className:"related-card reveal d"+(i+1)},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"presta-"+p.slug,ph:p.title,alt:"Photographe "+p.title.toLowerCase()+" en Suisse romande \u2014 Kevin Chinelli",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,p.title),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192")))))))}function CtaContact({overline="Parlons de votre projet",title="R\xE9servez votre date.",href="contact.html",label="Me contacter"}){return React.createElement("section",{className:"sec s-darker cta-band"},React.createElement("div",{className:"wrap pad-y",style:{textAlign:"center"}},React.createElement(Overline,{className:"reveal"},overline),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(34px,5.4vw,72px)",margin:"22px 0 38px"}},title),React.createElement("a",{href,className:"link-arrow reveal d2",style:{fontSize:"14px"}},label," ",React.createElement("span",{className:"ar"},"\u2192"))))}function useReveal(deps=[]){useEffect(()=>{const reveal=()=>{const vh=window.innerHeight;document.querySelectorAll(".reveal:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();r.top<vh*.9&&r.bottom>0&&el.classList.add("in")})};reveal(),window.addEventListener("scroll",reveal,{passive:!0}),window.addEventListener("resize",reveal);const id=setTimeout(reveal,220);return()=>{window.removeEventListener("scroll",reveal),window.removeEventListener("resize",reveal),clearTimeout(id)}},deps)}function useApplyTweaks(t){useEffect(()=>{const r=document.documentElement.style;Array.isArray(t.palette)&&(r.setProperty("--bg",t.palette[0]),r.setProperty("--accent",t.palette[1]),r.setProperty("--cream",t.palette[2])),r.setProperty("--font-display",KC.HEAD_FONTS[t.heading]||KC.HEAD_FONTS.Cinzel),r.setProperty("--font-body",KC.BODY_FONTS[t.body]||KC.BODY_FONTS.Jost)},[t.palette,t.heading,t.body])}Object.assign(window,{KC,PALETTE_OPTS,PRESTA_NAV,PRESTA_PARENT,Slot,Overline,Nav,Footer,FooterLinks,CtaContact,RelatedPresta,useReveal,useApplyTweaks});})();

;
/* ============================================================
   KEVIN CHINELLI — Journal (articles longue traîne / SEO local)
   window.KC_JOURNAL = { meta, articles: { slug: {...} } }
   ============================================================ */
window.KC_JOURNAL = {
  meta: {
    title: "Journal",
    intro: "Conseils, prix, repérages et coulisses de mes séances en Suisse romande — pour préparer sereinement votre mariage, votre portrait, votre séance grossesse ou vos photos professionnelles.",
  },
  order: [
    "ou-se-marier-geneve",
    "spots-seance-photo-lausanne",
    "lieux-mariage-la-cote",
    "prix-photographe-mariage-suisse-romande",
    "quand-reserver-photographe-mariage",
    "lieux-mariage-vaud-leman",
    "quand-faire-seance-photo-grossesse",
    "seance-grossesse-nouveau-ne",
    "photos-linkedin-personal-branding",
    "quelle-tenue-seance-portrait",
    "comment-choisir-photographe-mariage",
    "portrait-studio-ou-exterieur",
    "deroule-journee-mariage",
    "lieux-mariage-lavaux",
    "tenue-seance-grossesse",
    "spots-photo-couple-leman",
  ],
  articles: {

    /* ============ ARTICLE 1 — MARIAGE / LAVAUX ============ */
    "lieux-mariage-lavaux": {
      slug: "lieux-mariage-lavaux",
      file: "journal-lieux-mariage-lavaux.html",
      category: "Mariage",
      relatedSlug: "mariage", relatedHref: "mariages.html", relatedTitle: "Mariages",
      date: "2026-04-18", dateLabel: "18 avril 2026", read: "6 min",
      title: "Où se marier en Lavaux : 8 lieux de rêve face au Léman",
      hero: "Vignobles de Lavaux en terrasses au-dessus du Léman, lumière dorée",
      heroAlt: "Mariage dans les vignobles de Lavaux au-dessus du lac Léman — Kevin Chinelli, photographe",
      excerpt: "Entre les terrasses viticoles classées à l'UNESCO et les rives du Léman, Lavaux offre quelques-uns des plus beaux décors de mariage de Suisse romande. Mon repérage, lieu par lieu.",
      metaTitle: "Où se marier en Lavaux : 8 lieux face au Léman | Kevin Chinelli",
      metaDesc: "Les plus beaux lieux de mariage en Lavaux : domaines viticoles, terrasses et salles avec vue sur le Léman. Le guide d'un photographe de mariage romand.",
      intro: "Photographier des mariages en Lavaux, c'est travailler dans l'un des plus beaux paysages de Suisse : des terrasses de vignes qui dévalent vers le lac, une lumière de fin de journée incomparable, et les Alpes en toile de fond. Voici les lieux que je recommande à mes mariés, avec un œil de photographe sur la lumière et les angles.",
      sections: [
        { h: "Pourquoi se marier en Lavaux", p: [
          "Classé au patrimoine mondial de l'UNESCO, le vignoble en terrasses de Lavaux s'étire sur une trentaine de kilomètres entre Lausanne et Montreux. C'est un décor naturel qui ne demande presque aucune décoration : les murs de pierre, les ceps alignés et le lac suffisent.",
          "Pour les photos, le grand atout reste la lumière de l'heure dorée, qui glisse sur les vignes en fin d'après-midi. Prévoyez votre [séance des mariés](mariages.html) à ce moment-là : c'est là que Lavaux donne le meilleur.",
        ] },
        { h: "Les domaines et lieux que je recommande", list: [
          "Le Deck à Chexbres — vue panoramique sur le lac, parfait pour un apéritif au coucher du soleil.",
          "Lavaux Vinorama à Rivaz — au bord de l'eau, idéal si vous rêvez de photos les pieds presque dans le lac.",
          "Les terrasses de Saint-Saphorin — un village de carte postale, ruelles étroites et embarcadère.",
          "Le Baron Tavernier à Chexbres — une institution avec terrasse suspendue au-dessus du vignoble.",
          "Épesses et Dézaley — pour une cérémonie laïque intime au milieu des vignes.",
          "Les quais de Cully — petit port charmant, belles lumières le matin comme le soir.",
          "Grandvaux — point de vue sur le lac et clocher emblématique.",
          "Montreux et le château de Chillon, en limite est, pour un décor plus monumental.",
        ] },
        { h: "Mes conseils de photographe", p: [
          "Réservez la lumière, pas seulement le lieu. Demandez l'heure exacte du coucher du soleil pour votre date et calez le déroulé en conséquence : idéalement, 45 minutes pour le couple juste avant le coucher. C'est aussi ce que je conseille à mes mariés pour leur [reportage de mariage](mariages.html).",
          "Anticipez la météo du lac. Le Léman crée ses propres ambiances — brume matinale, ciels changeants. J'ai toujours un plan B couvert avec mes mariés, mais sachez qu'un ciel chargé donne souvent des images plus dramatiques qu'un grand bleu uniforme.",
          "Pensez aux déplacements. Les villages de Lavaux sont escarpés et les ruelles pavées : prévoyez des chaussures confortables pour la mariée entre deux décors, et un timing réaliste si la cérémonie et la réception sont sur deux sites.",
        ] },
        { h: "Se déplacer le jour J en Lavaux", p: [
          "Lavaux est splendide mais escarpé : ruelles pavées, dénivelé, accès parfois étroits entre les murs de vigne. Anticipez les trajets entre la cérémonie, la séance au milieu des ceps et la réception — quelques minutes de voiture suffisent souvent, mais le terrain ralentit et les distances trompent.",
          "Pensez au confort de la mariée (une paire de chaussures plates pour marcher entre les vignes), et prévenez vos invités du stationnement, souvent limité dans les villages viticoles. Le Lavaux Express ou une navette privée peuvent dépanner pour les groupes.",
        ] },
        { h: "Cérémonie en extérieur : ce qu'il faut anticiper", p: [
          "Une cérémonie laïque au milieu des vignes est magnifique, mais elle se prépare : l'orientation par rapport au soleil de fin d'après-midi, un coin d'ombre pour les invités en plein été, et un vrai plan B couvert en cas de pluie ou de bise — fréquente sur le lac.",
          "Renseignez-vous aussi sur les autorisations : tous les domaines n'accueillent pas une cérémonie sur leurs terrasses, et certains lieux publics demandent une demande préalable. On valide tout cela ensemble au repérage.",
        ] },
      ],
      closing: "Vous vous mariez en Lavaux ou ailleurs au bord du Léman ? Je connais bien la région et sa lumière. Parlons de votre projet — je ne réserve qu'un mariage par jour.",
    },

    /* ============ ARTICLE 2 — MATERNITÉ / TENUE ============ */
    "tenue-seance-grossesse": {
      slug: "tenue-seance-grossesse",
      file: "journal-tenue-seance-grossesse.html",
      category: "Maternité",
      relatedSlug: "maternite", relatedHref: "maternite-grossesse.html", relatedTitle: "Maternité & Grossesse",
      date: "2026-03-05", dateLabel: "5 mars 2026", read: "6 min",
      title: "Que porter pour une séance photo de grossesse",
      hero: "Future maman en robe fluide, lumière douce de studio",
      heroAlt: "Tenue pour une séance photo de grossesse en studio — Kevin Chinelli, photographe en Suisse romande",
      excerpt: "Robes fluides, tons neutres, matières près du corps : voici comment choisir vos tenues pour une séance grossesse réussie, en studio comme en extérieur.",
      metaTitle: "Que porter pour une séance photo de grossesse | Kevin Chinelli",
      metaDesc: "Conseils tenues pour votre séance photo de grossesse en Suisse romande : couleurs, matières, ce qui met le ventre en valeur. Par un photographe maternité.",
      intro: "« Qu'est-ce que je mets ? » C'est de loin la question qu'on me pose le plus avant une séance grossesse. Bonne nouvelle : les plus belles images viennent presque toujours de tenues simples qui mettent la silhouette en valeur sans la surcharger. Voici mes repères.",
      sections: [
        { h: "Le principe : épurer pour sublimer", p: [
          "Une séance grossesse cherche à célébrer une ligne, une courbe, un lien. Tout ce qui détourne le regard — motifs chargés, logos, coupes amples et flottantes — dessert cet objectif. On privilégie les matières près du corps qui épousent le ventre, et les tissus fluides qui captent la lumière et le mouvement.",
        ] },
        { h: "Couleurs et matières qui rendent le mieux", list: [
          "Les tons neutres et naturels : crème, beige, terracotta, vert sauge, gris doux, bleu nuit.",
          "Les matières fluides : mousseline, soie, jersey fin, maille souple — elles bougent et accrochent joliment la lumière.",
          "Le drapé et les voiles, parfaits pour des silhouettes épurées en contre-jour.",
          "Pour le ou la partenaire : des tons coordonnés, sans assortir à l'identique. Un jean brut et une chemise unie fonctionnent toujours.",
          "À éviter : motifs serrés, rayures fines, néons, logos visibles, et le total noir si la peau est très claire.",
        ] },
        { h: "Studio ou extérieur : on adapte", p: [
          "En studio, le fond est neutre et maîtrisé : une robe longue, un body simple ou un drapé suffisent. C'est l'option la plus douce et la plus intemporelle, idéale en hiver ou en fin de grossesse.",
          "En extérieur — au bord du Léman, en forêt ou dans les vignes — les robes longues et fluides prennent le vent et donnent des images vivantes. Prévoyez une seconde tenue pour varier les ambiances. Je détaille tout cela avant chaque [séance grossesse en studio ou en extérieur](maternite-grossesse.html).",
        ] },
        { h: "Le bon moment et les détails qui comptent", p: [
          "La période idéale se situe entre la 30e et la 36e semaine : le ventre est joliment arrondi et vous êtes encore à l'aise pour bouger.",
          "Pensez aux détails : une manucure soignée (on photographie souvent les mains sur le ventre), des sous-vêtements sans coutures marquées, et des chaussures faciles à retirer pour les images pieds nus. Évitez aussi chaussettes et élastiques serrés juste avant, qui laissent des marques.",
        ] },
        { h: "Pour le partenaire et les aînés", p: [
          "Si la séance se fait à plusieurs, l'idée est de coordonner les tenues sans tomber dans l'assorti à l'identique. On reste dans la même famille de tons neutres et naturels : cela unifie l'image sans que tout le monde paraisse en uniforme.",
          "Pour le ou la partenaire, un jean brut et une chemise unie fonctionnent toujours. Pour les aînés, des vêtements simples et confortables dans lesquels ils peuvent bouger et jouer — un enfant à l'aise donne toujours de plus belles images qu'un enfant endimanché.",
        ] },
        { h: "Les accessoires qui subliment (sans surcharger)", p: [
          "Un ou deux accessoires bien choisis suffisent à personnaliser la séance : un voile fluide qui prend la lumière, quelques fleurs, un ruban, ou un objet qui a du sens — une première petite tenue, les chaussons du bébé, l'image de l'échographie.",
          "Le piège est d'en faire trop : l'accessoire doit accompagner l'émotion, pas la voler. En cas de doute, on en parle avant la séance et on garde le geste juste.",
        ] },
      ],
      closing: "Envie d'une séance douce pour garder une trace de cette parenthèse ? Je vous reçois en Suisse romande, en lumière naturelle, seule, en couple ou avec les aînés.",
    },

    /* ============ ARTICLE 3 — COUPLE / LÉMAN ============ */
    "spots-photo-couple-leman": {
      slug: "spots-photo-couple-leman",
      file: "journal-spots-photo-couple-leman.html",
      category: "Couple",
      relatedSlug: "couple", relatedHref: "couple.html", relatedTitle: "Couple",
      date: "2026-02-10", dateLabel: "10 février 2026", read: "5 min",
      title: "Les plus beaux spots photo de couple autour du Léman",
      hero: "Couple enlacé sur un quai du Léman au coucher du soleil",
      heroAlt: "Séance photo de couple au bord du lac Léman au coucher du soleil — Kevin Chinelli, photographe",
      excerpt: "Quais de Lausanne, vignes de Lavaux, vieille ville de Genève : mes lieux préférés pour une séance couple ou fiançailles autour du lac, et la meilleure heure pour chacun.",
      metaTitle: "Spots photo de couple autour du Léman | Kevin Chinelli",
      metaDesc: "Les plus beaux lieux pour une séance photo de couple ou de fiançailles autour du Léman : Lausanne, Lavaux, Genève, Montreux. Conseils d'un photographe.",
      intro: "Une [séance couple](couple.html) n'a pas besoin d'un décor spectaculaire — juste d'un endroit où vous vous sentez bien et d'une belle lumière. Autour du Léman, on a l'embarras du choix. Voici mes lieux de prédilection, du plus urbain au plus sauvage, avec l'heure qui leur va le mieux.",
      sections: [
        { h: "Côté Lausanne et Lavaux", list: [
          "Ouchy et ses quais — le grand classique, à faire tôt le matin pour éviter la foule, ou à l'heure dorée pour les couleurs.",
          "Les escaliers du marché et la vieille ville de Lausanne — pour une ambiance plus urbaine et intime.",
          "Les vignes de Lavaux (Cully, Épesses, Saint-Saphorin) — imbattables au coucher du soleil.",
          "Le port de Pully ou de Lutry — petits ports paisibles, belles lumières de fin de journée.",
        ] },
        { h: "Côté Genève, Montreux et Riviera", list: [
          "Les Bains des Pâquis à Genève — lumière du matin et vue sur le jet d'eau.",
          "La vieille ville de Genève et la promenade de la Treille — ruelles, escaliers, marronniers.",
          "Le quai de Montreux et ses massifs fleuris — romantique, avec les Alpes en fond.",
          "Le château de Chillon et ses abords — pour une touche plus monumentale.",
        ] },
        { h: "Bien choisir son heure", p: [
          "L'heure dorée, juste avant le coucher du soleil, reste la valeur sûre : lumière chaude, ombres douces, ambiance enveloppante. La lumière du matin, plus fraîche et plus calme, est idéale si vous voulez éviter le monde sur les quais.",
          "Évitez le plein midi en été : la lumière est dure et les contrastes peu flatteurs. Si c'est le seul créneau possible, on cherchera l'ombre des arcades ou des arbres.",
        ] },
        { h: "Et s'il fait gris ?", p: [
          "Un ciel couvert agit comme une immense boîte à lumière : les portraits y sont doux et homogènes. La météo romande étant ce qu'elle est, je garde toujours une alternative en tête — un passage en vieille ville, sous une arcade, ou une séance plus intimiste à l'intérieur.",
        ] },
        { h: "Comment se passe une séance de couple", p: [
          "Pas de panique si vous n'êtes pas à l'aise devant l'objectif : c'est le cas de la grande majorité des couples. On commence par marcher et discuter, le temps que l'appareil se fasse oublier. Je vous donne des indications simples — où poser le regard, comment vous tenir l'un à l'autre — plutôt que des poses figées.",
          "Les plus belles images arrivent presque toujours entre deux consignes, quand vous redevenez simplement vous-mêmes : un rire, un front contre un front, une main qui cherche l'autre. Mon rôle est de créer ces occasions, pas de les forcer.",
        ] },
        { h: "Quelques idées pour la rendre unique", list: [
          "Choisir un lieu qui compte pour vous deux : là où vous vous êtes rencontrés, votre quartier, un coin de balade favori.",
          "Ajouter une activité simple : un café à emporter, un pique-nique, une promenade au bord de l'eau — le mouvement détend toujours.",
          "Jouer la saison : brume d'automne sur le lac, vignes dorées, neige en hauteur, lumière d'été en fin de journée.",
          "Penser à l'usage : faire-part, tirage pour la maison, ou simplement de belles images de vous deux à un instant donné.",
        ] },
      ],
      closing: "Fiançailles, anniversaire de rencontre ou simple envie d'une belle trace : on choisit ensemble le lieu et l'heure qui vous ressemblent. Beaucoup de couples en profitent aussi pour leur faire-part de mariage.",
    },

    /* ============ ARTICLE — PRIX MARIAGE ============ */
    "prix-photographe-mariage-suisse-romande": {
      slug: "prix-photographe-mariage-suisse-romande",
      file: "journal-prix-photographe-mariage-suisse-romande.html",
      category: "Mariage",
      relatedSlug: "mariage", relatedHref: "mariages.html", relatedTitle: "Mariages",
      date: "2026-06-24", dateLabel: "24 juin 2026", read: "7 min",
      title: "Combien coûte un photographe de mariage en Suisse romande ?",
      hero: "Mariés enlacés à l'heure dorée au-dessus du Léman",
      heroAlt: "Prix d'un photographe de mariage en Suisse romande — couple à l'heure dorée | Kevin Chinelli",
      excerpt: "Le plus souvent entre 2'500 et 4'500 francs pour un reportage complet : voici ce qui fait vraiment le prix d'un photographe de mariage en Suisse romande, et comment investir au bon endroit.",
      metaTitle: "Prix d'un photographe de mariage en Suisse romande | Kevin Chinelli",
      metaDesc: "Combien coûte un photographe de mariage à Lausanne, Genève et en Suisse romande ? Fourchettes de prix, ce qui les explique et comment bien choisir.",
      intro: "C'est souvent la première question qu'on me pose, et c'est bien normal : le budget photo d'un mariage n'a rien d'anodin. Plutôt que de botter en touche, voici des fourchettes honnêtes pour la Suisse romande — et surtout ce qui se cache derrière un prix, pour que vous sachiez exactement où va votre argent et comment investir au bon endroit.",
      sections: [
        { h: "Les fourchettes de prix en Suisse romande", p: [
          "En Suisse romande, un reportage de mariage complet se situe le plus souvent entre 2'500 et 4'500 francs. En dessous de 1'500 francs, vous trouverez surtout des photographes débutants ou des couvertures très courtes ; au-delà de 5'000 francs, des photographes très établis ou des prestations sur deux jours avec second photographe et album haut de gamme.",
          "Chez Afterglow, mes [formules mariage](mariages.html) démarrent à CHF 1'290 pour une demi-journée et vont jusqu'à CHF 4'500 pour une présence sur deux jours. Cette fourchette n'est pas arbitraire : elle suit la durée de présence, le nombre d'images livrées et les livrables physiques inclus.",
        ] },
        { h: "Ce qui fait vraiment le prix", list: [
          "Les heures de présence : une demi-journée et une couverture des préparatifs jusqu'au bout de la soirée n'engagent pas le même travail.",
          "Le temps de retouche : pour une heure de prise de vue, comptez souvent deux à trois heures de tri et de retouche, image par image.",
          "L'expérience et la régularité : savoir anticiper un instant, gérer une lumière difficile, ne jamais rater l'échange des vœux — ça se paie en sérénité.",
          "Le matériel et les sauvegardes : double boîtier, optiques lumineuses, et une double sauvegarde sécurisée pour qu'aucune image ne soit jamais perdue.",
          "Les livrables : galerie en ligne, album fine art, tirages d'art — le physique a un coût, mais c'est ce qui traverse le mieux les années.",
          "Les déplacements : inclus partout en Suisse romande chez moi, à détailler clairement ailleurs.",
        ] },
        { h: "Pourquoi le « pas cher » coûte parfois plus cher", p: [
          "Un tarif très bas cache souvent un risque : un photographe sans second boîtier ni sauvegarde, une retouche bâclée, ou des images qu'au final vous n'imprimerez jamais. Le mariage ne se rejoue pas — c'est le seul poste de votre budget que vous regarderez encore dans trente ans.",
          "Je préfère être transparent : mieux vaut une demi-journée bien couverte et bien livrée qu'une journée entière expédiée. On cale la formule sur vos priorités, pas l'inverse.",
        ] },
        { h: "Comment investir intelligemment", p: [
          "Priorisez la couverture des moments qui comptent vraiment pour vous : les préparatifs, la cérémonie, la lumière de fin de journée. Le reste s'ajuste.",
          "Pensez physique : un album traverse mieux les décennies qu'un disque dur oublié dans un tiroir. Et demandez toujours un devis détaillé — vous devez savoir ce qui est inclus avant de signer. Mes [tarifs](tarifs.html) sont affichés sans détour, et chaque devis est personnalisé.",
        ] },
        { h: "Les coûts qu'on oublie souvent de budgéter", list: [
          "La séance d'engagement : parfois offerte (comme dans mes formules Signature et Prestige), parfois facturée en supplément ailleurs.",
          "Les heures supplémentaires le jour J : si la soirée s'étire au-delà du forfait, clarifiez le tarif horaire à l'avance pour éviter la surprise sur la facture.",
          "L'album et les tirages : un bel album fine art relié main représente souvent 300 à 600 francs — un budget à anticiper sereinement, pas à découvrir après coup.",
          "Le déplacement hors Suisse romande : transport et hébergement éventuels pour un mariage lointain, à chiffrer dès le départ.",
          "La livraison express : utile si vous voulez vos images sous 10 jours plutôt que sous 4 semaines.",
        ] },
        { h: "Comment lire un devis (et le comparer honnêtement)", p: [
          "Un devis clair répond sans détour à six questions : combien d'heures de présence, combien de photos livrées (et est-ce un minimum garanti ou une simple estimation), sous quel délai, avec quels droits d'usage, quelle sauvegarde des fichiers, et selon quel échéancier de paiement. Si l'une de ces réponses manque, demandez-la avant de signer.",
          "Attention aux comparaisons trompeuses : deux devis au même prix peuvent cacher 4 h de couverture d'un côté et 10 h de l'autre. Ramenez toujours le tarif à ce qui est réellement inclus — c'est le seul comparatif qui veuille dire quelque chose.",
        ] },
      ],
      closing: "Le bon prix, c'est celui qui vous garantit des images justes, sauvegardées et livrées, sans mauvaise surprise. Dites-moi votre date et votre déroulé : je vous prépare un devis clair et adapté à votre journée.",
    },

    /* ============ ARTICLE — QUAND RÉSERVER ============ */
    "quand-reserver-photographe-mariage": {
      slug: "quand-reserver-photographe-mariage",
      file: "journal-quand-reserver-photographe-mariage.html",
      category: "Mariage",
      relatedSlug: "mariage", relatedHref: "mariages.html", relatedTitle: "Mariages",
      date: "2026-06-19", dateLabel: "19 juin 2026", read: "5 min",
      title: "Quand réserver son photographe de mariage ?",
      hero: "Préparatifs de mariage, lumière douce du matin",
      heroAlt: "Quand réserver son photographe de mariage en Suisse romande | Kevin Chinelli",
      excerpt: "8 à 14 mois à l'avance, parfois davantage pour un samedi d'été : le bon timing pour réserver votre photographe de mariage en Suisse romande, sans stress et sans regret.",
      metaTitle: "Quand réserver son photographe de mariage ? | Kevin Chinelli",
      metaDesc: "Quand réserver son photographe de mariage en Suisse romande ? Délais selon la saison, pourquoi les bonnes dates partent vite et comment s'y prendre.",
      intro: "Une fois la date posée et le lieu réservé, le photographe figure parmi les premiers prestataires à bloquer. La raison est simple : un bon photographe ne fait qu'un seul mariage par jour. Voici comment ne pas laisser passer le vôtre.",
      sections: [
        { h: "Le délai idéal : 8 à 14 mois", p: [
          "Pour un mariage en Suisse romande, je conseille de réserver votre photographe 8 à 14 mois à l'avance. C'est le délai qui vous laisse le choix, le temps d'échanger sereinement, et la possibilité d'ajouter une séance d'engagement avant le jour J.",
          "Pour les samedis de mai à septembre — la haute saison romande — visez plutôt le haut de la fourchette, voire davantage. Ces dates partent parfois plus d'un an à l'avance.",
        ] },
        { h: "Pourquoi les bonnes dates partent vite", p: [
          "Je ne réserve qu'un seul mariage par date : vous avez ainsi ma disponibilité et mon énergie du matin jusqu'à la fin de soirée. C'est un parti pris qui fait la qualité du reportage — mais cela veut aussi dire qu'une fois une date prise, elle ne l'est que pour vous.",
          "Concrètement, dès que vous avez votre lieu et votre date, parlez-en à votre photographe. Même si le reste de l'organisation n'est pas calé, bloquer la date est ce qui compte.",
        ] },
        { h: "Et si votre mariage est dans peu de temps ?", p: [
          "Tout n'est pas perdu, loin de là. Il m'arrive de couvrir des mariages réservés quelques semaines à l'avance, surtout en semaine ou hors haute saison. Le mieux est de me [contacter](contact.html) rapidement pour vérifier ma disponibilité sur votre date.",
        ] },
        { h: "Réserver, concrètement", p: [
          "La date est bloquée à la signature du contrat et au versement d'un acompte de 30 %. Le solde est réglé 10 jours après le mariage — vous réglez l'essentiel une fois la journée passée et les images en route.",
          "Avant de signer, on prend le temps d'un appel ou d'un café pour faire connaissance et vérifier que le courant passe. Découvrez [mes formules mariage](mariages.html) pour préparer cet échange.",
        ] },
        { h: "Le bon ordre des réservations", p: [
          "Dans l'organisation d'un mariage, trois prestataires se réservent en tout premier car ils ne prennent qu'un seul événement par date : le lieu, le traiteur et le photographe. Une fois votre lieu et votre date confirmés, le photographe devrait figurer dans vos tout premiers contacts.",
          "Attendre « d'avoir tout calé » est l'erreur la plus fréquente : le reste de l'organisation — faire-part, fleurs, décoration, animation — se décide très bien plus tard. Mais une date de photographe déjà prise par un autre couple ne reviendra pas.",
        ] },
        { h: "Et la séance d'engagement dans le calendrier ?", p: [
          "Si votre formule inclut une séance d'engagement, le bon créneau pour la réaliser se situe 2 à 4 mois avant le mariage. Assez tôt pour utiliser les images sur votre faire-part, votre site de mariage ou un tirage ; assez proche pour que vous soyez déjà dans l'ambiance.",
          "C'est aussi le meilleur moyen d'apprivoiser l'objectif : le jour J, vous serez bien plus naturels devant un appareil et une présence devenus familiers. Beaucoup de mes mariés me disent que c'est ce qui a tout changé pour eux.",
        ] },
      ],
      closing: "Votre date approche ou se précise ? Vérifions ensemble ma disponibilité tant qu'elle est libre. Un message suffit pour démarrer.",
    },

    /* ============ ARTICLE — LIEUX MARIAGE VAUD / LÉMAN ============ */
    "lieux-mariage-vaud-leman": {
      slug: "lieux-mariage-vaud-leman",
      file: "journal-lieux-mariage-vaud-leman.html",
      category: "Mariage",
      relatedSlug: "mariage", relatedHref: "mariages.html", relatedTitle: "Mariages",
      date: "2026-06-12", dateLabel: "12 juin 2026", read: "5 min",
      title: "Se marier dans le canton de Vaud : 10 lieux autour du Léman",
      hero: "Domaine de mariage avec vue sur le lac Léman et les Alpes",
      heroAlt: "Lieux de mariage dans le canton de Vaud et autour du Léman | Kevin Chinelli",
      excerpt: "Châteaux, domaines viticoles, salles avec vue sur le lac : un tour d'horizon des plus beaux lieux pour se marier dans le canton de Vaud et autour du Léman, vus par un photographe.",
      metaTitle: "Où se marier dans le canton de Vaud : 10 lieux autour du Léman | Kevin Chinelli",
      metaDesc: "Les plus beaux lieux de mariage du canton de Vaud et autour du Léman : châteaux, domaines viticoles, salles avec vue sur le lac. Le guide d'un photographe.",
      intro: "Le canton de Vaud concentre une densité rare de beaux lieux de mariage : des rives du Léman aux contreforts des Alpes, en passant par les vignobles et les châteaux. Après l'avoir arpenté article après article — notamment du côté de [Lavaux](journal-lieux-mariage-lavaux.html) — voici un tour d'horizon plus large, avec un œil de photographe sur le décor et la lumière.",
      sections: [
        { h: "Au bord du lac", list: [
          "La Riviera (Vevey, Montreux, La Tour-de-Peilz) — quais fleuris, lumière du soir et Alpes en toile de fond.",
          "Le château de Chillon et ses abords — un décor monumental, idéal pour des images fortes en fin de journée.",
          "Les ports de Lutry, Pully et Cully — petits embarcadères paisibles, parfaits pour une parenthèse à deux.",
          "Morges et ses quais — plus calmes, avec une belle lumière le matin comme en soirée.",
        ] },
        { h: "Dans les vignes et la campagne", list: [
          "Lavaux (Saint-Saphorin, Épesses, Dézaley) — les terrasses classées à l'UNESCO, imbattables au coucher du soleil.",
          "La Côte (Aubonne, Féchy, Mont-sur-Rolle) — domaines viticoles avec vue dégagée sur le lac et le Jura.",
          "Le Gros-de-Vaud et le Jorat — granges rénovées et fermes de caractère pour une ambiance champêtre.",
        ] },
        { h: "Châteaux et domaines de caractère", list: [
          "Le château d'Oron — médiéval et photogénique, pour un mariage hors du temps.",
          "Les domaines et orangeries de la région lausannoise — élégance classique et beaux jardins.",
          "Les salles avec vue de Chexbres et Puidoux — terrasses suspendues au-dessus du vignoble et du lac.",
        ] },
        { h: "Mes conseils de photographe", p: [
          "Pensez à la lumière de fin de journée. Quel que soit le lieu, réservez 30 à 45 minutes pour le couple autour du coucher du soleil : c'est là que les images sont les plus belles. Je cale toujours le déroulé du [reportage](mariages.html) en fonction de cette heure dorée.",
          "Anticipez la météo du lac. Le Léman crée ses propres ambiances — brume, ciels changeants, lumières dramatiques. Un plan B couvert se prévoit au repérage, mais un ciel chargé donne souvent des images plus intenses qu'un grand bleu uniforme.",
        ] },
        { h: "L'erreur classique : choisir un lieu sans penser à la lumière", p: [
          "Un lieu magnifique mais mal orienté peut compliquer les photos : une terrasse plein sud à midi écrase les visages d'ombres dures, une salle de réception sombre oblige à tout éclairer artificiellement. Avant de signer, repérez où tombe le soleil en fin de journée et demandez à voir les espaces à l'heure prévue de votre cérémonie.",
          "L'idéal réunit deux choses : un extérieur exploitable à l'heure dorée et une salle avec de vraies fenêtres. C'est exactement ce que je vérifie au repérage avec mes mariés, lieu par lieu, pour qu'aucune belle lumière ne soit perdue.",
        ] },
        { h: "Les questions à poser à votre lieu avant de réserver", list: [
          "Y a-t-il un plan B couvert et photogénique en cas de pluie ou de bise ?",
          "La cérémonie laïque en extérieur est-elle autorisée, et à quel endroit précis ?",
          "Jusqu'à quelle heure la musique et la fête sont-elles permises ?",
          "L'accès et le parking sont-ils simples pour les invités comme pour les prestataires ?",
          "Le lieu impose-t-il certains prestataires (traiteur, etc.) ou vous laisse-t-il le choix ?",
        ] },
      ],
      closing: "Vous avez un lieu en tête dans le canton de Vaud, ou vous hésitez encore ? Je connais bien la région et sa lumière — parlons de votre projet et de votre date.",
    },

    /* ============ ARTICLE — QUAND FAIRE SÉANCE GROSSESSE ============ */
    "quand-faire-seance-photo-grossesse": {
      slug: "quand-faire-seance-photo-grossesse",
      file: "journal-quand-faire-seance-photo-grossesse.html",
      category: "Maternité",
      relatedSlug: "maternite", relatedHref: "maternite-grossesse.html", relatedTitle: "Maternité & Grossesse",
      date: "2026-06-05", dateLabel: "5 juin 2026", read: "5 min",
      title: "Quand faire sa séance photo de grossesse ?",
      hero: "Future maman en contre-jour, lumière douce",
      heroAlt: "Quand faire sa séance photo de grossesse en Suisse romande | Kevin Chinelli",
      excerpt: "Entre la 30e et la 36e semaine, le plus souvent : voici le bon moment pour votre séance grossesse, les exceptions à connaître, et comment anticiper selon la saison.",
      metaTitle: "Quand faire sa séance photo de grossesse ? | Kevin Chinelli",
      metaDesc: "À quelle semaine faire sa séance photo de grossesse ? Le moment idéal, les cas particuliers (jumeaux, terme en été) et comment réserver en Suisse romande.",
      intro: "Trop tôt, le ventre ne se dessine pas encore ; trop tard, le confort n'est plus au rendez-vous. Il existe une fenêtre idéale pour photographier une grossesse — la voici, avec les quelques exceptions qui méritent d'avancer la séance.",
      sections: [
        { h: "La fenêtre idéale : 30e à 36e semaine", p: [
          "Pour la plupart des grossesses, le moment parfait se situe entre la 30e et la 36e semaine, soit au cœur du troisième trimestre. Le ventre est alors joliment arrondi, bien lisible à l'image, et vous êtes encore tout à fait à l'aise pour bouger, marcher et tenir quelques poses.",
          "Au-delà de 37 semaines, la fatigue et l'inconfort grandissent, et bébé pourrait pointer plus tôt que prévu. Mieux vaut ne pas jouer la montre.",
        ] },
        { h: "Les cas où l'on avance la séance", list: [
          "Jumeaux ou multiples : le ventre s'arrondit plus vite et le terme tombe souvent plus tôt — visez la 28e à la 32e semaine.",
          "Grossesse à surveiller ou repos conseillé : on adapte, on raccourcit, on privilégie le confort. La séance reste douce et sans contrainte.",
          "Terme en plein été : réservez tôt (dès le 2e trimestre) pour garder le choix de la date et de la lumière.",
        ] },
        { h: "Penser à la saison et à la lumière", p: [
          "En hiver ou en fin de grossesse, une séance en intérieur, à la lumière naturelle d'une grande fenêtre, offre une atmosphère douce et feutrée. Aux beaux jours, l'extérieur — bord du Léman, forêt, vignes — apporte du mouvement et de la profondeur.",
          "Dans tous les cas, on échange en amont pour choisir le bon créneau. Je détaille tout cela avant chaque [séance grossesse](maternite-grossesse.html).",
        ] },
        { h: "Réserver au bon moment", p: [
          "Comme la fenêtre est courte, l'idéal est de me contacter autour de la 20e à la 24e semaine. On bloque alors une date dans votre période idéale, avec une marge si bébé décidait d'avancer un peu le programme.",
        ] },
        { h: "Bien préparer la veille et le jour J", list: [
          "Hydratez-vous et dormez : une peau reposée et bien hydratée se photographie toujours mieux.",
          "Évitez chaussettes, élastiques et vêtements serrés dans les heures qui précèdent : ils marquent la peau pour un bon moment.",
          "Une manucure soignée fait la différence : on photographie souvent les mains posées sur le ventre.",
          "Mangez avant de venir et prévoyez une petite collation : une séance dure jusqu'à une heure, et le confort prime toujours.",
          "Apportez vos tenues sur cintre et, si vous le souhaitez, un objet qui compte (une première petite tenue, une échographie).",
        ] },
        { h: "Penser déjà à l'après : la séance nouveau-né", p: [
          "Beaucoup de futurs parents l'ignorent : le meilleur moment pour réserver une séance nouveau-né, c'est… pendant la grossesse. Les premiers jours après la naissance passent vite, et l'agenda se cale bien plus sereinement à l'avance.",
          "Si l'idée vous séduit, ma formule [Continuité](maternite-grossesse.html) relie les deux séances dans une même galerie, pour raconter l'attente puis l'arrivée d'un seul tenant. On en parle au moment de votre séance grossesse.",
        ] },
      ],
      closing: "Vous approchez du troisième trimestre ? C'est le bon moment pour réserver. On choisit ensemble la date, le lieu et l'ambiance qui vous ressemblent.",
    },

    /* ============ ARTICLE — GROSSESSE + NOUVEAU-NÉ ============ */
    "seance-grossesse-nouveau-ne": {
      slug: "seance-grossesse-nouveau-ne",
      file: "journal-seance-grossesse-nouveau-ne.html",
      category: "Maternité",
      relatedSlug: "maternite", relatedHref: "maternite-grossesse.html", relatedTitle: "Maternité & Grossesse",
      date: "2026-05-29", dateLabel: "29 mai 2026", read: "5 min",
      title: "Séance grossesse et nouveau-né : pourquoi les combiner",
      hero: "Nouveau-né endormi dans les bras de ses parents",
      heroAlt: "Séance photo grossesse et nouveau-né en Suisse romande | Kevin Chinelli",
      excerpt: "Photographier l'attente puis l'arrivée, dans une même galerie : pourquoi associer séance grossesse et séance nouveau-né donne des souvenirs bien plus forts qu'isolés.",
      metaTitle: "Séance grossesse et nouveau-né : pourquoi les combiner | Kevin Chinelli",
      metaDesc: "Séance grossesse et séance nouveau-né : pourquoi relier l'attente et l'arrivée dans une même histoire. Conseils et déroulé, en Suisse romande.",
      intro: "Il y a la grossesse — cette parenthèse suspendue où tout est encore promesse. Et il y a les premiers jours du bébé, fragiles et fugaces. Les photographier séparément, c'est bien. Les relier dans une même histoire, c'est autre chose. Voici pourquoi je propose désormais de les combiner.",
      sections: [
        { h: "Deux instants qui se répondent", p: [
          "Une séance grossesse célèbre l'attente : une silhouette, des mains posées sur le ventre, un regard déjà tourné vers l'avenir. Une séance nouveau-né capte l'arrivée : la peau, le sommeil, les premiers gestes de parents. Mises côte à côte, ces images racontent une vraie continuité — celle d'une famille qui se forme.",
          "C'est exactement l'idée de ma formule [Continuité](maternite-grossesse.html) : une galerie commune qui relie l'avant et l'après, dans la même douceur et la même cohérence visuelle.",
        ] },
        { h: "Le bon timing pour chaque séance", list: [
          "La séance grossesse : entre la 30e et la 36e semaine, quand le ventre est joliment arrondi et que vous êtes encore à l'aise.",
          "La séance nouveau-né : idéalement dans les dix à quinze premiers jours, quand bébé dort beaucoup et se love facilement.",
          "Entre les deux : on cale tout en amont, pour n'avoir aucune logistique à gérer une fois la naissance passée.",
        ] },
        { h: "Une cohérence qui fait la différence", p: [
          "Quand les deux séances sont confiées au même photographe, la lumière, les tons, la retouche et l'esprit restent les mêmes. Le résultat forme un ensemble harmonieux, pensé pour un album ou un mur — pas deux galeries disparates qui jurent l'une à côté de l'autre.",
          "C'est aussi plus simple pour vous : un seul interlocuteur, une seule préparation, une histoire qui se déroule naturellement.",
        ] },
        { h: "Pour qui, et dans quel cadre", p: [
          "Seule, en couple ou avec les aînés : la séance s'adapte à votre famille et à votre énergie du moment. On privilégie la lumière naturelle, à votre rythme, sans rien forcer. Tout est pensé pour le confort de la future maman comme du bébé.",
        ] },
        { h: "Réussir la séance nouveau-né : ce qui aide vraiment", list: [
          "Un bébé repu et détendu : on cale souvent la séance juste après une tétée ou un biberon, le matin de préférence.",
          "Une pièce bien chauffée (autour de 25-26 °C) : la chaleur favorise le sommeil et les poses lovées.",
          "Du temps et de la patience : une séance nouveau-né ne se précipite jamais, on suit le rythme du bébé.",
          "Un léger bruit blanc et une lumière douce : de quoi rassurer et apaiser.",
          "Aucune pose acrobatique : sécurité et confort d'abord, toujours.",
        ] },
        { h: "Et si bébé arrive plus tôt que prévu ?", p: [
          "C'est tout l'intérêt d'avoir réservé pendant la grossesse : on s'adapte. La séance nouveau-né n'est pas figée à une date précise mais à une fenêtre — idéalement les dix à quinze premiers jours. Vous me prévenez à la naissance, et on fixe le créneau dans la foulée.",
          "Cette souplesse vous enlève une charge mentale : tout est prévu à l'avance, il ne reste qu'à accueillir votre bébé et à profiter.",
        ] },
      ],
      closing: "Envie de relier l'attente et l'arrivée dans une même histoire ? Parlons-en pendant votre grossesse : on organise tout à l'avance, vous n'avez plus qu'à savourer.",
    },

    /* ============ ARTICLE — PHOTOS LINKEDIN / PERSONAL BRANDING ============ */
    "photos-linkedin-personal-branding": {
      slug: "photos-linkedin-personal-branding",
      file: "journal-photos-linkedin-personal-branding.html",
      category: "Studio",
      relatedSlug: "studio", relatedHref: "studio.html", relatedTitle: "Studio",
      date: "2026-05-22", dateLabel: "22 mai 2026", read: "6 min",
      title: "Réussir ses photos LinkedIn et personal branding",
      hero: "Portrait corporate en studio, fond sobre, lumière maîtrisée",
      heroAlt: "Photos LinkedIn et personal branding en studio à Lausanne et Genève | Kevin Chinelli",
      excerpt: "Votre photo de profil est votre première poignée de main. Voici comment réussir vos portraits LinkedIn et personal branding : tenue, fond, expression et usages.",
      metaTitle: "Photos LinkedIn & personal branding : le guide | Kevin Chinelli",
      metaDesc: "Réussir ses photos LinkedIn et de personal branding : tenue, fond, expression, studio ou extérieur. Conseils d'un photographe à Lausanne et Genève.",
      intro: "Sur LinkedIn comme sur un site, votre portrait est votre première poignée de main — celle qui se joue avant le moindre échange. Une bonne photo professionnelle inspire confiance, crédibilise votre discours et vous distingue. Voici comment la réussir.",
      sections: [
        { h: "Pourquoi votre photo compte plus que vous ne le pensez", p: [
          "On se fait une opinion en une fraction de seconde. Un portrait net, bien éclairé et cohérent avec votre métier envoie un signal clair de sérieux et de soin. À l'inverse, une photo de vacances recadrée ou un selfie flou dessert un profil par ailleurs solide.",
          "Pour les indépendants, dirigeants et équipes, c'est un investissement à fort rendement : une image, déclinée partout, qui travaille pour vous en continu.",
        ] },
        { h: "Tenue, fond, expression : les bons réglages", list: [
          "La tenue : fidèle à votre quotidien professionnel, dans des coupes nettes et des couleurs unies. On évite les motifs serrés et les logos voyants.",
          "Le fond : neutre et sobre pour un rendu corporate intemporel, ou un environnement choisi (bureau, atelier) pour une image plus incarnée.",
          "L'expression : ni figée ni forcée. Je dirige pas à pas pour obtenir un regard franc et un sourire naturel — même si vous n'êtes pas à l'aise devant l'objectif.",
          "Le cadrage : plusieurs formats (serré pour l'avatar, plus large pour le web) pour couvrir tous vos usages.",
        ] },
        { h: "Studio ou extérieur ?", p: [
          "Le [studio](studio.html) offre un cadre maîtrisé et reproductible — parfait quand il faut une cohérence visuelle entre plusieurs personnes d'une même équipe, ou des images calibrées pour un site et la presse. L'extérieur, lui, apporte une touche plus vivante et personnelle, idéale pour le personal branding d'un indépendant.",
          "Pour une entreprise ou une équipe, je réalise ces portraits avec [Snapshot Media](https://snapshotmedia.ch/services/photographie/portraits-professionnels/), mon studio pour les professionnels : un studio mobile installé dans vos locaux, pour photographier toute l'équipe sur place.",
        ] },
        { h: "Penser tous les usages", p: [
          "Une bonne séance ne sert pas qu'à LinkedIn : site internet, signature mail, dossier de presse, supports imprimés, intervention en conférence… On anticipe ces usages pour repartir avec des images aux bons formats et aux bons droits.",
        ] },
        { h: "Les erreurs les plus fréquentes", list: [
          "Le selfie ou la photo de vacances recadrée : ça se voit, et ça dessert un profil par ailleurs sérieux.",
          "Un fond chargé ou un lieu qui détourne l'attention de votre visage.",
          "Un sourire forcé ou une posture raide : mieux vaut un regard franc et posé qu'un rictus de circonstance.",
          "Une photo trop ancienne qui ne vous ressemble plus : elle crée un décalage dès la première rencontre.",
          "Des formats inadaptés : une image pensée pour l'avatar carré de LinkedIn ne conviendra pas telle quelle à une bannière ou à la presse.",
        ] },
        { h: "Photo d'équipe : viser la cohérence", p: [
          "Pour une équipe, la règle d'or est l'homogénéité : même fond, même lumière, même cadrage et même style de retouche pour tout le monde. C'est ce qui distingue une page « Équipe » professionnelle d'une mosaïque de photos disparates prises au fil des années.",
          "En pratique, je me déplace avec un studio mobile dans vos locaux à Lausanne, Genève ou ailleurs en Suisse romande. On photographie toute l'équipe sur place en une demi-journée, sans déplacement ni perte de temps, et les nouveaux arrivants peuvent être ajoutés plus tard dans le même style.",
        ] },
      ],
      closing: "Besoin d'un portrait professionnel qui vous ressemble, ou de mettre à niveau les photos de votre équipe ? Parlons de votre image et de l'usage que vous en ferez.",
    },

    /* ============ ARTICLE — QUELLE TENUE PORTRAIT ============ */
    "quelle-tenue-seance-portrait": {
      slug: "quelle-tenue-seance-portrait",
      file: "journal-quelle-tenue-seance-portrait.html",
      category: "Portrait",
      relatedSlug: "portrait", relatedHref: "portraits.html", relatedTitle: "Lifestyle",
      date: "2026-05-15", dateLabel: "15 mai 2026", read: "5 min",
      title: "Quelle tenue porter pour une séance portrait ?",
      hero: "Portrait en lumière naturelle, tenue épurée aux tons neutres",
      heroAlt: "Quelle tenue pour une séance portrait en Suisse romande | Kevin Chinelli",
      excerpt: "Tons neutres, matières qui tombent bien, deux options plutôt que dix : mes repères simples pour choisir vos tenues et arriver serein·e à votre séance portrait.",
      metaTitle: "Quelle tenue pour une séance portrait ? | Kevin Chinelli",
      metaDesc: "Quelle tenue pour une séance photo portrait ? Couleurs, matières, coupes qui flattent à l'image : les conseils d'un photographe à Lausanne et Genève.",
      intro: "« Je ne sais pas quoi mettre. » C'est le petit stress d'avant-séance le plus répandu — et le plus facile à lever. La règle d'or tient en une phrase : une tenue qui vous ressemble et dans laquelle vous vous sentez bien sera toujours plus belle qu'une tenue « pour la photo ». Voici mes repères.",
      sections: [
        { h: "Misez sur la simplicité", p: [
          "Les portraits qui traversent le temps reposent presque toujours sur des tenues sobres. On cherche à mettre votre visage et votre regard en avant — pas à les concurrencer. Les couleurs unies, les coupes nettes et les matières qui tombent bien font 90 % du travail.",
        ] },
        { h: "Couleurs et matières qui rendent le mieux", list: [
          "Les tons neutres et naturels : crème, beige, camel, bleu nuit, vert sauge, gris doux, bordeaux.",
          "Les matières qui ont du tombé : laine fine, coton épais, lin, maille souple — elles structurent la silhouette.",
          "Une touche d'accessoire discret (montre, foulard, bijou simple) pour personnaliser sans surcharger.",
          "À éviter : motifs serrés, rayures fines (qui moirent à l'image), logos voyants, néons et le total blanc en plein soleil.",
        ] },
        { h: "Prévoir deux options, pas dix", p: [
          "Inutile de vider la penderie. Deux tenues bien choisies suffisent généralement : une plus habillée, une plus décontractée, pour varier les ambiances sans perdre de temps à se changer. Si la séance se fait en plusieurs lieux, on en profite pour alterner.",
          "Je vous conseille toujours en amont selon le cadre et l'usage de vos images. C'est inclus dans chaque [séance portrait](portraits.html).",
        ] },
        { h: "Les détails qui font la différence", p: [
          "Pensez à la cohérence : si vous êtes photographié·e en couple, en famille ou en équipe, coordonnez les tons sans tomber dans l'uniforme assorti. Repassez vos vêtements, vérifiez les ourlets, et prévoyez des chaussures confortables si l'on marche entre deux décors.",
          "Et surtout : venez reposé·e. La meilleure tenue, c'est encore un visage détendu.",
        ] },
        { h: "Adapter la tenue à l'usage des images", p: [
          "Une même personne ne s'habille pas pareil selon ce que les photos serviront. Pour un usage professionnel (LinkedIn, site, presse), on vise des coupes nettes fidèles à votre quotidien de travail. Pour un portrait personnel ou artistique, on s'autorise plus de matière, de couleur et de caractère.",
          "Le bon réflexe : me dire en amont à quoi serviront vos images. C'est ce qui me permet de vous conseiller des tenues vraiment adaptées, et pas seulement « jolies ».",
        ] },
        { h: "La veille et le jour J", list: [
          "Repassez vos tenues et vérifiez les ourlets, boutons et cols : à l'image, le moindre faux pli se voit.",
          "Évitez d'étrenner un vêtement neuf et inconfortable : on est toujours plus beau dans ce qu'on porte avec aisance.",
          "Dormez et hydratez-vous : un visage reposé vaut toutes les tenues du monde.",
          "Prévoyez vos accessoires (montre, bijoux simples, foulard) et, si besoin, de quoi vous changer entre deux ambiances.",
        ] },
      ],
      closing: "Une fois la tenue choisie, le plus dur est fait. Le reste, c'est mon métier : je vous guide pas à pas pour des images dans lesquelles vous vous reconnaissez vraiment.",
    },

    /* ============ ARTICLE — CHOISIR SON PHOTOGRAPHE MARIAGE ============ */
    "comment-choisir-photographe-mariage": {
      slug: "comment-choisir-photographe-mariage",
      file: "journal-comment-choisir-photographe-mariage.html",
      category: "Mariage",
      relatedSlug: "mariage", relatedHref: "mariages.html", relatedTitle: "Mariages",
      date: "2026-05-08", dateLabel: "8 mai 2026", read: "5 min",
      title: "Comment choisir son photographe de mariage : 7 questions à poser",
      hero: "Photographe en reportage discret pendant une cérémonie",
      heroAlt: "Comment choisir son photographe de mariage en Suisse romande | Kevin Chinelli",
      excerpt: "Au-delà du style et du prix, sept questions concrètes pour choisir le bon photographe de mariage en Suisse romande — et éviter les mauvaises surprises le jour J.",
      metaTitle: "Comment choisir son photographe de mariage : 7 questions | Kevin Chinelli",
      metaDesc: "Bien choisir son photographe de mariage en Suisse romande : style, livrables, sauvegardes, déroulé. Les 7 questions à poser avant de réserver.",
      intro: "Le style des images compte, évidemment. Mais derrière une belle galerie se cachent des questions plus terre à terre qui font, le jour J, toute la différence entre un mariage serein et une journée sous tension. Voici les sept que je vous encourage à poser à tout photographe — moi compris.",
      sections: [
        { h: "Le style et l'approche", p: [
          "Première chose : aimez-vous l'ensemble de son travail, pas seulement trois images ? Demandez à voir un mariage complet, du matin au soir. Le style reportage, discret et proche de l'émotion, ne ressemble pas à un mariage très posé et dirigé — les deux sont valables, mais il faut savoir ce que vous cherchez.",
          "Demandez aussi comment il travaille le jour J : présence en retrait ou mise en scène, lumière naturelle ou flash, temps consacré au couple. C'est ce que je détaille pour chaque [reportage de mariage](mariages.html).",
        ] },
        { h: "Les 7 questions à poser", list: [
          "Réservez-vous plusieurs mariages le même jour ? (La bonne réponse est non.)",
          "Travaillez-vous avec un second boîtier et une double sauvegarde des fichiers ?",
          "Combien de photos recevrons-nous, et sous quel délai ?",
          "Les images sont-elles toutes retouchées, et par vous ?",
          "Que se passe-t-il en cas d'imprévu (maladie, météo) ? Avez-vous un photographe de secours ?",
          "Qu'est-ce qui est inclus exactement, et qu'est-ce qui est en option (album, tirages, déplacements) ?",
          "Comment se passe le paiement, et quand le solde est-il dû ?",
        ] },
        { h: "Les réponses qui rassurent", p: [
          "Un photographe sérieux vous répondra sans détour : un seul mariage par jour, du matériel doublé, des sauvegardes sécurisées, des images toutes retouchées de sa main, un contrat clair. Chez moi, le solde n'est réglé que 10 jours après le mariage — une façon de partager la confiance.",
          "Méfiez-vous des réponses floues ou des devis sans détail : c'est souvent là que se nichent les mauvaises surprises.",
        ] },
        { h: "Le courant doit passer", p: [
          "Enfin, fiez-vous au feeling. Votre photographe vous suivra dans les moments les plus intimes de la journée : il faut vous sentir à l'aise avec lui. Un appel ou un café avant de signer en dit souvent plus long qu'un portfolio.",
        ] },
        { h: "Les signaux qui doivent vous alerter", list: [
          "Pas de contrat écrit, ou un devis vague qui ne détaille pas ce qui est inclus.",
          "Un portfolio qui ne montre que des « best of » — jamais un mariage entier, du matin au soir.",
          "Un prix anormalement bas par rapport au marché romand : il cache souvent un manque d'expérience ou de garanties.",
          "Aucune mention de sauvegarde des fichiers ni de matériel de secours en cas de panne.",
          "Des réponses lentes ou évasives avant même la réservation — un avant-goût de ce qui vous attendrait ensuite.",
        ] },
        { h: "Vérifier au-delà du portfolio", p: [
          "Un beau portfolio est un minimum, pas une garantie. Demandez à voir une galerie de mariage complète, lisez les avis (Google, réseaux sociaux), et assurez-vous qu'un contrat écrit précise noir sur blanc les prestations, les délais et les modalités d'annulation.",
          "Vérifiez aussi deux choses qu'on oublie souvent : la disponibilité réelle sur votre date, et la présence d'une assurance responsabilité civile professionnelle. Ce sont des marques de sérieux discrètes, mais qui font toute la différence le jour J.",
        ] },
      ],
      closing: "Vous avez ces questions en tête ? Posez-les moi sans hésiter. J'aime que mes mariés réservent en confiance, en sachant exactement à quoi s'attendre.",
    },

    /* ============ ARTICLE — STUDIO OU EXTÉRIEUR ============ */
    "portrait-studio-ou-exterieur": {
      slug: "portrait-studio-ou-exterieur",
      file: "journal-portrait-studio-ou-exterieur.html",
      category: "Portrait",
      relatedSlug: "portrait", relatedHref: "portraits.html", relatedTitle: "Lifestyle",
      date: "2026-05-02", dateLabel: "2 mai 2026", read: "5 min",
      title: "Portrait en studio ou en extérieur : lequel choisir ?",
      hero: "Diptyque portrait — studio fond sobre et lumière naturelle extérieure",
      heroAlt: "Portrait en studio ou en extérieur en Suisse romande | Kevin Chinelli",
      excerpt: "Cadre maîtrisé ou lumière vivante ? Studio et extérieur ne racontent pas la même chose. Voici comment choisir selon l'usage de vos images et l'effet recherché.",
      metaTitle: "Portrait en studio ou en extérieur : comment choisir | Kevin Chinelli",
      metaDesc: "Studio ou extérieur pour votre séance portrait ? Les avantages de chaque option selon l'usage des images. Conseils d'un photographe en Suisse romande.",
      intro: "C'est une question qui revient à chaque prise de contact : « plutôt studio ou plutôt extérieur ? » Les deux donnent de superbes images — mais pas le même type d'images. Tout dépend de l'effet recherché et de l'usage que vous ferez de vos portraits.",
      sections: [
        { h: "Le studio : maîtrise et intemporalité", p: [
          "En [studio](studio.html), tout est dirigé : la lumière, le fond, la posture, l'expression. Le rendu est net, élégant, reproductible — idéal pour un portrait éditorial, un book d'artiste ou une image d'auteur. Le fond neutre concentre l'attention sur le visage, et le résultat ne se démode pas.",
          "C'est aussi l'option la plus confortable par mauvais temps ou en hiver, puisqu'on ne dépend pas de la météo.",
        ] },
        { h: "L'extérieur : lumière vivante et personnalité", p: [
          "Dehors, la lumière naturelle et le décor apportent de la vie et de l'air. Un quai du Léman, une ruelle de la vieille ville, une forêt ou un lieu qui compte pour vous : le cadre raconte quelque chose de vous. Le rendu est plus spontané, plus personnel — parfait pour un portrait individuel, du personal branding ou des images artistiques.",
          "L'extérieur demande un peu plus de souplesse (heure de la lumière, météo), mais offre une variété d'ambiances qu'un studio ne reproduit pas.",
        ] },
        { h: "Comment trancher", list: [
          "Usage corporate ou photos d'équipe cohérentes → studio.",
          "Portrait personnel, artistique ou personal branding → extérieur (ou un mélange).",
          "Besoin d'un rendu garanti quelle que soit la météo → studio.",
          "Envie d'un décor qui vous ressemble et d'une lumière naturelle → extérieur.",
        ] },
        { h: "Et pourquoi pas les deux", p: [
          "Rien n'oblige à choisir radicalement. Sur certaines séances, on combine un passage en lumière naturelle et quelques images plus maîtrisées, pour couvrir tous vos usages. On en parle avant la séance, selon ce que vous voulez en faire — c'est ce que je fais pour chaque [séance portrait](portraits.html).",
        ] },
        { h: "La lumière : la vraie différence", p: [
          "Tout se joue souvent là. En studio, la lumière est maîtrisée et identique du matin au soir, été comme hiver : un avantage décisif quand il faut un rendu constant et reproductible, ou quand on photographie plusieurs personnes dans le même style.",
          "En extérieur, on dépend de la lumière du jour — et c'est aussi sa magie. L'heure dorée, juste avant le coucher du soleil, donne des images chaudes et enveloppantes qu'aucun studio ne reproduit tout à fait. La contrepartie : un peu de souplesse sur l'horaire et un plan B en cas de météo capricieuse.",
        ] },
        { h: "Le facteur confort, souvent décisif", p: [
          "Au-delà du rendu, demandez-vous où vous vous sentirez le plus à l'aise. Certaines personnes se détendent en marchant et en discutant dehors, loin de toute mise en scène ; d'autres sont rassurées par le cadre clair et contenu d'un studio, sans regards extérieurs.",
          "Il n'y a pas de mauvaise réponse : la meilleure option est celle où vous oublierez le plus vite l'appareil. C'est précisément ce qu'on définit ensemble avant la séance.",
        ] },
      ],
      closing: "Toujours hésitant·e ? Dites-moi simplement à quoi serviront vos images : je vous oriente vers le cadre qui leur rendra le mieux justice.",
    },

    /* ============ ARTICLE — DÉROULÉ JOURNÉE MARIAGE ============ */
    "deroule-journee-mariage": {
      slug: "deroule-journee-mariage",
      file: "journal-deroule-journee-mariage.html",
      category: "Mariage",
      relatedSlug: "mariage", relatedHref: "mariages.html", relatedTitle: "Mariages",
      date: "2026-04-25", dateLabel: "25 avril 2026", read: "6 min",
      title: "Le déroulé d'un mariage, heure par heure (côté photo)",
      hero: "Première danse des mariés en début de soirée",
      heroAlt: "Déroulé d'une journée de mariage heure par heure | Kevin Chinelli",
      excerpt: "Des préparatifs à la piste de danse : comment s'enchaîne une journée de mariage côté photo, et comment caler le timing pour ne rien manquer de la lumière ni de l'émotion.",
      metaTitle: "Déroulé d'un mariage heure par heure (côté photo) | Kevin Chinelli",
      metaDesc: "Le déroulé d'une journée de mariage côté photo : préparatifs, cérémonie, couple à l'heure dorée, soirée. Le guide pour caler le timing en Suisse romande.",
      intro: "Un mariage réussi en photo, c'est d'abord un déroulé bien pensé. Pas pour transformer votre journée en planning militaire — au contraire, pour vous libérer l'esprit et garantir que les moments forts tombent au bon moment, dans la bonne lumière. Voici comment s'enchaîne une journée type, côté photo.",
      sections: [
        { h: "Matin — les préparatifs", p: [
          "C'est là que tout commence, dans une ambiance intime et fébrile. J'arrive en général pendant les derniers préparatifs : les détails (robe, bague, parfum, lettres), les gestes des proches, la tension douce qui monte. Prévoyez une pièce avec de la lumière naturelle et un peu de rangement — ça change tout à l'image.",
          "Comptez environ 1 h à 1 h 30 sur cette étape, selon que je couvre un ou deux préparatifs.",
        ] },
        { h: "Cérémonie et félicitations", p: [
          "Le cœur émotionnel de la journée. Je me place discrètement pour saisir les regards, les larmes, les sourires — sans jamais m'interposer. Juste après vient le moment des félicitations : une mine d'émotions spontanées et de retrouvailles, que je photographie au fil de l'eau.",
          "Un conseil : prévoyez un temps de battement après la cérémonie. C'est souvent là qu'on glisse les photos de groupe et de famille, sans courir.",
        ] },
        { h: "Cocktail, photos de groupe et couple", list: [
          "L'apéritif : moment détendu, parfait pour des images d'ambiance pendant que vous profitez de vos invités.",
          "Les photos de groupe : efficaces si la liste est préparée à l'avance (comptez 20 à 30 minutes).",
          "La séance de couple : 30 à 45 minutes, idéalement calées sur l'heure dorée, juste avant le coucher du soleil. C'est souvent votre seule vraie parenthèse à deux de la journée.",
        ] },
        { h: "Soirée — entrée, repas et danse", p: [
          "Entrée des mariés, discours, première danse puis ouverture de la piste : l'énergie monte d'un cran. Je reste jusqu'au lancement de la fête pour capter ces premiers instants de soirée, souvent les plus joyeux.",
          "Pensez à l'heure du coucher du soleil pour caler les temps forts extérieurs : je la vérifie systématiquement pour votre date et j'adapte le déroulé du [reportage](mariages.html) en conséquence.",
        ] },
        { h: "Un exemple de timing (cérémonie à 15 h, mariage d'été)", list: [
          "13 h 00 — Préparatifs : détails, habillage, derniers instants avec les proches.",
          "14 h 30 — Trajet et premières arrivées des invités sur le lieu.",
          "15 h 00 — Cérémonie, puis sortie et félicitations.",
          "16 h 00 — Vin d'honneur, photos de groupe (liste préparée) et instants d'ambiance.",
          "18 h 00 — Photos de groupe terminées : on respire et on profite.",
          "20 h 30 — Séance de couple à l'heure dorée, 30 à 45 minutes.",
          "21 h 00 — Entrée des mariés, repas et discours.",
          "23 h 00 — Première danse et ouverture de la piste.",
        ] },
        { h: "Les erreurs de timing qui coûtent de belles images", list: [
          "Caler la cérémonie en plein midi l'été : lumière dure, yeux plissés, ombres marquées sur les visages.",
          "Oublier l'heure dorée : sans créneau réservé pour le couple en fin de journée, on passe à côté des plus belles lumières.",
          "Sous-estimer les photos de groupe : sans liste préparée à l'avance, elles s'éternisent et grignotent le reste.",
          "Enchaîner sans aucune marge : le moindre retard se répercute en cascade sur toute la soirée.",
          "Placer les discours trop tard : la lumière baisse, l'attention des invités aussi.",
        ] },
      ],
      closing: "Pas d'inquiétude si tout cela vous semble abstrait : on construit votre déroulé ensemble, lieu et horaires en main. Le jour J, vous n'aurez plus qu'à vivre votre mariage.",
    },

    /* ============ ARTICLE — OÙ SE MARIER À GENÈVE ============ */
    "ou-se-marier-geneve": {
      slug: "ou-se-marier-geneve",
      file: "journal-ou-se-marier-geneve.html",
      category: "Mariage",
      relatedSlug: "mariage", relatedHref: "mariages.html", relatedTitle: "Mariages",
      date: "2026-06-27", dateLabel: "27 juin 2026", read: "5 min",
      title: "Où se marier à Genève : lieux et décors de rêve",
      hero: "Quai de Genève au coucher du soleil, jet d'eau et lac",
      heroAlt: "Où se marier à Genève — lieux de mariage et spots photo au bord du lac | Kevin Chinelli",
      excerpt: "De la vieille ville aux domaines viticoles de la campagne genevoise, en passant par les quais et les parcs du bord du lac : un tour d'horizon des plus beaux lieux pour se marier à Genève, par un photographe.",
      metaTitle: "Où se marier à Genève : lieux de rêve et spots photo | Kevin Chinelli",
      metaDesc: "Les plus beaux lieux pour se marier à Genève : vieille ville, parcs au bord du lac, domaines viticoles genevois. Le guide d'un photographe de mariage.",
      intro: "Entre son lac, sa vieille ville médiévale et une campagne viticole méconnue, Genève offre une vraie diversité de décors pour un mariage. Que vous rêviez d'une cérémonie urbaine et chic ou d'une fête champêtre face aux vignes, voici les lieux que je recommande, avec un œil de photographe sur la lumière et les angles.",
      sections: [
        { h: "Au bord du lac et dans les parcs", list: [
          "Le Parc des Eaux-Vives et La Perle du Lac — élégance classique, pelouses, vue sur la rade et le jet d'eau.",
          "Le Parc La Grange et sa roseraie — sublime en début d'été, parfait pour la séance de couple.",
          "Les Bains des Pâquis — plus décontracté et iconique, superbe à la lumière du matin.",
          "Le Jardin Anglais et les quais — pour des images avec le jet d'eau et l'horloge fleurie en toile de fond.",
        ] },
        { h: "Dans la vieille ville", p: [
          "Le cœur historique de Genève est un décor à lui tout seul : la cathédrale Saint-Pierre, la place du Bourg-de-Four, la promenade de la Treille et ses marronniers, les ruelles pavées et les façades anciennes. C'est l'idéal pour une cérémonie civile élégante suivie d'une courte séance à deux, sans avoir à se déplacer loin.",
          "Avantage photo : on y trouve toujours un coin d'ombre douce en plein été et des arrière-plans intemporels qui ne datent pas une image.",
        ] },
        { h: "Les domaines et vignobles de la campagne genevoise", p: [
          "On l'oublie souvent, mais Genève est le troisième canton viticole de Suisse. Sa campagne — Satigny, Dardagny, Russin, Choully, la Champagne genevoise — abrite domaines, mas et terrasses face aux vignes, à vingt minutes du centre. C'est le choix parfait pour un mariage champêtre, chaleureux et photogénique au coucher du soleil.",
          "Ces lieux offrent souvent l'intérieur et l'extérieur sur place, un vrai atout pour un plan B en cas de pluie ou de bise.",
        ] },
        { h: "Mes conseils de photographe à Genève", p: [
          "Anticipez la logistique urbaine. En ville, le stationnement et les déplacements entre la mairie, le lieu de cérémonie et la réception se préparent : prévoyez des marges réalistes dans le déroulé.",
          "Renseignez-vous sur les autorisations. Certains parcs genevois demandent une autorisation pour une cérémonie ou une séance organisée — un point à valider tôt avec le lieu ou la Ville.",
          "Réservez l'heure dorée. Quel que soit le décor, je garde 30 à 45 minutes pour le couple en fin de journée : c'est là que Genève, lac et lumière réunis, donne le meilleur. Je cale tout le [reportage](mariages.html) sur ce moment.",
        ] },
        { h: "Où faire les photos de couple à Genève", list: [
          "Les quais et le Jardin Anglais — pour une image iconique avec le jet d'eau.",
          "La promenade de la Treille et le Bourg-de-Four — pour le charme de la vieille ville.",
          "Le Parc La Grange ou des Eaux-Vives — verdure et calme en pleine ville.",
          "Les vignes de Satigny ou Dardagny — pour une parenthèse champêtre à l'heure dorée.",
        ] },
      ],
      closing: "Vous vous mariez à Genève ou dans sa région ? Je m'y déplace sans frais depuis la Suisse romande et j'en connais bien la lumière. Parlons de votre lieu et de votre date.",
    },

    /* ============ ARTICLE — SPOTS SÉANCE PHOTO LAUSANNE ============ */
    "spots-seance-photo-lausanne": {
      slug: "spots-seance-photo-lausanne",
      file: "journal-spots-seance-photo-lausanne.html",
      category: "Portrait",
      relatedSlug: "portrait", relatedHref: "portraits.html", relatedTitle: "Lifestyle",
      date: "2026-06-26", dateLabel: "26 juin 2026", read: "5 min",
      title: "Les plus beaux endroits pour une séance photo à Lausanne",
      hero: "Quais d'Ouchy à Lausanne, lumière douce de fin de journée",
      heroAlt: "Spots pour une séance photo à Lausanne — quais d'Ouchy et vieille ville | Kevin Chinelli",
      excerpt: "Ouchy, la vieille ville, le Flon, Sauvabelin : mes lieux préférés pour une séance portrait, couple ou famille à Lausanne, du plus urbain au plus nature, avec l'heure qui leur va le mieux.",
      metaTitle: "Où faire une séance photo à Lausanne : mes spots préférés | Kevin Chinelli",
      metaDesc: "Les plus beaux endroits pour une séance photo à Lausanne : Ouchy, vieille ville, Flon, Sauvabelin. Conseils de lumière et d'horaire d'un photographe local.",
      intro: "Lausanne est une ville de contrastes : un bord de lac méridional à Ouchy, une vieille ville médiévale tout en escaliers, un quartier du Flon résolument urbain, et des forêts à dix minutes du centre. De quoi varier les ambiances d'une séance sans jamais s'éloigner. Voici mes lieux de prédilection.",
      sections: [
        { h: "Au bord du lac, à Ouchy", p: [
          "Les quais d'Ouchy, le port et la promenade jusqu'à Vidy offrent une lumière douce et de grands espaces ouverts sur le lac et les Alpes. C'est l'endroit idéal pour une séance détendue, où l'on marche et où l'appareil se fait vite oublier — parfait pour les couples et les familles.",
          "À privilégier tôt le matin pour le calme, ou à l'heure dorée pour les couleurs chaudes sur l'eau.",
        ] },
        { h: "Dans la vieille ville et au centre", list: [
          "Les escaliers du Marché et la place de la Palud — ruelles pavées, façades anciennes, ambiance intime.",
          "Les abords de la cathédrale et l'esplanade de Montbenon — belle vue sur le lac et les Alpes.",
          "Le quartier du Flon — béton, passerelles et lumières urbaines pour un rendu plus moderne et éditorial.",
        ] },
        { h: "Côté nature, à deux pas du centre", p: [
          "Pour une ambiance plus verte, le parc de Mon-Repos, les bords de la Sorge ou la forêt et le lac de Sauvabelin (avec sa tour en bois) offrent une parenthèse nature sans quitter la ville. Idéal pour des portraits doux en lumière filtrée, ou une séance famille où les enfants peuvent bouger librement.",
          "Et si vous aimez les vignes, Lavaux est à quinze minutes : on peut prolonger la séance au milieu des terrasses, face au Léman.",
        ] },
        { h: "Bien choisir son moment", p: [
          "L'heure dorée, juste avant le coucher du soleil, reste la valeur sûre : lumière chaude et ombres douces. La lumière du matin, plus fraîche, est parfaite pour éviter le monde sur les quais.",
          "On évite le plein midi en été, dur et peu flatteur. Je conseille et prépare tout cela avant chaque [séance portrait](portraits.html), selon l'usage que vous ferez de vos images.",
        ] },
        { h: "Pour quel type de séance ?", p: [
          "Ces décors conviennent à toutes les séances : un portrait personnel ou pour votre image professionnelle, une séance de couple ou de fiançailles, une séance en famille, ou encore des photos de grossesse en lumière douce. On choisit le lieu selon l'ambiance recherchée et l'usage final de vos images.",
          "Pour une séance en famille, je privilégie les endroits où les enfants peuvent bouger librement — Ouchy, Sauvabelin ou un parc — pour des images vivantes plutôt que figées.",
        ] },
      ],
      closing: "Envie d'une séance qui vous ressemble à Lausanne ? On choisit ensemble le lieu, l'ambiance et l'heure — et je vous guide pas à pas le jour J pour des images naturelles.",
    },

    /* ============ ARTICLE — LIEUX MARIAGE LA CÔTE ============ */
    "lieux-mariage-la-cote": {
      slug: "lieux-mariage-la-cote",
      file: "journal-lieux-mariage-la-cote.html",
      category: "Mariage",
      relatedSlug: "mariage", relatedHref: "mariages.html", relatedTitle: "Mariages",
      date: "2026-06-25", dateLabel: "25 juin 2026", read: "5 min",
      title: "Se marier sur La Côte : châteaux, vignes et bord du lac",
      hero: "Vignoble de La Côte vaudoise face au lac Léman et au Mont-Blanc",
      heroAlt: "Lieux de mariage sur La Côte — Nyon, Morges, domaines viticoles | Kevin Chinelli",
      excerpt: "Entre Lausanne et Genève, La Côte aligne châteaux, domaines viticoles et quais face au Mont-Blanc. Un tour d'horizon des plus beaux lieux pour s'y marier, vus par un photographe.",
      metaTitle: "Se marier sur La Côte (Nyon, Morges) : les plus beaux lieux | Kevin Chinelli",
      metaDesc: "Se marier sur La Côte vaudoise : châteaux de Nyon et Morges, domaines de Féchy à Mont-sur-Rolle, quais face au Mont-Blanc. Le guide d'un photographe.",
      intro: "Entre Lausanne et Genève, La Côte s'étire le long du Léman, face au Mont-Blanc. C'est le plus grand vignoble du canton de Vaud, parsemé de châteaux et de villages au bord de l'eau. Un décor à la fois noble et champêtre, encore un peu confidentiel pour les mariages. Voici mes lieux préférés, avec un œil de photographe.",
      sections: [
        { h: "Les châteaux de caractère", list: [
          "Le château de Nyon — dominant le lac et les quais, médiéval et photogénique, avec une vue imprenable sur le Mont-Blanc.",
          "Le château de Morges et le parc de l'Indépendance — élégance et grands espaces, sublimes au printemps avec la Fête de la Tulipe.",
          "Les châteaux de Vufflens, d'Allaman et de Coppet — silhouettes de caractère pour un mariage hors du temps.",
        ] },
        { h: "Les domaines viticoles face au lac", p: [
          "La Côte, c'est avant tout le vignoble : Féchy, Mont-sur-Rolle, Aubonne, Begnins, Vinzel, Luins… Des domaines avec caveaux, terrasses et rangs de vignes qui descendent vers le lac, avec le Mont-Blanc en toile de fond. C'est le choix idéal pour un mariage chaleureux, vigneron, magnifique à la lumière de fin de journée.",
          "Atout pratique : beaucoup de ces domaines proposent l'intérieur et l'extérieur sur un même site — précieux pour un plan B météo.",
        ] },
        { h: "Au bord du lac", list: [
          "Les quais de Nyon — vue dégagée sur le Mont-Blanc, parfaits pour la séance de couple au coucher du soleil.",
          "Rolle et son île de la Harpe — petit port romantique au charme rare.",
          "Saint-Prex et Morges — bourgs médiévaux et rives paisibles, belles lumières le matin comme le soir.",
        ] },
        { h: "Mes conseils de photographe sur La Côte", p: [
          "Profitez de la vue sur le Mont-Blanc. Elle est l'atout signature de La Côte : je cale la séance de couple en fin de journée, quand la lumière dore les vignes et que le massif rougit à l'horizon.",
          "Pensez aux distances. Les domaines sont parfois un peu à l'écart des villages : prévoyez les trajets et le stationnement des invités, surtout entre la cérémonie et la réception.",
          "Gardez un plan B. La bise et les ciels changeants du lac font partie du décor — on prévoit toujours une alternative couverte au repérage, pour le [reportage](mariages.html) comme pour la séance.",
        ] },
        { h: "Quand s'y marier : saisons et lumière", p: [
          "Le printemps habille Morges de tulipes et la campagne de vert tendre ; l'été baigne les vignes d'une lumière dorée jusque tard le soir ; l'automne, période des vendanges, pare les coteaux de cuivre et d'or — sans doute la plus belle saison photo de La Côte.",
          "Quelle que soit la saison, la vue sur le Mont-Blanc et le lac reste l'atout maître : on cale les temps forts en extérieur sur la fin de journée pour en profiter pleinement.",
        ] },
      ],
      closing: "Un mariage sur La Côte, entre vignes et Mont-Blanc ? Je connais bien la région et m'y déplace sans frais depuis la Suisse romande. Parlons de votre projet et de votre date.",
    },
  },
};

;
(()=>{const J=window.KC_JOURNAL;function JournalApp(){const[t,setTweak]=useTweaks({palette:KC.PALETTES["Noir chaud"],heading:"Cinzel",body:"Jost"});useApplyTweaks(t),useReveal([]);const arts=J.order.map(s=>J.articles[s]);return React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,{active:"journal"}),React.createElement("main",null,React.createElement("section",{className:"sec s-dark pf-head"},React.createElement("div",{className:"wrap"},React.createElement("h1",{className:"h1-stack"},React.createElement("span",{className:"overline reveal"},React.createElement("span",{className:"tick"}),"Conseils photo et lieux en Suisse romande")," ",React.createElement("span",{className:"display h1-big reveal d1"},"Le journal.")),React.createElement("p",{className:"reveal d1"},J.meta.intro))),React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{className:"journal-list"},arts.map((a,i)=>React.createElement("a",{key:a.slug,href:a.file,className:"jl-card reveal d"+(i%3+1)},React.createElement("div",{className:"jl-img"},React.createElement(Slot,{id:"art-hero-"+a.slug,ph:a.hero,alt:a.heroAlt,style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"jl-body"},React.createElement("div",{className:"jl-meta"},React.createElement("span",{className:"jl-cat"},a.category),React.createElement("span",{className:"jl-dot"},"\xB7"),React.createElement("span",null,a.read," de lecture")),React.createElement("h2",null,a.title),React.createElement("p",null,a.excerpt),React.createElement("span",{className:"link-arrow"},"Lire l'article ",React.createElement("span",{className:"ar"},"\u2192")))))))),React.createElement(CtaContact,{overline:"Une question, un projet ?",title:"\xC9crivons votre histoire."})),React.createElement(Footer,null))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(JournalApp,null));})();

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
