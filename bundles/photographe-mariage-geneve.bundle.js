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
   KEVIN CHINELLI — contenu des prestations (FR · Suisse romande)
   Plain data, exposed as window.KC_PRESTA[slug].
   Tarifs alignés sur le marché romand (CHF) — ajustables sur devis.
   ============================================================ */
window.KC_PRESTA = {

  /* ====================== MARIAGES ====================== */
  mariage: {
    slug: "mariage", title: "Mariages", crumb: "Mariages", heroDefault: "bas",
    schemaName: "Photographie de mariage",
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
        items: ["Couverture 4 h continues — cérémonie & apéritif", "Galerie privée en ligne, téléchargement HD", "Env. 200 photos, toutes retouchées"] },
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

  /* ============== LIFESTYLE (page mère : solo, couple, famille) ============== */
  portrait: {
    slug: "portrait", title: "Lifestyle", crumb: "Lifestyle", heroDefault: "bas",
    schemaName: "Photographie lifestyle et portrait",
    heroImg: "Photo hero — portrait en lumière naturelle, extérieur",
    heroHint: "Photographe lifestyle et portrait en Suisse romande — seul, à deux ou en famille, en lumière naturelle.",
    subpages: ["solo", "couple", "famille"],
    intro: {
      lead: "Une séance lifestyle, c'est un moment de vie photographié tel qu'il est : vous, la personne que vous aimez ou toute votre tribu, dans un lieu qui vous ressemble.",
      paragraphs: [
        "Pas de poses figées : on marche, on discute, on rit, et je saisis ce qui se passe entre deux. Je vous donne des indications simples et précises — où poser le regard, quoi faire de vos mains — pour que vous n'ayez jamais à « prendre la pose ». Les plus belles images arrivent presque toujours quand vous oubliez l'appareil.",
        "La séance se vit seul, à deux ou en famille. Un portrait pour soi, des fiançailles, un anniversaire de rencontre, des enfants qui grandissent trop vite : le déroulé et les tarifs sont les mêmes, seule l'histoire change.",
        "Je travaille la lumière naturelle, en extérieur ou chez vous : un quai du Léman à Lausanne, les vignes de Lavaux, une ruelle de la vieille ville de Genève, une forêt, votre salon un dimanche matin. Vous repartez avec une galerie privée et des fichiers haute définition, prêts pour l'impression comme pour le partage.",
      ],
      quote: "« Les plus belles images arrivent quand on oublie l'appareil. »",
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
        items: ["Seul, à deux ou en famille", "1 lieu en extérieur", "10 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
      { tag: "Le plus choisi · 1 h", name: "Signature", price: "CHF 280", feature: true,
        items: ["Seul, à deux ou en famille", "2 lieux (intérieur ou extérieur) ou 2 ambiances proches", "25 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
    ],
    entreprise: true,
    process: [
      { n: "01", title: "Prise de contact", text: "Vous me dites qui sera là et ce que vous aimeriez garder de ce moment. On choisit ensemble le lieu qui vous ressemble." },
      { n: "02", title: "Préparation", text: "Conseils tenues, couleurs et horaire selon la lumière : tout est prêt pour que la séance soit fluide." },
      { n: "03", title: "La séance", text: "Décontractée et guidée. Je vous propose des situations simples, vous restez vous-mêmes — et on s'amuse." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, fichiers prêts à l'emploi, web et impression." },
    ],
    inclus: [
      "Conseils lieu, tenues & couleurs", "Direction de pose bienveillante",
      "Toutes les photos livrées retouchées", "Fichiers web et impression HD", "Galerie privée en ligne",
      "Frais de déplacement inclus en Suisse romande",
    ],
    faq: [
      { q: "Quelle différence entre une séance solo, couple ou famille ?", a: "Le déroulé et les tarifs sont les mêmes : seule l'histoire change. En solo, la séance est centrée sur vous ; à deux, sur votre complicité ; en famille, on suit le rythme des enfants. Dites-moi qui sera là, j'adapte le lieu, l'heure et ma façon de vous guider." },
      { q: "Où se déroule la séance ?", a: "Au lieu de votre choix en Suisse romande — quais de Lausanne, vieille ville de Genève, vignobles de Lavaux, forêt, bord de lac, ou votre intérieur — ou dans un cadre que je vous propose selon l'ambiance souhaitée. Je me déplace dans tout le canton de Vaud, à Genève, Fribourg, Neuchâtel et alentours." },
      { q: "Je ne suis pas à l'aise devant l'objectif, est-ce un problème ?", a: "C'est le cas de la grande majorité des gens — et c'est précisément mon métier. Je guide pas à pas, sans jamais vous laisser chercher quoi faire. La plupart repartent en se disant que c'était bien plus simple que prévu." },
      { q: "Combien de tenues puis-je prévoir ?", a: "Une à deux selon la durée. Je vous conseille en amont sur les couleurs et les matières qui rendent le mieux en photo, et qui s'accordent avec le décor." },
      { q: "Peut-on offrir une séance ?", a: "Oui, je propose des bons cadeaux personnalisés, valables un an, pour une séance solo, en couple ou en famille." },
      { q: "Sous quel délai les images sont-elles livrées ?", a: "Environ deux semaines, avec une livraison express possible en option si vous en avez besoin plus vite." },
    ],
  },

  /* ====================== LIFESTYLE · SOLO ====================== */
  solo: {
    slug: "solo", parent: "portrait", title: "Solo", crumb: "Solo", heroDefault: "bas",
    cardText: "Un portrait pour vous, en lumière naturelle, dans un lieu qui compte.",
    schemaName: "Séance photo solo",
    heroImg: "Photo hero — portrait solo en lumière naturelle",
    heroHint: "Séance photo solo en Suisse romande — un portrait qui vous ressemble, en lumière naturelle.",
    intro: {
      lead: "Une séance portrait, c'est un cadeau qu'on se fait à soi-même : un temps suspendu, rien que pour vous, et des images qui vous ressemblent vraiment.",
      paragraphs: [
        "On commence par marcher et discuter, le temps que l'appareil se fasse oublier. Je vous donne des indications simples et précises — où poser le regard, quoi faire de vos mains — pour que vous n'ayez jamais à « prendre la pose ». Les plus belles images arrivent presque toujours entre deux consignes, quand vous redevenez tout simplement vous-même.",
        "On repousse si souvent les belles photos de soi à « plus tard » : au bon moment, à quand on sera prêt, à quand on aura le temps. Ce moment, c'est maintenant. S'offrir une séance, c'est s'accorder le droit de se voir autrement, de prendre soin de son image et de garder une trace juste de qui l'on est aujourd'hui.",
        "Je travaille la lumière naturelle, en extérieur ou dans un lieu qui compte pour vous : un quai du Léman à Lausanne, une ruelle de la vieille ville de Genève, votre atelier ou votre intérieur. Portrait personnel, artistique ou cadeau pour un anniversaire : le cadre s'adapte à ce que vous voulez garder de ce moment. Vous repartez avec une galerie privée et des fichiers haute définition, prêts pour l'impression comme pour le web.",
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
        items: ["1 lieu en extérieur", "10 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
      { tag: "Le plus choisi · 1 h", name: "Signature", price: "CHF 280", feature: true,
        items: ["2 lieux (intérieur ou extérieur) ou 2 ambiances proches", "25 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
    ],
    entreprise: true,
    process: [
      { n: "01", title: "Prise de contact", text: "On clarifie ce que vous attendez des images, l'ambiance recherchée et le lieu qui vous correspond le mieux." },
      { n: "02", title: "Préparation", text: "Conseils tenues, couleurs et repérage : tout est prêt pour que la séance soit fluide et vous ressemble." },
      { n: "03", title: "La séance", text: "Décontractée et guidée. Je vous dirige avec justesse, vous restez vous-même — et on s'amuse." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, fichiers prêts à l'emploi, web et impression." },
    ],
    inclus: [
      "Conseils lieu, tenues & couleurs", "Direction de pose bienveillante",
      "Toutes les photos livrées retouchées", "Fichiers web et impression HD", "Galerie privée en ligne",
      "Frais de déplacement inclus en Suisse romande",
    ],
    faq: [
      { q: "Où se déroule la séance ?", a: "Au lieu de votre choix en Suisse romande — quais de Lausanne, vieille ville de Genève, vignobles de Lavaux, forêt, bord de lac, ou votre intérieur — ou dans un cadre que je vous propose selon l'ambiance souhaitée. Je me déplace dans tout le canton de Vaud, à Genève, Fribourg, Neuchâtel et alentours." },
      { q: "Portrait en extérieur ou en studio, comment choisir ?", a: "Le portrait en extérieur, en lumière naturelle, donne un rendu vivant et personnel. Le studio offre un cadre maîtrisé, idéal pour un portrait éditorial plus graphique. Si vous hésitez, on en parle : je vous oriente selon ce que vous voulez faire des images." },
      { q: "Puis-je utiliser les photos pour mon activité ?", a: "Les droits d'usage privé sont inclus dans toutes les formules. Pour des portraits destinés à une entreprise — site, réseaux professionnels, presse, équipe —, je travaille sous ma marque Snapshot Media, avec les droits d'usage commercial adaptés." },
      { q: "Combien de tenues puis-je prévoir ?", a: "Une à deux selon la durée. Je vous conseille en amont sur les couleurs et les matières qui rendent le mieux en photo, et qui s'accordent avec le décor." },
      { q: "Je ne suis pas à l'aise devant l'objectif, est-ce un problème ?", a: "C'est le cas de la grande majorité des gens — et c'est précisément mon métier. Je guide pas à pas, sans jamais vous laisser chercher quoi faire. La plupart repartent en se disant que c'était bien plus simple que prévu." },
      { q: "Sous quel délai les images sont-elles livrées ?", a: "Environ deux semaines, avec une livraison express possible en option si vous en avez besoin plus vite." },
    ],
  },

  /* ============== MATERNITÉ & GROSSESSE ============== */
  maternite: {
    slug: "maternite", title: "Maternité & Grossesse", crumb: "Maternité & Grossesse", heroDefault: "bas",
    schemaName: "Photographie de grossesse et maternité",
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
    schemaName: "Portrait en studio",
    heroImg: "Photo hero — portrait studio, fond sobre",
    heroHint: "Séance photo en studio en Suisse romande — portrait éditorial, lumière maîtrisée.",
    intro: {
      lead: "Un portrait fort en dit plus que mille mots. En studio, chaque détail est dirigé — lumière, posture, expression — pour révéler le meilleur de vous.",
      paragraphs: [
        "Portrait éditorial, clair-obscur, book d'artiste ou de comédien, portrait d'auteur, ou simplement une image forte de vous : le studio offre un cadre maîtrisé, où la lumière se règle au millimètre sur votre visage.",
        "Je dirige la séance pas à pas, j'ajuste la lumière sur chaque expression et je vous montre les images au fur et à mesure pour valider ensemble. Choix des fonds (clair, sombre, coloré), une ou plusieurs tenues, et un rendu net, élégant et intemporel.",
      ],
      quote: "« La lumière sculpte, le regard révèle. »",
    },
    gallery: [
      { ph: "Portrait éditorial — clair", o: "v" },
      { ph: "Portrait masculin — fond sombre", o: "v" },
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
    ],
    entreprise: true,
    process: [
      { n: "01", title: "Brief", text: "On définit ce que vous voulez faire des images, le style recherché et l'ambiance visuelle." },
      { n: "02", title: "Préparation", text: "Conseils tenues, fonds et lumière, pour un résultat qui vous ressemble." },
      { n: "03", title: "Séance", text: "Direction précise et bienveillante : je vous guide pose après pose et vous montre les images en direct." },
      { n: "04", title: "Sélection & retouche", text: "Tri ensemble, puis retouche soignée et livraison aux formats utiles (web, impression, réseaux)." },
    ],
    inclus: [
      "Studio professionnel équipé", "Direction de pose", "Choix des fonds et lumières",
      "Toutes les photos livrées retouchées", "Formats web et impression", "Galerie privée en ligne",
    ],
    faq: [
      { q: "Où se trouve le studio ?", a: "En Suisse romande ; l'adresse exacte et l'accès vous sont communiqués à la réservation." },
      { q: "À quoi servent ces portraits ?", a: "Portrait d'auteur ou d'artiste, book de comédien ou de musicien, cadeau, image forte pour vos réseaux… Dites-moi l'usage final : je calibre le cadrage, le format et le fond en conséquence. Pour des portraits d'entreprise ou d'équipe, c'est Snapshot Media, ma structure pour les professionnels, qui s'en charge." },
      { q: "Puis-je venir avec plusieurs tenues ?", a: "Oui. Le nombre dépend de la formule. Je vous conseille sur les associations et les couleurs qui rendent le mieux selon le fond choisi." },
      { q: "Faites-vous des photos de produits ou de l'événementiel ?", a: "Pas sous Afterglow, qui reste consacré aux particuliers. Produit, événementiel et portraits d'équipe passent par Snapshot Media, mon studio pour les entreprises." },
      { q: "Sous quel délai les images sont-elles livrées ?", a: "Une à deux semaines selon la formule, avec une livraison express possible en option pour les besoins urgents." },
    ],
  },

  /* ====================== LIFESTYLE · COUPLE ====================== */
  couple: {
    slug: "couple", parent: "portrait", title: "Couple", crumb: "Couple", heroDefault: "bas",
    cardText: "Fiançailles, anniversaire de rencontre ou simplement vous deux.",
    schemaName: "Séance photo de couple",
    heroImg: "Photo hero — couple complice en extérieur",
    heroHint: "Séance photo de couple en Suisse romande — fiançailles, anniversaire ou simplement vous deux.",
    intro: {
      lead: "Pas besoin d'une grande occasion pour immortaliser un amour. Une séance couple, c'est du temps offert à votre complicité.",
      paragraphs: [
        "En extérieur ou chez vous, je crée un espace léger où vous pouvez être vous-mêmes. Plutôt que des poses figées, je vous propose des situations — marcher, se chuchoter quelque chose, se taquiner — et je saisis ce qui naît entre deux. Les plus belles images viennent presque toujours d'un rire partagé.",
        "Fiançailles, anniversaire de rencontre, future demande, ou simplement l'envie de garder une trace de cette saison de votre vie : la séance s'adapte à votre histoire et au décor qui vous ressemble — un coucher de soleil sur le Léman, un sentier en forêt, les vignes de Lavaux ou un appartement cosy un dimanche matin.",
        "Vous repartez avec une galerie privée et des fichiers haute définition, parfaits pour un faire-part, un tirage ou simplement pour vous.",
      ],
      quote: "« S'aimer, c'est regarder ensemble dans la même direction. »",
    },
    gallery: [],
    formules: [
      { tag: "Découverte · 30 min", name: "Essentiel", price: "CHF 180",
        items: ["Séance à deux, 30 min", "1 lieu en extérieur", "10 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
      { tag: "Le plus choisi · 1 h", name: "Signature", price: "CHF 280", feature: true,
        items: ["Séance à deux, 1 h", "2 lieux ou 2 tenues", "25 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On parle de vous, de votre histoire et de l'ambiance qui vous ressemble." },
      { n: "02", title: "Lieu & tenues", text: "On choisit ensemble un cadre et des tenues à votre image, et on cale l'heure idéale pour la lumière." },
      { n: "03", title: "La séance", text: "Décontractée et joueuse : je vous propose des situations, vous vivez l'instant, je capte le reste." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à partager." },
    ],
    inclus: [
      "Conseils lieu & tenues", "Direction décontractée",
      "Toutes les photos livrées retouchées", "Galerie privée en ligne", "Droits d'usage privé",
      "Frais de déplacement inclus en Suisse romande",
    ],
    faq: [
      { q: "Où se déroule la séance ?", a: "Au lieu de votre choix en Suisse romande — rives du Léman, vignobles de Lavaux, vieille ville, forêt ou votre intérieur — ou dans un cadre que je vous propose. Je me déplace dans le canton de Vaud, à Genève, Fribourg, Neuchâtel, en Valais romand et alentours." },
      { q: "Quel est le meilleur moment de la journée ?", a: "L'heure dorée, juste avant le coucher du soleil : la lumière y est chaude et flatteuse. On peut aussi profiter d'une lumière matinale, plus calme et plus fraîche, selon le lieu." },
      { q: "Et s'il pleut le jour J ?", a: "On reporte sans frais à une date proche, ou on bascule à l'intérieur, chez vous, pour une séance plus intimiste. La météo romande étant ce qu'elle est, on garde toujours une porte de sortie." },
      { q: "Combien de temps dure une séance ?", a: "30 minutes ou une heure selon la formule — le temps de se détendre, d'oublier l'objectif et de profiter l'un de l'autre." },
      { q: "Peut-on l'offrir en cadeau ?", a: "Oui, je propose des bons cadeaux personnalisés, valables un an. Une belle idée pour une demande, un anniversaire ou les fêtes." },
      { q: "On veut s'en servir pour notre faire-part de mariage, c'est possible ?", a: "Bien sûr. Beaucoup de couples font leur séance couple ou fiançailles quelques mois avant le mariage, pour le faire-part et le site. C'est aussi un excellent moyen de se familiariser avec ma façon de travailler avant le jour J." },
    ],
  },

  /* ====================== LIFESTYLE · FAMILLE ====================== */
  famille: {
    slug: "famille", parent: "portrait", title: "Famille", crumb: "Famille", heroDefault: "bas",
    cardText: "Des images vraies de votre tribu, au rythme des enfants.",
    schemaName: "Séance photo de famille",
    heroImg: "Photo hero — famille complice en extérieur, lumière dorée",
    heroHint: "Photographe de famille en Suisse romande — des images vraies, sans poses figées.",
    intro: {
      lead: "Les enfants grandissent vite, et les vraies images de famille — celles où tout le monde rit pour de bon — sont les plus précieuses. Mon rôle : capter votre tribu telle qu'elle est, complice et vivante.",
      paragraphs: [
        "Oubliez le « tout le monde regarde l'objectif et sourit ». Je crée une parenthèse de jeu et de complicité — on marche, on se chamaille, on se câline — et je saisis les regards, les fous rires et les gestes tendres entre deux. Les enfants restent eux-mêmes, et les images vous ressemblent vraiment.",
        "En extérieur et en lumière naturelle — au bord du Léman, en forêt, dans les vignes de Lavaux — ou chez vous, dans votre cocon, pour des images intimes du quotidien. La séance s'adapte à l'âge des enfants et à votre rythme : on prend le temps qu'il faut, sans pression.",
        "Séance famille classique, arrivée d'un nouveau-né, séance avec les grands-parents, ou rendez-vous annuel pour suivre la tribu qui grandit : on construit la séance autour de votre histoire.",
      ],
      quote: "« Une famille, c'est une histoire qu'on n'a jamais fini de photographier. »",
    },
    gallery: [],
    formules: [
      { tag: "Découverte · 30 min", name: "Essentiel", price: "CHF 180",
        items: ["Séance en famille, 30 min", "1 lieu en extérieur", "10 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
      { tag: "Le plus choisi · 1 h", name: "Signature", price: "CHF 280", feature: true,
        items: ["Séance en famille, 1 h", "Extérieur ou à domicile", "25 photos retouchées", "Galerie privée en ligne", "Galerie complète en option"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On échange sur votre famille, l'âge des enfants, l'ambiance et le lieu qui vous ressemblent." },
      { n: "02", title: "Préparation", text: "Conseils tenues et couleurs accordées, choix du lieu et de l'horaire idéal selon l'âge des plus petits." },
      { n: "03", title: "La séance", text: "Du jeu, pas de poses figées. Je guide en douceur, au rythme des enfants — et on s'amuse pour de vrai." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à imprimer et à partager avec toute la famille." },
    ],
    inclus: [
      "Conseils tenues & couleurs accordées", "Séance en extérieur ou à domicile",
      "Direction bienveillante, au rythme des enfants", "Toutes les photos livrées retouchées", "Galerie privée en ligne",
      "Frais de déplacement inclus en Suisse romande",
    ],
    faq: [
      { q: "À partir de quel âge photographier les enfants ?", a: "À tout âge — du nouveau-né aux adolescents. Pour les bébés, on privilégie les dix premiers jours ou la période après 6 mois (quand ils tiennent assis). Pour les plus grands, la séance se transforme en jeu : c'est souvent là que naissent les plus belles images." },
      { q: "Où se déroule la séance photo de famille ?", a: "Au lieu de votre choix — bord du Léman, forêt, vignes de Lavaux, parc — ou à votre domicile pour des images intimes du quotidien. Le déplacement est inclus dans toute la Suisse romande, sans frais." },
      { q: "Comment ça se passe avec des enfants en bas âge ou agités ?", a: "C'est tout l'intérêt du reportage : je ne cherche pas à les figer. On joue, on bouge, on fait des pauses goûter si besoin. Je m'adapte à leur rythme et à leur humeur — les enfants qui « ne tiennent pas en place » donnent souvent les photos les plus vivantes." },
      { q: "Peut-on faire une séance avec les grands-parents ?", a: "Oui, et c'est un magnifique cadeau. Pour une grande tribu, je conseille la formule Signature : une heure laisse le temps de photographier chaque génération, puis tout le monde ensemble." },
      { q: "Que porter pour une séance photo de famille ?", a: "Des tenues coordonnées, sans être assorties à l'identique : une palette de 2 ou 3 couleurs douces et naturelles fonctionne très bien. Évitez les gros logos et les motifs chargés. Je vous envoie des conseils personnalisés avant la séance." },
      { q: "Sous quel délai les photos sont-elles livrées ?", a: "Environ deux semaines, dans une galerie privée en ligne, en haute définition pour l'impression comme pour le partage. Une livraison express est possible en option." },
    ],
  },
};

;
/* ============================================================
   KEVIN CHINELLI — Landing pages locales (SEO local par ville)
   window.KC_VILLE[slug]. Contenu unique et substantiel par ville
   (pas de pages "doorway"). Lu par kc-ville-app.jsx.

   Pages mariage réécrites le 20.11.2026 à partir de faits vérifiés sur les sites officiels
   (état civil vaud.ch et geneve.ch, Villes de Lausanne, Vevey, Montreux, château de Chillon,
   MétéoSuisse) : rien n'est publié ici sans source. Kevin a photographié des mariages à Lausanne,
   en Lavaux et à Yverdon, jamais encore à Genève ni sur la Riviera : sur ces deux pages, aucune
   phrase ne prétend à une expérience sur place. Une photo n'est jamais légendée ailleurs que là
   où elle a été prise. Heures de coucher du soleil : calcul astronomique pour 2027.
   [texte](lien) : lien rendu par kc-ville-app.jsx (Rich).
   ============================================================ */
window.KC_VILLE = {

  /* ===================== LAUSANNE ===================== */
  lausanne: {
    slug: "lausanne", ville: "Lausanne", region: "Vaud",
    h1: "Photographe de mariage à Lausanne",
    heroImg: "Jeunes mariés sous un platane, le Léman en contrebas, en Lavaux",
    heroAlt: "Jeunes mariés enlacés sous un platane, au-dessus du Léman, en Lavaux",
    heroMobile: true,
    heroHint: "Du oui à la Palud jusqu'au souper, en reportage. Mézières, d'où je viens, est à vingt minutes.",
    intro: {
      lead: "À Lausanne, une journée de mariage monte et descend : le oui à la Palud, les photos à la Cité, l'apéritif au bord du lac. Je vous suis d'un bout à l'autre, sans vous faire courir.",
      paragraphs: [
        "J'habite à Mézières, dans le Jorat, à une vingtaine de minutes de la Riponne. Lausanne est la grande ville la plus proche de chez moi, et j'y ai déjà photographié des mariés. Je connais ses montées, ses parkings et les coins où l'on peut faire des photos à deux sans traverser tout le centre en robe longue.",
        "Je travaille en reportage : je photographie ce qui se passe, sans rien vous faire rejouer. Les doigts qui cherchent la bonne alliance, une mère qui se retourne pour voir qui pleure déjà, la famille qui déborde sur la place à la sortie. Pour les photos de couple, je vous emprunte une demi-heure au meilleur moment de lumière, puis je vous rends à vos invités.",
        "Plus bas, ce que je vérifie avant un mariage lausannois : la salle de l'état civil, six endroits pour les photos, les jours de marché, le plan pluie et l'heure du coucher du soleil. Le reste se règle au téléphone ou autour d'un café.",
      ],
    },
    civil: {
      over: "Le civil à Lausanne",
      title: "La salle de la Palud, et ce qu'elle change pour les photos.",
      facts: [
        { k: "La salle", v: "La salle des mariages de la place de la Palud, en vieille ville. Une seconde salle existe à Sévelin 46, au siège de l'état civil." },
        { k: "Combien", v: "50 personnes au plus, vous deux, vos témoins et l'officier compris." },
        { k: "Durée", v: "15 à 30 minutes. L'état civil demande d'arriver dix minutes avant." },
        { k: "Témoins", v: "Deux, majeurs, avec une pièce d'identité. Un permis de séjour ne suffit pas." },
        { k: "Formalités", v: "De 250 à 500 francs. La salle et l'heure ne sont confirmées qu'à la signature de la procédure." },
        { k: "Plus grand", v: "Lutry reçoit 118 personnes, Pully 50. Le canton propose aussi dix lieux d'exception, dont le château d'Oron : 1'500 francs, du jeudi au samedi, entre 14 h et 16 h." },
      ],
      paragraphs: [
        "C'est une belle salle ancienne, pas une grande salle. À cinquante, on est serrés. Je me place sur le côté avant le début, je ne bouge plus pendant les consentements et je travaille sans flash : la cérémonie reste une cérémonie.",
        "L'état civil signale un accès difficile pour les personnes à mobilité réduite. Si une grand-mère vient en fauteuil, dites-le en réservant : la salle de Sévelin ou celle d'une commune voisine sera peut-être plus simple.",
        "À la sortie, tout le monde se retrouve sur la place, autour de la fontaine de la Justice. C'est le moment des photos de famille, avant que chacun parte à l'apéritif. Un détail à connaître : l'horloge animée de la Palud se met en route à chaque heure pile, de 9 h à 19 h. Si vous sortez à l'heure juste, elle s'anime derrière vous.",
        "Le mercredi et le samedi matin, le marché occupe la place jusqu'à 13 h, et les stands sont démontés au plus tard à 14 h 30. Pour une Palud dégagée sur les photos, un civil l'après-midi est plus sûr.",
      ],
      source: "Sources : [état civil du canton de Vaud](https://www.vd.ch/population/etat-civil/mariage) et [Ville de Lausanne](https://www.lausanne.ch/vie-pratique/economie-et-commerces/marches-et-commerce-itinerant/marches-lausannois/marche-du-centre-ville), consultés en novembre 2026. En cas de doute, l'état civil fait foi.",
    },
    spots: {
      over: "Les photos de couple",
      title: "Six endroits à quelques minutes de la Palud.",
      intro: "Lausanne a un avantage : tout est proche. Ces six lieux tiennent dans dix minutes à pied, en m2 ou en voiture. On choisit ensemble selon l'heure, la saison et l'énergie qu'il vous reste.",
      list: [
        { meta: "Vieille ville · à pied", name: "Les Escaliers du Marché", text: "Les escaliers de bois couverts qui montent de la Palud vers la cathédrale, entre des façades serrées. Ils servent deux fois : pour des images à deux, intimes, et comme abri s'il pleut à la sortie du civil." },
        { meta: "La Cité · 7 minutes à pied", name: "L'esplanade de la cathédrale", text: "En haut des escaliers, la vue sur les toits de la ville et sur le lac. C'est là que je fais la photo de groupe quand vous voulez de l'air autour, puis quelques images à deux contre la pierre de la cathédrale." },
        { meta: "Centre · 9 minutes à pied", name: "L'esplanade de Montbenon", text: "Le balcon du centre-ville : des pelouses, le Palais de justice, le Casino, et le lac au bout du regard. En fin de journée, c'est l'un des endroits les plus lumineux de Lausanne." },
        { meta: "Les hauts · bus 16, arrêt Signal", name: "Sauvabelin", text: "La forêt, le petit lac et la tour en bois. Quand le soleil tape fort à midi en été, les arbres donnent une lumière douce que le centre n'a pas. La tour est gratuite, mais elle ferme par grand vent, neige ou glace." },
        { meta: "Bord du lac · m2 Ouchy-Olympique", name: "Ouchy et le Denantou", text: "Les quais, le château d'Ouchy, puis, un peu plus à l'est, le pavillon thaïlandais du parc du Denantou. Au bord de l'eau, je préfère la fin de journée : moins de promeneurs et une lumière qui ne tombe plus d'en haut." },
        { meta: "Montriond · m2 Délices", name: "Le crêt de Montriond", text: "Une butte arborée au-dessus de la place de Milan, avec une esplanade au sommet et le lac en face. Les invités la connaissent rarement, et c'est tant mieux : vingt minutes au calme pendant l'apéritif." },
      ],
      outro: "À savoir : la Fondation de l'Hermitage est fermée pour travaux jusqu'en 2027 au moins. Pour des photos dans un parc public, la Ville ne publie aucune démarche particulière ; dans un hôtel, un musée ou une propriété privée, on demande toujours avant, et je m'en charge si vous me donnez le contact.",
    },
    photos: [
      { id: "ville-lausanne-p1", alt: "La mariée entre dans la salle des mariages au bras de son père", caption: "Au bras de son père, au civil à Yverdon" },
      { id: "ville-lausanne-p2", alt: "Le marié signe le registre, la mariée sourit derrière lui, son bouquet à la main", caption: "La signature du registre" },
      { id: "ville-lausanne-p3", alt: "La mariée avec deux enfants d'honneur qui tiennent chacun un petit bouquet", caption: "Les enfants d'honneur" },
    ],
    journee: {
      over: "Une journée type",
      title: "Un mariage à Lausanne en juin, heure par heure.",
      intro: "Un exemple, avec un civil à 15 h à la Palud. Les horaires se calent ensuite sur votre lieu de réception et sur la lumière du jour.",
      steps: [
        { t: "12 h", title: "Les préparatifs", text: "J'arrive pendant que vous vous habillez, chez vous ou à l'hôtel. Les détails, les témoins qui arrivent, et le moment où l'un de vous découvre l'autre, si vous voulez le vivre avant la cérémonie." },
        { t: "14 h 50", title: "Le civil à la Palud", text: "Dix minutes d'avance, comme le demande l'état civil. Après la cérémonie, photos de famille sur la place, devant la fontaine, pendant que l'émotion est encore là." },
        { t: "16 h", title: "La Cité, à pied", text: "Les Escaliers du Marché, puis l'esplanade de la cathédrale : vingt minutes à deux, pendant que vos invités partent à l'apéritif. Pour descendre au bord du lac, le m2 met neuf minutes de la Riponne à Ouchy." },
        { t: "21 h", title: "La lumière du soir", text: "Mi-juin, le soleil se couche vers 21 h 30. Je vous emprunte vingt minutes entre deux plats du souper, au bord de l'eau ou dans les vignes, puis je reste pour les discours, la première danse et le début de la fête." },
      ],
      note: "En septembre, le soleil se couche vers 19 h 45, en octobre vers 18 h 45 : on avance d'autant les photos du soir. Je vous donne l'heure exacte pour votre date.",
    },
    savoir: {
      over: "Bon à savoir",
      title: "Ce que je vérifie avant un mariage lausannois.",
      items: [
        { title: "S'il pleut", text: "Les Escaliers du Marché sont couverts et à deux pas de la salle : les photos de famille se font au sec. Pour les photos à deux, on guette une éclaircie ou on se replie sur votre lieu de réception. Prévoyez des parapluies transparents ou blancs : ils laissent passer la lumière sur les visages." },
        { title: "Les jours chargés", text: "Le marché occupe la Palud le mercredi et le samedi matin. En 2027, le Festival de la Cité remplit la vieille ville du 6 au 11 juillet, et le Lausanne Marathon a lieu le 24 octobre. Ces jours-là, on adapte le parcours." },
        { title: "Se garer, se déplacer", text: "Le centre est en grande partie piéton. Le parking de la Riponne, ouvert jour et nuit, est le plus pratique pour la Palud. Entre la ville haute et le lac, le m2 évite les montées en tenue de mariage." },
        { title: "Pour la réception", text: "À Lausanne même, plusieurs maisons reçoivent des mariages : le Beau-Rivage Palace et le Royal Savoy à Ouchy, le Lausanne Palace au centre, le Château d'Ouchy pour une quarantaine de personnes, l'Auberge de l'Abbaye de Montheron dans les bois au nord de la ville. Et Lavaux commence à Lutry : voici [huit lieux de mariage en Lavaux](journal-lieux-mariage-lavaux.html)." },
      ],
    },
    tarifs: {
      over: "Les formules",
      title: "Les mêmes prix à Lausanne que partout en Suisse romande.",
      intro: "Le déplacement est compris, pour Lausanne comme pour Lavaux. Vous recevez dix photos sous trois à cinq jours, puis la galerie complète sous quatre semaines. La formule Signature couvre la journée entière, des préparatifs à la soirée.",
    },
    faqTitle: "Vos questions sur un mariage à Lausanne.",
    faq: [
      { q: "Où se marier civilement à Lausanne ?", a: "Dans la salle des mariages de la place de la Palud, ou dans celle de Sévelin 46, au siège de l'état civil. Les deux dépendent du même office cantonal. Pour plus de monde, la salle de Lutry reçoit 118 personnes ; pour un cadre de château, le canton propose dix lieux d'exception, dont le château d'Oron." },
      { q: "Combien de personnes dans la salle de la Palud ?", a: "Cinquante au maximum, vous deux, vos témoins et l'officier compris. Si vous êtes plus nombreux, une partie de vos proches vous attendra sur la place : la sortie n'en est que plus belle à photographier." },
      { q: "Peut-on faire le civil et le religieux le même jour ?", a: "Oui, dans cet ordre : en Suisse, le mariage religieux ne peut pas précéder le mariage civil. Prévoyez une bonne heure entre les deux pour le trajet et les photos de famille." },
      { q: "Combien de temps prévoir pour les photos de couple ?", a: "Une demi-heure l'après-midi, et vingt minutes de plus en fin de journée si la lumière est belle. À Lausanne, tout est proche : on ne perd pas une heure en trajets." },
      { q: "Le déplacement à Lausanne est-il compris ?", a: "Oui. J'habite à Mézières, à une vingtaine de minutes : Lausanne, Lavaux et le reste de la Suisse romande sont compris dans le prix." },
      { q: "Quand réserver son photographe ?", a: "Pour un samedi de mai à septembre, huit à quatorze mois avant. Je ne prends qu'un mariage par jour : [écrivez-moi votre date](contact.html?type=Mariage), je vous réponds sous 48 heures." },
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
    heroImg: "Table de mariage dressée, verres et compositions de fleurs séchées",
    heroAlt: "Table de mariage dressée, verres et compositions de fleurs séchées",
    heroHint: "Votre mariage en reportage, de la mairie des Eaux-Vives jusqu'au souper. Déplacement compris depuis le canton de Vaud.",
    intro: {
      lead: "À Genève, le mariage civil a ses horaires : en semaine, ou certains samedis matin seulement. C'est la première chose à vérifier avant de bloquer une date.",
      paragraphs: [
        "J'habite à Mézières, dans le canton de Vaud, à un peu plus d'une heure de Genève. Le déplacement est compris dans mes formules, comme partout en Suisse romande : vous ne payez pas les kilomètres.",
        "Je photographie en reportage : la cérémonie telle qu'elle se passe, vos proches, l'apéritif, la fête. Pour les photos de couple, une demi-heure suffit, et à Genève les plus beaux endroits sont tout près des salles de l'état civil : la promenade des Bastions est juste derrière le palais Eynard.",
        "Ce que vous lisez plus bas, je l'ai vérifié auprès de la Ville de Genève : les salles, les jours, les prix, les règles pour photographier sur le domaine public. Le jour venu, il ne vous reste qu'à vivre la journée.",
      ],
    },
    civil: {
      over: "Le civil à Genève",
      title: "En semaine, ou certains samedis matin seulement.",
      facts: [
        { k: "L'état civil", v: "Rue de la Mairie 37, aux Eaux-Vives, dans l'ancienne mairie. Le bâtiment n'est pas accessible en fauteuil roulant." },
        { k: "En semaine", v: "Du lundi au vendredi, de 10 h à 11 h 15 et de 14 h à 15 h 30. Jamais le dimanche ni un jour férié." },
        { k: "Le samedi", v: "Quatorze samedis matin en 2027, de 9 h 30 à 11 h 30, aux Eaux-Vives seulement, pour les couples genevois ou domiciliés à Genève." },
        { k: "Les salles", v: "Le palais Eynard (salons de 20 et de 60 personnes) et l'Hôtel-restaurant du parc des Eaux-Vives (salons de 20 à 50), du lundi au vendredi uniquement." },
        { k: "Le prix", v: "125 francs la célébration. 650 francs dans l'une des deux salles particulières, plus la location du salon." },
        { k: "Ailleurs", v: "Le canton compte neuf arrondissements d'état civil. Se marier dans une autre commune que celle de la procédure demande une autorisation de célébrer : 30 francs." },
      ],
      paragraphs: [
        "Les samedis 2027 aux Eaux-Vives : 16 janvier, 6 février, 6 mars, 17 avril, 22 mai, 5 et 19 juin, 3 juillet, 28 août, 18 et 25 septembre, 9 octobre, 6 novembre et 4 décembre. Si votre fête tombe un autre samedi, le civil se fera en semaine, et je peux photographier les deux.",
        "Au palais Eynard, on entre par le perron côté Bastions. Pour les photos, c'est un cadeau : en sortant, la promenade des Bastions est à deux minutes, la Treille et son long banc de bois à trois, la Vieille-Ville juste au-dessus.",
        "Musique ou lecture pendant la cérémonie : c'est à régler avec l'officier d'état civil. Je me présente à lui avant le début, je prends ma place sur le côté et je travaille sans flash.",
      ],
      source: "Sources : [Ville de Genève, célébration du mariage](https://www.geneve.ch/demarches/celebration-mariage) et [lieux de célébration](https://www.geneve.ch/themes/civil-parcours-vie/marier-convertir-partenariat/lieux-celebration), consultés en novembre 2026. Les samedis sont ceux publiés pour 2027.",
    },
    spots: {
      over: "Les photos de couple",
      title: "De la Vieille-Ville au bord du lac.",
      intro: "Depuis le palais Eynard, presque tout se fait à pied. Depuis la mairie des Eaux-Vives, on part plutôt vers le lac et les grands parcs de la rive gauche.",
      list: [
        { meta: "2 minutes du palais Eynard", name: "La promenade des Bastions", text: "Les grands arbres, les échiquiers géants et le mur des Réformateurs. Ouverte jour et nuit, et juste derrière la salle : on y fait les photos de famille sans perdre de temps." },
        { meta: "3 minutes du palais Eynard", name: "La Treille", text: "Le plus long banc de bois du monde, 120 mètres sous les marronniers, avec la vue sur les Bastions. Assis côte à côte, la promenade qui file derrière vous : une image très genevoise." },
        { meta: "Vieille-Ville · 5 minutes", name: "L'Ancien Arsenal et le Bourg-de-Four", text: "Les arcades de l'Ancien Arsenal, ses canons et ses trois mosaïques, puis la place du Bourg-de-Four et ses terrasses. Les arcades sont couvertes et publiques : c'est notre abri s'il pleut." },
        { meta: "Rive gauche · 11 minutes", name: "Le Jardin anglais et le Jet d'eau", text: "L'Horloge fleurie, le kiosque et le Jet d'eau en face. Ses horaires changent avec la saison : en été il tourne jusqu'au soir, en hiver de 10 h à 16 h seulement. Il s'arrête par vent fort ou grand froid, et pour son entretien en novembre." },
        { meta: "12 minutes de la mairie des Eaux-Vives", name: "Le parc La Grange", text: "Un grand parc au bord du lac, avec un jardin de quatre cents rosiers replantés en 2021. Il ferme la nuit : à 22 h en été, à 18 h en hiver. Le parc des Eaux-Vives, juste à côté, reste ouvert et descend en pelouse vers l'eau." },
        { meta: "Traversée · Mouettes genevoises", name: "La rade en Mouette", text: "Les petits bateaux jaunes traversent la rade toutes les dix minutes entre les Pâquis, le Molard et les Eaux-Vives, pour deux francs. Le week-end, ils circulent d'environ 10 h à 18 h. Quelques minutes sur l'eau, l'un contre l'autre, et le trajet est tout trouvé." },
      ],
      outro: "À savoir : la Ville de Genève soumet à autorisation tout « shooting-photo » sur le domaine public, et sa page ne prévoit pas d'exception pour un couple et son photographe. Je pose la question au service de l'espace public pour votre date, bien avant le jour J.",
    },
    photos: [
      { id: "ville-geneve-p1", alt: "La mariée sourit, son bouquet coloré à la main", caption: "La mariée et son bouquet" },
      { id: "ville-geneve-p2", alt: "Table de mariage dressée, verres et fleurs séchées", caption: "La table, avant les invités" },
      { id: "ville-geneve-p3", alt: "Gros plan sur un bouquet de fleurs blanches et orange", caption: "Les fleurs du jour" },
    ],
    journee: {
      over: "Une journée type",
      title: "Un samedi de juin à Genève, heure par heure.",
      intro: "Un exemple pour le samedi 19 juin 2027, l'un des samedis où la mairie des Eaux-Vives célèbre des mariages le matin.",
      steps: [
        { t: "8 h 30", title: "Les préparatifs", text: "Le civil du samedi se fait le matin : on commence tôt. J'arrive pendant que vous vous préparez, chez vous ou à l'hôtel, pour les détails et les premiers regards." },
        { t: "10 h 30", title: "La mairie des Eaux-Vives", text: "La cérémonie dans l'ancienne mairie, puis les photos de famille à la sortie. Le parc La Grange est à douze minutes à pied." },
        { t: "12 h 30", title: "À deux, au bord du lac", text: "Une demi-heure au parc des Eaux-Vives ou à La Grange, puis direction la campagne genevoise, où des domaines de Jussy ou de Satigny reçoivent des mariages." },
        { t: "21 h", title: "Le soir dans les vignes", text: "Mi-juin, le soleil se couche vers 21 h 30. Vingt minutes entre deux plats, dans les vignes ou au bord de l'eau, puis je reste pour les discours et la fête." },
      ],
      note: "Si votre civil a lieu en semaine, je le photographie à part : une heure ou deux suffisent, et la fête du samedi garde toute sa place.",
    },
    savoir: {
      over: "Bon à savoir",
      title: "Ce que je vérifie avant un mariage genevois.",
      items: [
        { title: "S'il pleut", text: "Les arcades de l'Ancien Arsenal sont couvertes et publiques, à cinq minutes du palais Eynard : on y fait les photos de famille au sec. Pour le reste, on s'organise avec votre lieu de réception. Pensez aux parapluies clairs : un parapluie noir assombrit les visages." },
        { title: "Les samedis chargés", text: "Le samedi, le marché du boulevard Helvétique s'installe de 6 h 30 à 14 h 15, et les puces occupent la plaine de Plainpalais. Le Marathon de Genève est annoncé les 8 et 9 mai 2027, avec l'arrivée au pont du Mont-Blanc. En décembre, la Course de l'Escalade occupe les Bastions et la Vieille-Ville." },
        { title: "Se garer", text: "Le parking Saint-Antoine (434 places, 2 mètres de hauteur) est à six minutes à pied du palais Eynard et à douze de la mairie des Eaux-Vives. Pensez-y pour vos témoins et pour les invités qui marchent moins bien." },
        { title: "Pour la réception", text: "Au bord du lac, La Réserve, à Bellevue, organise des mariages. À la campagne, le Domaine Château-du-Crest, à Jussy, reçoit 80 personnes assises dans sa salle du Pressoir, et le Clos du Château, à Choully, accueille aussi des noces. Pour le coucher de soleil dans les vignes, la campagne genevoise est imbattable." },
      ],
    },
    tarifs: {
      over: "Les formules",
      title: "Le même prix à Genève qu'à Lausanne.",
      intro: "Genève est à un peu plus d'une heure de chez moi, et le déplacement reste compris. Dix photos vous arrivent sous trois à cinq jours, la galerie complète sous quatre semaines. Si votre civil a lieu en semaine et la fête le samedi, on choisit ensemble la formule qui couvre les deux.",
    },
    faqTitle: "Vos questions sur un mariage à Genève.",
    faq: [
      { q: "Peut-on se marier civilement un samedi à Genève ?", a: "Oui, mais seulement certains samedis matin, de 9 h 30 à 11 h 30, à la mairie des Eaux-Vives, et ces dates sont réservées aux couples genevois ou domiciliés à Genève. La Ville en a publié quatorze pour 2027. Les autres jours, les célébrations ont lieu du lundi au vendredi." },
      { q: "Où se marier civilement en ville de Genève ?", a: "À l'état civil de la Ville, dans l'ancienne mairie des Eaux-Vives, ou dans l'une des deux salles particulières : le palais Eynard, côté Bastions, et l'Hôtel-restaurant du parc des Eaux-Vives. Les communes du canton ont leurs propres arrondissements, comme Carouge ou Cologny." },
      { q: "Combien coûte la cérémonie civile ?", a: "125 francs à la mairie. Dans une salle particulière, 650 francs, plus la location du salon : de 350 à 500 francs au palais Eynard, de 600 à 1'000 francs au parc des Eaux-Vives. Ce sont les tarifs publiés par la Ville en novembre 2026." },
      { q: "Faut-il une autorisation pour les photos dans les parcs ?", a: "La Ville soumet à autorisation tout « shooting-photo » sur le domaine public, sans exception publiée pour un mariage. Je pose la question pour votre date au service de l'espace public, et je vous dis ce qu'il en est bien avant le jour J." },
      { q: "Pouvez-vous photographier un civil en semaine et la fête le samedi ?", a: "Oui. Le civil seul tient en une heure ou deux ; on l'ajoute à votre formule, et je vous envoie un prix clair avant que vous réserviez." },
      { q: "Le déplacement à Genève est-il compris ?", a: "Oui. J'habite dans le canton de Vaud, à un peu plus d'une heure, et le déplacement est compris dans toutes mes formules en Suisse romande." },
    ],
    related: [
      { article: "journal-ou-se-marier-geneve.html", articleTitle: "Où se marier à Genève : lieux et décors de rêve" },
      { article: "journal-lieux-mariage-la-cote.html", articleTitle: "Se marier sur La Côte : châteaux, vignes et bord du lac" },
      { article: "journal-spots-photo-couple-leman.html", articleTitle: "Spots photo de couple autour du Léman" },
    ],
  },

  /* ===================== MONTREUX ===================== */
  montreux: {
    slug: "montreux", ville: "Montreux", region: "Riviera",
    h1: "Photographe de mariage à Montreux",
    heroImg: "Les mariés et leurs familles devant le Léman et les Alpes, en Lavaux",
    heroAlt: "Les mariés et leurs familles devant le Léman et les Alpes, en Lavaux",
    heroMobile: true,
    heroHint: "Montreux, Vevey et la Riviera, en reportage. À une demi-heure de chez moi, déplacement compris.",
    intro: {
      lead: "Se marier à Montreux demande de régler trois choses tôt : le civil se fait à Vevey, Chillon n'accueille aucune cérémonie, et début juillet les quais appartiennent au Jazz.",
      paragraphs: [
        "Ces trois points réglés, il reste le lac, les Alpes en face et des hauts à vingt minutes de train. J'habite à Mézières, à une demi-heure de Montreux et un peu moins de Vevey. Ce que vous lisez ici, je l'ai vérifié auprès de l'état civil du canton, du château de Chillon et des communes : les salles, les prix, les règles pour photographier, les semaines où la ville est pleine.",
        "Le jour J, je travaille en reportage : je photographie ce qui se passe, sans le provoquer. La demi-heure de photos à deux, je la place là où la lumière est la plus belle, souvent en fin de journée au bord de l'eau ou sur les hauts, puis je vous rends à vos invités.",
        "Les photos de couple de cette page ont été faites en Lavaux, le vignoble qui commence aux portes de Vevey. C'est une sortie que je propose volontiers entre le civil et l'apéritif.",
      ],
    },
    civil: {
      over: "Le civil sur la Riviera",
      title: "On se marie à Vevey, pas à Montreux.",
      facts: [
        { k: "La salle", v: "La salle des mariages de l'Hôtel de Ville de Vevey, rue du Lac 2. Il n'y en a ni à Montreux ni à La Tour-de-Peilz." },
        { k: "Combien", v: "Une petite salle : 30 places assises et 10 debout, selon l'état civil." },
        { k: "Durée", v: "15 à 30 minutes. La cérémonie est publique, avec deux témoins majeurs." },
        { k: "L'office", v: "Un seul état civil pour tout le canton, avenue de Sévelin 46 à Lausanne. Celui de Vevey a fermé en 2023 ; la salle, elle, est restée." },
        { k: "Un château", v: "Le château d'Aigle fait partie des dix lieux d'exception du canton : 1'500 francs, du jeudi au samedi entre 14 h et 16 h, location du château en plus." },
      ],
      paragraphs: [
        "Quarante personnes, c'est peu. Si vos invités sont plus nombreux, faites le civil en petit comité et réunissez tout le monde pour l'apéritif. Pour les photos, ce n'est pas une perte : les retrouvailles à la sortie sont souvent le moment le plus vivant de la journée.",
        "Chillon, maintenant. Le château l'écrit noir sur blanc : aucune cérémonie n'y est possible, pas même dans la chapelle. Vous pouvez en revanche y faire des photos de mariage à l'intérieur, sur autorisation : 250 francs, entrée comprise pour vous deux et votre photographe, sans flash, sans perche et sans drone. Le règlement demande deux mois d'avance, les formulaires une semaine : prenez la marge large.",
        "Le soir, après la fermeture, certaines salles du château se louent pour un banquet jusqu'à minuit : 45 francs par personne, 4'500 francs au minimum, et rien en décembre ni de janvier à mars. Si c'est votre idée, demandez au château s'il accepte un repas de noces ; ses conditions parlent de banquet.",
      ],
      source: "Sources : [état civil du canton de Vaud](https://www.vd.ch/population/etat-civil/mariage/salles-des-mariages/est-vaudois/vevey) et [château de Chillon](https://www.chillon.ch/faq/), consultés en novembre 2026. En cas de doute, l'état civil et le château font foi.",
    },
    spots: {
      over: "Les photos de couple",
      title: "Du bord du lac aux hauts de Montreux.",
      intro: "Sur la Riviera, on change de décor en quelques minutes de train ou de voiture : l'eau, la vieille ville, les hauts, les vignes. Voici ceux que je propose, avec ce qu'il faut savoir pour chacun.",
      list: [
        { meta: "Montreux · bord du lac", name: "Les quais de Montreux", text: "Près de sept kilomètres de promenade au bord de l'eau, des massifs fleuris et les Alpes en face. La statue de Freddie Mercury est sur la place du Marché, devant le Marché couvert. Tôt le matin, on évite la foule." },
        { meta: "Veytaux · 45 minutes à pied des quais", name: "Chillon, vu du bord du lac", text: "Le chemin du bord du lac mène jusqu'au château. En voiture, le parking est gratuit trois heures avec un disque, mais les places sont comptées. Les images du château posé sur l'eau se font depuis la rive ; pour l'intérieur, voir plus haut." },
        { meta: "Montreux · vieille ville", name: "Les Planches et Saint-Vincent", text: "Les ruelles en pente de la vieille ville, et la terrasse du temple Saint-Vincent, rue du Temple, avec la vue sur le lac. À l'écart des quais, et beaucoup plus calme." },
        { meta: "Les hauts · funiculaire ou train", name: "Glion et Caux", text: "Le funiculaire Territet–Glion monte en six à huit minutes ; le train relie Montreux à Glion en dix minutes et à Caux en vingt-deux. De là-haut, tout le Haut-Lac est devant vous. En mai, quand les narcisses fleurissent sur les hauts, on reste sur les sentiers et on ne cueille rien." },
        { meta: "Vevey", name: "Le quai Perdonnet", text: "La statue de Charlie Chaplin au bord de l'eau, la promenade et le lac très ouvert. La Grande Place, elle, est en chantier : la commune annonce des travaux jusqu'en 2028 environ, et la Grenette reste fermée jusqu'au printemps 2027." },
        { meta: "Lavaux · un quart d'heure", name: "Les vignes de Lavaux", text: "Chardonne est à quatorze minutes de Montreux, Saint-Saphorin à seize. Les vignes sont des propriétés privées : on reste sur les chemins et on ne touche ni aux ceps, ni au raisin, ni aux filets. En automne, pendant les vendanges, on laisse travailler les vignerons." },
      ],
      outro: "Sur la Riviera, je regarde aussi le vent. La bise descend du nord-nord-ouest sur le Haut-Lac ; la vaudaire souffle du sud-est par rafales soudaines, surtout les jours d'orage ou de foehn. Les deux décoiffent : on garde un plan à l'abri pour les voiles et les coiffures.",
    },
    photos: [
      { id: "ville-montreux-p1", alt: "Jeunes mariés enlacés sous un platane, au-dessus du Léman, en Lavaux", caption: "En Lavaux, aux portes de la Riviera" },
      { id: "ville-montreux-p2", alt: "Gros plan sur le bouquet de la mariée et son alliance", caption: "Le bouquet, l'alliance au doigt" },
      { id: "ville-montreux-p3", alt: "Gros plan sur un bouquet de fleurs blanches et orange", caption: "Les fleurs du jour" },
    ],
    journee: {
      over: "Une journée type",
      title: "Un mariage sur la Riviera en juin, heure par heure.",
      intro: "Un exemple, avec un civil à Vevey en début d'après-midi et une réception sur les hauts de Montreux.",
      steps: [
        { t: "11 h 30", title: "Les préparatifs", text: "Chez vous, à l'hôtel ou sur le lieu de réception : les détails, les témoins, les derniers boutons à fermer." },
        { t: "13 h 50", title: "Le civil à Vevey", text: "Dix minutes d'avance à l'Hôtel de Ville, puis les photos de famille à la sortie, avant que tout le monde reparte." },
        { t: "15 h 30", title: "Lavaux, à deux", text: "Quelques minutes de voiture vers Corseaux ou Chardonne, une demi-heure dans les vignes, pendant que vos invités rejoignent l'apéritif." },
        { t: "21 h", title: "Le soir sur le Haut-Lac", text: "Mi-juin, le soleil se couche vers 21 h 25 à Montreux. Vingt minutes au bord de l'eau ou sur une terrasse des hauts, puis je reste pour les discours et la fête." },
      ],
      note: "Du 2 au 17 juillet 2027, pendant le Jazz, on évite les quais de Montreux : Vevey, Lavaux et les hauts restent tranquilles et tout aussi lumineux le soir.",
    },
    savoir: {
      over: "Bon à savoir",
      title: "Ce que je vérifie avant un mariage sur la Riviera.",
      items: [
        { title: "Le Montreux Jazz", text: "Du 2 au 17 juillet 2027, les quais sont occupés du parc Vernex au débarcadère, et la Grand-Rue est fermée le soir. Un mariage à Montreux ces jours-là reste possible, mais les photos se font ailleurs, et les parkings sont pleins." },
        { title: "Le marché de Noël", text: "Montreux Riviera Noël occupe les quais de la fin novembre au 24 décembre. Pour un mariage d'hiver, on part sur les hauts ou à Vevey." },
        { title: "Se garer", text: "Les parkings du Marché-Forum, de la Gare et Donner ne sont pleins tous les trois en même temps que pendant le Jazz et le marché de Noël. À Vevey, le mardi et le samedi matin, jours de marché, la Grande Place n'offre aucune place de parc." },
        { title: "Pour la réception", text: "Les grands hôtels de la Riviera reçoivent des mariages : le Fairmont Le Montreux Palace, le Grand Hotel Suisse Majestic, le Victoria à Glion, Le Mirador au Mont-Pèlerin, et à Vevey l'Hôtel des Trois Couronnes et le Grand Hôtel du Lac. Le château d'Aigle, lui, peut accueillir la cérémonie civile." },
      ],
    },
    tarifs: {
      over: "Les formules",
      title: "Les mêmes prix sur la Riviera.",
      intro: "Montreux est à une demi-heure de chez moi : le déplacement est compris, Vevey, Lavaux et Chillon aussi. Dix photos vous arrivent sous trois à cinq jours, la galerie complète sous quatre semaines. Seule l'autorisation de photographier à l'intérieur du château, 250 francs payés à Chillon, reste à votre charge si vous la voulez.",
    },
    faqTitle: "Vos questions sur un mariage à Montreux.",
    faq: [
      { q: "Peut-on se marier au château de Chillon ?", a: "Non. Le château n'accueille aucune cérémonie, pas même dans la chapelle. Il loue certaines salles le soir pour un banquet, et il autorise des photos de mariage à l'intérieur pour 250 francs, sur demande préalable." },
      { q: "Où a lieu le mariage civil quand on se marie à Montreux ?", a: "La salle la plus proche est celle de l'Hôtel de Ville de Vevey, rue du Lac 2 : il n'y en a pas à Montreux. Pour un cadre de château, celui d'Aigle fait partie des lieux d'exception du canton." },
      { q: "Peut-on faire les photos sur les quais pendant le Montreux Jazz ?", a: "Difficilement : du 2 au 17 juillet 2027, les quais sont pris par le festival. On choisit Vevey, Lavaux ou les hauts de Montreux, où la lumière du soir est tout aussi belle." },
      { q: "Et s'il y a du vent ?", a: "Sur le Haut-Lac, la bise et la vaudaire peuvent souffler fort. Je prévois toujours un endroit à l'abri pour les photos de famille, et on garde le voile pour un moment plus calme." },
      { q: "Le déplacement à Montreux est-il compris ?", a: "Oui. J'habite à Mézières, à une demi-heure : Montreux, Vevey, Lavaux et toute la Riviera sont compris dans le prix." },
      { q: "Quand réserver ?", a: "Pour un samedi de mai à septembre, huit à quatorze mois avant. Je ne prends qu'un mariage par jour : [écrivez-moi votre date](contact.html?type=Mariage), je vous réponds sous 48 heures." },
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
(()=>{const V=window.KC_VILLE[window.KC_VILLE_SLUG],VP=V.presta||{slug:"mariage",href:"mariages.html",label:"mariage",crumb:"Mariages",card:"La prestation mariage"},VLOCAL=VP.label.charAt(0).toUpperCase()+VP.label.slice(1)+" \xE0 "+V.ville,H2={fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"};function Rich({text}){const parts=[],re=/\[([^\]]+)\]\(([^)]+)\)/g;let last=0,m,k=0;for(;(m=re.exec(text))!==null;){m.index>last&&parts.push(text.slice(last,m.index));const external=/^https?:/.test(m[2]);parts.push(React.createElement("a",{key:k++,href:m[2],className:"art-ilink",...external?{target:"_blank",rel:"noopener"}:{}},m[1])),last=m.index+m[0].length}return last<text.length&&parts.push(text.slice(last)),React.createElement(React.Fragment,null,parts)}function VilleReassure(){const points=["D\xE9placement inclus \xE0 "+V.ville,"R\xE9ponse sous 48 h"];return VP.slug==="mariage"&&points.push("1 seul mariage par jour"),points.push("Tarifs transparents"),React.createElement("section",{className:"reassure s-dark","aria-label":"Engagements"},React.createElement("div",{className:"wrap reassure-row"},points.map((p,i)=>React.createElement("div",{key:i,className:"reassure-item"},React.createElement("span",{className:"rdot"}),p))))}function Civil(){const C=V.civil;return C?React.createElement("section",{className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},C.over),React.createElement("h2",{className:"display reveal d1",style:{...H2,maxWidth:"24ch"}},C.title),React.createElement("div",{className:"vciv"},React.createElement("dl",{className:"vfacts reveal d1"},C.facts.map((f,i)=>React.createElement("div",{key:i},React.createElement("dt",null,f.k),React.createElement("dd",null,React.createElement(Rich,{text:f.v}))))),React.createElement("div",{className:"vbody reveal d2"},C.paragraphs.map((p,i)=>React.createElement("p",{key:i},React.createElement(Rich,{text:p}))),C.source&&React.createElement("p",{className:"vsrc"},React.createElement(Rich,{text:C.source})))))):null}function Spots(){const S=V.spots;return S?React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},S.over),React.createElement("h2",{className:"display reveal d1",style:{...H2,maxWidth:"22ch"}},S.title),S.intro&&React.createElement("p",{className:"vintro reveal d1"},React.createElement(Rich,{text:S.intro})),React.createElement("div",{className:"vspots"},S.list.map((s,i)=>React.createElement("article",{key:i,className:"vspot reveal"},React.createElement("div",{className:"vspot-meta"},s.meta),React.createElement("h3",null,s.name),React.createElement("p",null,React.createElement(Rich,{text:s.text}))))),S.outro&&React.createElement("p",{className:"vintro vout reveal"},React.createElement(Rich,{text:S.outro})))):null}function Photos(){const P=V.photos;return!P||P.length===0?null:React.createElement("section",{className:"sec s-dark vphotos-sec","aria-label":"Images de mariage"},React.createElement("div",{className:"wrap vphotos","data-lb-group":!0},P.map(p=>React.createElement("figure",{key:p.id,className:"reveal"},React.createElement("div",{className:"vph"},React.createElement(Slot,{id:p.id,ph:p.alt,alt:p.alt,style:{width:"100%",height:"100%"}})),React.createElement("figcaption",null,p.caption)))))}function Journee(){const J=V.journee;return J?React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},J.over),React.createElement("h2",{className:"display reveal d1",style:{...H2,maxWidth:"24ch"}},J.title),J.intro&&React.createElement("p",{className:"vintro reveal d1"},React.createElement(Rich,{text:J.intro})),React.createElement("div",{className:"steps vsteps"+(J.steps.length===3?" three":"")},J.steps.map((s,i)=>React.createElement("div",{key:i,className:"step reveal d"+(i+1)},React.createElement("div",{className:"sn"},s.t),React.createElement("h3",null,s.title),React.createElement("p",null,React.createElement(Rich,{text:s.text}))))),J.note&&React.createElement("p",{className:"vintro vout reveal"},React.createElement(Rich,{text:J.note})))):null}function Savoir(){const S=V.savoir;return S?React.createElement("section",{className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},S.over),React.createElement("h2",{className:"display reveal d1",style:{...H2,maxWidth:"22ch"}},S.title),React.createElement("div",{className:"vnotes"},S.items.map((n,i)=>React.createElement("div",{key:i,className:"vnote reveal"},React.createElement("h3",null,n.title),React.createElement("p",null,React.createElement(Rich,{text:n.text}))))))):null}function Tarifs(){const T=V.tarifs,F=window.KC_PRESTA&&window.KC_PRESTA.mariage?window.KC_PRESTA.mariage.formules:null;return!T||!F?null:React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},T.over),React.createElement("h2",{className:"display reveal d1",style:{...H2,maxWidth:"24ch"}},T.title),React.createElement("p",{className:"vintro reveal d1"},React.createElement(Rich,{text:T.intro})),React.createElement("div",{className:"tr-formules vformules reveal d1"},F.map(f=>React.createElement("div",{key:f.name,className:"tr-card"+(f.feature?" feature":"")},React.createElement("div",{className:"tr-tag"},f.tag),React.createElement("h3",null,f.name),React.createElement("div",{className:"tr-price"},f.price)))),React.createElement("div",{className:"vcta reveal"},React.createElement("a",{href:"mariages.html",className:"link-arrow"},"Le d\xE9tail des formules ",React.createElement("span",{className:"ar"},"\u2192")),React.createElement("a",{href:"contact.html?type=Mariage",className:"link-arrow"},"V\xE9rifier ma date ",React.createElement("span",{className:"ar"},"\u2192")))))}function VillesSoeurs(){const others=Object.values(window.KC_VILLE).filter(o=>o.slug!==V.slug&&(o.presta||{slug:"mariage"}).slug===VP.slug);if(others.length===0)return null;const Cap=VP.label.charAt(0).toUpperCase()+VP.label.slice(1);return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap",style:{textAlign:"center"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Par r\xE9gion"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",margin:"18px 0 clamp(28px,3.5vw,44px)"}},"Je me d\xE9place aussi ailleurs."),React.createElement("div",{className:"villes-row reveal d1"},others.map(o=>React.createElement("a",{key:o.slug,href:"photographe-"+(o.presta?o.slug:"mariage-"+o.slug)+".html",className:"ville-chip"},Cap," \xE0 ",o.ville," ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("a",{href:VP.href,className:"ville-chip"},"Partout en Suisse romande ",React.createElement("span",{className:"ar"},"\u2192")))))}function VilleApp(){const[t,setTweak]=useTweaks({palette:KC.PALETTES["Noir chaud"],heading:"Cinzel",body:"Jost"});useApplyTweaks(t),useReveal([]);const heroAlt=V.heroAlt||V.h1+" \u2014 Kevin Chinelli, photographe en Suisse romande";return React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,{active:VP.slug}),React.createElement("main",null,React.createElement("section",{className:"phero bas"},React.createElement("div",{className:"bg"},React.createElement(Slot,{id:"ville-hero-"+V.slug,ph:V.heroImg,alt:heroAlt,loading:"eager",fetchpriority:"high",media:V.heroMobile?"(min-width:601px)":void 0,style:{width:"100%",height:"100%"}}),V.heroMobile&&React.createElement(Slot,{id:"ville-hero-"+V.slug+"-mobile",ph:V.heroImg,alt:heroAlt,loading:"eager",fetchpriority:"high",media:"(max-width:600px)",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"scrim"}),React.createElement("div",{className:"phero-content"},React.createElement("div",{className:"crumb reveal in"},React.createElement("a",{href:KC.HOME},"Accueil"),React.createElement("span",null,"/"),React.createElement("a",{href:VP.href},VP.crumb),React.createElement("span",null,"/"),React.createElement("span",null,V.ville)),React.createElement("h1",{className:"reveal in d1"},V.h1),React.createElement("p",{className:"hint reveal in d2"},V.heroHint))),React.createElement(VilleReassure,null),React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},VLOCAL),React.createElement("div",{className:"intro-grid",style:{marginTop:"clamp(34px,4vw,58px)"}},React.createElement("p",{className:"lead reveal d1"},V.intro.lead),React.createElement("div",{className:"body reveal d2"},V.intro.paragraphs.map((p,i)=>React.createElement("p",{key:i},React.createElement(Rich,{text:p}))),V.intro.quote&&React.createElement("div",{className:"intro-quote"},V.intro.quote))))),React.createElement(Civil,null),React.createElement(Spots,null),React.createElement(Photos,null),React.createElement(Journee,null),React.createElement(Savoir,null),React.createElement(Tarifs,null),V.lieux&&!V.spots&&React.createElement("section",{className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap-narrow"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(30px,4vw,52px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Rep\xE9rage"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"}},V.lieux.title)),React.createElement("ul",{className:"art-list reveal d1"},V.lieux.list.map((li,i)=>React.createElement("li",{key:i},li))))),!V.tarifs&&React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap related-grid",style:{gridTemplateColumns:"1fr 1fr"}},React.createElement("a",{href:VP.href,className:"related-card reveal"},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"ville-cta-presta-"+V.slug,ph:VP.card,alt:VP.card+" en Suisse romande \u2014 Kevin Chinelli",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,VP.card),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192"))),React.createElement("a",{href:"tarifs.html",className:"related-card reveal d1"},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"ville-cta-tarif-"+V.slug,ph:"Tarifs photographe Suisse romande",alt:"Tarifs photographe en Suisse romande",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,"Voir les tarifs"),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192"))))),React.createElement("section",{className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap-narrow"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(34px,4vw,56px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Questions fr\xE9quentes"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(28px,3.4vw,46px)",marginTop:"20px"}},V.faqTitle||VLOCAL+".")),React.createElement("div",{className:"faq reveal d1"},V.faq.map((f,i)=>React.createElement("details",{key:i,open:i===0},React.createElement("summary",null,f.q,React.createElement("span",{className:"pm"})),React.createElement("div",{className:"ans"},React.createElement(Rich,{text:f.a}))))),V.related&&V.related.length>0&&React.createElement("div",{className:"ville-reads reveal"},V.related.map(r=>React.createElement("a",{key:r.article,href:r.article,className:"link-arrow"},"\xC0 lire : ",r.articleTitle," ",React.createElement("span",{className:"ar"},"\u2192")))))),React.createElement(VillesSoeurs,null),React.createElement(CtaContact,{overline:VLOCAL,title:VP.slug==="mariage"?"V\xE9rifions votre date.":"R\xE9servez votre s\xE9ance."})),React.createElement(Footer,null))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(VilleApp,null));})();

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
