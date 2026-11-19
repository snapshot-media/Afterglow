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
(()=>{const{useState,useEffect,useRef}=React,PALETTES={"Noir chaud":["#141210","#b9926b","#f8f5ef"],"Noir profond":["#0f0e0d","#9a8f7e","#efe9df"],Anthracite:["#16181a","#8a97a0","#eef0f1"],"Ardoise cuivre":["#12100f","#a9744f","#f3ede4"]},PALETTE_OPTS=Object.values(PALETTES),HEAD_FONTS={Cinzel:'"Cinzel", Georgia, serif',Cormorant:'"Cormorant Garamond", Georgia, serif'},BODY_FONTS={Jost:'"Jost", system-ui, sans-serif',Mulish:'"Mulish", system-ui, sans-serif'},TWEAK_DEFAULTS={palette:["#141210","#b9926b","#f8f5ef"],heading:"Cinzel",body:"Jost",heroVariant:"a",prestaLayout:"grille",aboutLayout:"split"},LIFESTYLE_SUB=[{slug:"solo",title:"Solo",href:"solo.html"},{slug:"couple",title:"Couple",href:"couple.html"},{slug:"famille",title:"Famille",href:"famille.html"}],PRESTATIONS=[{n:"01",title:"Mariages",id:"presta-mariage",href:"mariages.html",img:"Photo de groupe d'un mariage au bord du L\xE9man",text:"De la promesse \xE9chang\xE9e aux derniers pas de danse \u2014 une narration sensible et discr\xE8te de votre journ\xE9e, au plus pr\xE8s de l'\xE9motion, sans mise en sc\xE8ne inutile."},{n:"02",title:"Lifestyle",id:"presta-portrait",href:"portraits.html",img:"S\xE9ance lifestyle \u2014 portrait en lumi\xE8re naturelle, Suisse romande",text:"Seul, \xE0 deux ou en famille : des images vraies, en lumi\xE8re naturelle, dans un lieu qui vous ressemble."},{n:"03",title:"Studio",id:"presta-studio",href:"studio.html",img:"Portrait en studio sur fond sombre",text:"Portraits \xE9ditoriaux en studio. Lumi\xE8re ma\xEEtris\xE9e, direction soign\xE9e et tirages d'exception pour une pr\xE9sence qui marque."},{n:"04",title:"Maternit\xE9 & Grossesse",short:"Maternit\xE9",id:"presta-maternite",href:"maternite-grossesse.html",img:"S\xE9ance grossesse en lumi\xE8re naturelle, champ de bl\xE9",text:"La douceur de l'attente, saisie en studio ou en lumi\xE8re naturelle. Des images intemporelles, dans l'intimit\xE9 et le calme du moment."}],WHATSAPP="https://wa.me/41798507603?text="+encodeURIComponent("Bonjour Kevin, je vous \xE9cris depuis le site Afterglow au sujet d'une s\xE9ance photo : ");function Slot({id,ph,alt,style,loading,fetchpriority}){return React.createElement("image-slot",{id,shape:"rect",fit:"cover",placeholder:ph,alt:alt||ph,"aria-label":alt||ph,role:"img",style,loading,fetchpriority})}function Overline({children,className=""}){return React.createElement("div",{className:"overline "+className},React.createElement("span",{className:"tick"}),children)}function Nav(){const[scrolled,setScrolled]=useState(!1),[open,setOpen]=useState(!1);useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>40);return onScroll(),window.addEventListener("scroll",onScroll,{passive:!0}),()=>window.removeEventListener("scroll",onScroll)},[]),useEffect(()=>(document.body.style.overflow=open?"hidden":"",()=>{document.body.style.overflow=""}),[open]);const menu=ReactDOM.createPortal(React.createElement("div",{className:"mobile-menu"+(open?" is-open":""),onClick:()=>setOpen(!1)},React.createElement("div",{className:"mm-inner",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"mm-group"},React.createElement("span",{className:"mm-label"},"Prestations"),PRESTATIONS.map(p=>[React.createElement("a",{key:p.id,href:p.href,onClick:()=>setOpen(!1)},p.title),...p.id==="presta-portrait"?LIFESTYLE_SUB.map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"mm-sub",onClick:()=>setOpen(!1)},c.title)):[]])),React.createElement("a",{className:"mm-top",href:"portfolio.html",onClick:()=>setOpen(!1)},"Portfolio"),React.createElement("a",{className:"mm-top",href:"tarifs.html",onClick:()=>setOpen(!1)},"Tarifs"),React.createElement("a",{className:"mm-top",href:"journal.html",onClick:()=>setOpen(!1)},"Journal"),React.createElement("a",{className:"mm-top",href:"apropos.html",onClick:()=>setOpen(!1)},"\xC0 propos"),React.createElement("a",{className:"mm-top",href:"#contact",onClick:()=>setOpen(!1)},"Contact"))),document.body);return React.createElement(React.Fragment,null,React.createElement("nav",{className:"nav"+(scrolled?" scrolled":"")+(open?" menu-open":"")},React.createElement("a",{href:"#hero",className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"nav-links"},React.createElement("div",{className:"nav-item nav-extra"},React.createElement("a",{href:PRESTATIONS[0].href,"aria-haspopup":"true"},"Prestations",React.createElement("span",{className:"caret"},"\u25BE")),React.createElement("div",{className:"nav-drop"},PRESTATIONS.map(p=>[React.createElement("a",{key:p.id,href:p.href},p.title),...p.id==="presta-portrait"?LIFESTYLE_SUB.map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"nd-sub"},c.title)):[]]))),React.createElement("a",{href:"portfolio.html",className:"nav-extra"},"Portfolio"),React.createElement("a",{href:"tarifs.html",className:"nav-extra"},"Tarifs"),React.createElement("a",{href:"journal.html",className:"nav-extra"},"Journal"),React.createElement("a",{href:"apropos.html",className:"nav-extra"},"\xC0 propos"),React.createElement("a",{href:"#contact",className:"nav-cta"},"Contact")),React.createElement("button",{className:"nav-burger","aria-label":"Ouvrir le menu","aria-expanded":open,onClick:()=>setOpen(o=>!o)},React.createElement("span",null),React.createElement("span",null))),menu)}const HOME_HERO={over:"Photographe en Suisse romande",title:"Afterglow",by:"by Kevin Chinelli",tag:"L'\xE9motion d'un instant, et la lumi\xE8re qui s'attarde."};function HeroCtas({light}){return React.createElement("div",{className:"hh-ctas reveal in d3"},React.createElement("a",{className:"hh-btn"+(light?" on-img":""),href:"contact.html"},"R\xE9server une date ",React.createElement("span",{className:"ar"},"\u2192")),React.createElement("a",{className:"hh-link",href:"portfolio.html"},"Voir le portfolio"))}function HomeHero({variant="a"}){const H=HOME_HERO;return variant==="b"?React.createElement("section",{id:"hero",className:"hhero vb"},React.createElement("div",{className:"hh-text"},React.createElement("h1",{className:"hh-h1"},React.createElement("span",{className:"overline hh-over reveal in"},H.over),React.createElement("span",{className:"hh-title reveal in d1"},H.title)),React.createElement("div",{className:"hh-by reveal in d1"},H.by),React.createElement("p",{className:"hh-tag reveal in d2"},H.tag),React.createElement(HeroCtas,null),React.createElement("div",{className:"hh-meta reveal in d3"},"Mariage \xB7 Couple \xB7 Studio \xB7 Maternit\xE9")),React.createElement("div",{className:"hh-img"},React.createElement(Slot,{id:"home-hero-split",ph:"Image hero \u2014 portrait vertical",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}}))):variant==="c"?React.createElement("section",{id:"hero",className:"hhero vc"},React.createElement("div",{className:"hh-inner"},React.createElement("div",{className:"hh-kicker reveal in"},H.title," \u2014 ",H.by),React.createElement("h1",{className:"hh-statement reveal in d1"},"L'\xE9motion d'un instant,",React.createElement("br",null),React.createElement("em",null,"et la lumi\xE8re qui s'attarde.")),React.createElement(HeroCtas,null)),React.createElement("div",{className:"hh-strip reveal in d2"},React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"home-hero-strip-1",ph:"S\xE9lection \u2014 1",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"home-hero-strip-2",ph:"S\xE9lection \u2014 2",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"home-hero-strip-3",ph:"S\xE9lection \u2014 3",style:{width:"100%",height:"100%"}})))):React.createElement("section",{id:"hero",className:"hhero va"},React.createElement("div",{className:"hh-bg"},React.createElement(Slot,{id:"home-hero-full",ph:"Image hero \u2014 pleine page",alt:"Portrait en lumi\xE8re d'automne, en for\xEAt \u2014 Kevin Chinelli, photographe en Suisse romande",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}}),React.createElement(Slot,{id:"home-hero-mobile",ph:"Image hero \u2014 portrait mobile",alt:"Portrait en lumi\xE8re d'automne, en for\xEAt \u2014 Kevin Chinelli, photographe en Suisse romande",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"scrim"}),React.createElement("div",{className:"hh-inner"},React.createElement("h1",{className:"hh-h1"},React.createElement("span",{className:"overline hh-over reveal in"},H.over),React.createElement("span",{className:"hh-title reveal in d1"},H.title)),React.createElement("div",{className:"hh-by reveal in d1"},H.by),React.createElement("p",{className:"hh-tag reveal in d2"},H.tag),React.createElement(HeroCtas,{light:!0}),React.createElement("div",{className:"hh-meta on-img reveal in d3"},"Mariage \xB7 Couple \xB7 Famille \xB7 Studio \xB7 Maternit\xE9")),React.createElement("div",{className:"hh-scroll reveal in d3"},React.createElement("svg",{viewBox:"0 0 14 52",fill:"none",stroke:"currentColor",strokeWidth:"0.9",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},React.createElement("line",{x1:"7",y1:"1",x2:"7",y2:"41"}),React.createElement("polyline",{points:"1 35 7 41 13 35"}))))}const ABOUT_INTRO="Depuis une dizaine d'ann\xE9es que je travaille \xE0 travers l'image, j'ai appris une chose : les moments qui comptent ne se mettent pas en sc\xE8ne. Mon travail, c'est d'\xEAtre l\xE0 \u2014 attentif, discret, \xE0 l'\xE9coute \u2014 au moment exact o\xF9 quelque chose de vrai se passe.";function About(){return React.createElement("section",{id:"about",className:"sec s-light pad-y about-ed"},React.createElement("div",{className:"wrap about-ed-grid"},React.createElement("div",{className:"about-ed-text"},React.createElement(Overline,{className:"reveal"},"Photographe \xB7 Suisse romande"),React.createElement("h2",{className:"display about-ed-hdl reveal d1"},"Pour les moments qui m\xE9ritent de rester."),React.createElement("p",{className:"about-ed-intro reveal d1"},"Des mariages aux portraits de famille, je travaille au plus pr\xE8s de ce qui se passe vraiment \u2014 avec discr\xE9tion, patience, et le regard de quelqu'un qui cherche l'\xE9motion juste plut\xF4t que la belle image convenue."),React.createElement("hr",{className:"hair about-ed-rule reveal d2"}),React.createElement("p",{className:"about-ed-name reveal d2"},"Kevin Chinelli"),React.createElement("p",{className:"reveal d2"},ABOUT_INTRO),React.createElement("a",{href:"apropos.html",className:"link-arrow reveal d3"},"En savoir plus ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("div",{className:"about-ed-photo reveal d2"},React.createElement("figure",{className:"about-ed-frame"},React.createElement(Slot,{id:"about-photo",ph:"Kevin Chinelli \u2014 photographe en Suisse romande",alt:"Kevin Chinelli, photographe en Suisse romande",loading:"lazy",style:{width:"100%",height:"100%"}})))))}function PrestationsBandes(){return React.createElement("div",null,PRESTATIONS.map((p,i)=>React.createElement("div",{key:p.id,className:"band reveal "+(i%2===1?"flip":"")},React.createElement("div",{className:"band-img"},React.createElement(Slot,{id:p.id,ph:p.img,style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"band-txt"},React.createElement("div",{className:"num"},p.n),React.createElement("h3",null,p.title),React.createElement("p",null,p.text),React.createElement("a",{href:p.href,className:"link-arrow",style:{marginTop:"6px"}},"D\xE9couvrir ",React.createElement("span",{className:"ar"},"\u2192"))))))}function PrestationsGrille(){return React.createElement("div",{className:"wrap",style:{paddingBottom:"clamp(90px,12vw,170px)"}},React.createElement("div",{className:"svc-grid"},PRESTATIONS.map(p=>React.createElement("a",{key:p.id,href:p.href,className:"svc-card reveal"},React.createElement(Slot,{id:p.id,ph:p.img,style:{width:"100%",height:"100%"}}),React.createElement("div",{className:"veil"}),React.createElement("div",{className:"svc-body"},React.createElement("div",{className:"num"},p.n),React.createElement("h3",null,p.title),React.createElement("span",{className:"link-arrow"},"D\xE9couvrir ",React.createElement("span",{className:"ar"},"\u2192")))))))}function Prestations({layout}){return React.createElement("section",{id:"prestations",className:"sec s-dark"},React.createElement("div",{className:"wrap",style:{paddingTop:"clamp(90px,12vw,150px)",paddingBottom:"clamp(50px,6vw,80px)",textAlign:"center"}},React.createElement(Overline,{className:"reveal"},"Prestations"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(30px,4vw,56px)",marginTop:"22px"}},"\xC0 chaque histoire, son \xE9criture.")),React.createElement(layout==="grille"?PrestationsGrille:PrestationsBandes,null))}function Gallery(){return React.createElement("section",{id:"portfolio",className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{style:{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:"clamp(34px,4vw,60px)",flexWrap:"wrap",gap:"20px"}},React.createElement("div",null,React.createElement(Overline,{className:"reveal"},"Travaux choisis"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(28px,3.4vw,48px)",marginTop:"18px"}},"Une s\xE9lection.")),React.createElement("a",{href:"portfolio.html",className:"link-arrow reveal d1"},"Voir le portfolio ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("div",{className:"gal-mosaic reveal d1","data-lb-group":"portfolio"},React.createElement("div",{className:"gm-cell gm-p3"},React.createElement(Slot,{id:"home-p3",ph:"Portrait lifestyle en ext\xE9rieur, chapeau et fleurs",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-m5"},React.createElement(Slot,{id:"home-m5",ph:"Mariage \u2014 la mari\xE9e et deux enfants d'honneur",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-m6"},React.createElement(Slot,{id:"home-m6",ph:"Mariage \u2014 la mari\xE9e et son bouquet",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-g5"},React.createElement(Slot,{id:"home-g5",ph:"S\xE9ance grossesse \xE0 contre-jour",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-p5"},React.createElement(Slot,{id:"home-p5",ph:"Portrait lifestyle au bord du L\xE9man",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"gm-cell gm-m8"},React.createElement(Slot,{id:"home-m8",ph:"Mariage \u2014 d\xE9tail des fleurs",style:{width:"100%",height:"100%"}})))))}const PROCESS=[{n:"01",title:"On se parle",text:"Un \xE9change sans engagement pour comprendre votre projet, vos envies, et trouver ensemble la date id\xE9ale."},{n:"02",title:"La s\xE9ance",text:"Je vous guide avec discr\xE9tion. Pas de poses fig\xE9es \u2014 juste la lumi\xE8re, le moment, ce qui se passe naturellement."},{n:"03",title:"La s\xE9lection",text:"Je prends le temps de s\xE9lectionner et retoucher chaque image avec soin. Votre galerie est pr\xEAte sous trois semaines."},{n:"04",title:"La livraison",text:"Vos photos en haute r\xE9solution, dans une galerie priv\xE9e en ligne. Des souvenirs pour toujours."}];function Process(){return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},"Comment \xE7a se passe"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(28px,3.4vw,48px)",marginTop:"18px",marginBottom:"clamp(50px,7vw,90px)"}},"De la prise de contact",React.createElement("br",null),"\xE0 vos souvenirs."),React.createElement("div",{className:"process-grid"},PROCESS.map((s,i)=>React.createElement("div",{key:s.n,className:"process-step reveal d"+(i+1)},React.createElement("div",{className:"process-num"},s.n),React.createElement("h3",{className:"process-title"},s.title),React.createElement("p",{className:"process-text"},s.text))))))}function Contact(){const[sent,setSent]=useState(!1),[err,setErr]=useState({}),[sending,setSending]=useState(!1),[sendError,setSendError]=useState("");return React.createElement("section",{id:"contact",className:"sec s-darker contact"},React.createElement("div",{className:"wrap pad-y"},React.createElement("div",{className:"grid",style:{textAlign:"center"}},React.createElement("div",null,React.createElement(Overline,{className:"reveal"},"Parlons de votre projet"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(34px,5.4vw,70px)",marginTop:"22px"}},"R\xE9servez votre date.")),sent?React.createElement("div",{className:"form-sent reveal d2"},React.createElement("div",{className:"fs-mark"},"\u2713"),React.createElement("h3",null,"Merci, votre demande est bien partie."),React.createElement("p",null,"Je l'ai bien re\xE7ue et je vous r\xE9ponds personnellement sous 48\xA0h ouvr\xE9es. \xC0 tr\xE8s vite\xA0!"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch",className:"link-arrow"},"contact@afterglowbykevin.ch ",React.createElement("span",{className:"ar"},"\u2192"))):React.createElement("form",{className:"form reveal d2",noValidate:!0,onSubmit:async e=>{e.preventDefault();const f=e.target,data={nom:f.nom.value.trim(),email:f.email.value.trim(),type:f.type.value,message:f.message.value.trim()},errs={};if(data.nom||(errs.nom="Indiquez votre nom."),/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)||(errs.email="Adresse email invalide."),data.message||(errs.message="\xC9crivez quelques mots sur votre projet."),setErr(errs),!Object.keys(errs).length){setSending(!0),setSendError("");try{const res=await fetch("contact.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}),j=await res.json().catch(()=>({}));res.ok&&j&&j.ok?(setSent(!0),window.umami&&window.umami.track("demande-envoyee",{type:data.type||"non pr\xE9cis\xE9",page:"accueil"})):res.status===429?setSendError("Trop d'envois en peu de temps. Patientez quelques minutes, puis r\xE9essayez."):setSendError("Une erreur est survenue \xE0 l'envoi. R\xE9essayez, ou \xE9crivez-moi directement \xE0 contact@afterglowbykevin.ch.")}catch{setSendError("Connexion impossible. V\xE9rifiez votre r\xE9seau, ou \xE9crivez-moi \xE0 contact@afterglowbykevin.ch.")}finally{setSending(!1)}}}},React.createElement("div",{className:"field-row"},React.createElement("div",{className:"field"+(err.nom?" error":"")},React.createElement("label",{htmlFor:"hc-nom"},"Nom"),React.createElement("input",{className:"control",id:"hc-nom",name:"nom",type:"text",placeholder:"Votre nom",autoComplete:"name"}),err.nom&&React.createElement("span",{className:"field-err"},err.nom)),React.createElement("div",{className:"field"+(err.email?" error":"")},React.createElement("label",{htmlFor:"hc-email"},"Email"),React.createElement("input",{className:"control",id:"hc-email",name:"email",type:"email",placeholder:"vous@email.com",autoComplete:"email"}),err.email&&React.createElement("span",{className:"field-err"},err.email))),React.createElement("div",{className:"field"},React.createElement("label",{htmlFor:"hc-type"},"Type de shooting"),React.createElement("select",{className:"control",id:"hc-type",name:"type",defaultValue:""},React.createElement("option",{value:"",disabled:!0},"S\xE9lectionner"),PRESTATIONS.map(p=>React.createElement("option",{key:p.id,value:p.title},p.title)),React.createElement("option",{value:"autre"},"Autre"))),React.createElement("div",{className:"field"+(err.message?" error":"")},React.createElement("label",{htmlFor:"hc-message"},"Message"),React.createElement("textarea",{className:"control",id:"hc-message",name:"message",rows:"4",placeholder:"Parlez-moi de votre projet, de la date envisag\xE9e\u2026"}),err.message&&React.createElement("span",{className:"field-err"},err.message)),sendError&&React.createElement("span",{className:"field-err",style:{display:"block",marginBottom:"12px"}},sendError),React.createElement("button",{className:"btn-submit",type:"submit",disabled:sending},sending?"Envoi\u2026":"Envoyer"," ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("div",{className:"contact-direct reveal d3"},React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch","data-umami-event":"email"},"contact@afterglowbykevin.ch")))))}function Footer(){return React.createElement("footer",{className:"s-dark",style:{borderTop:"1px solid var(--line-d)"}},React.createElement("div",{className:"footer"},React.createElement("div",{className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"copy"},"\xA9 2026 \u2014 Tous droits r\xE9serv\xE9s \xB7 Site cr\xE9\xE9 par ",React.createElement("a",{href:"https://snapshotmedia.ch",target:"_blank",rel:"noopener"},"Snapshot Media")),React.createElement("div",{className:"social"},React.createElement("a",{href:"apropos.html"},"\xC0 propos"),React.createElement("a",{href:"confidentialite.html"},"Confidentialit\xE9"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener","data-umami-event":"instagram"},"Instagram"),React.createElement("a",{href:"https://g.page/r/Ccd14Q8WzKZuEBM",target:"_blank",rel:"noopener","data-umami-event":"fiche-google"},"Google"),React.createElement("a",{href:WHATSAPP,target:"_blank",rel:"noopener","data-umami-event":"whatsapp"},"WhatsApp"),React.createElement("a",{href:"tel:+41798507603","data-umami-event":"telephone"},"+41 79 850 76 03"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch","data-umami-event":"email"},"contact@afterglowbykevin.ch"))))}function App(){const[t,setTweak]=useTweaks(TWEAK_DEFAULTS);return useEffect(()=>{const r=document.documentElement.style;Array.isArray(t.palette)&&(r.setProperty("--bg",t.palette[0]),r.setProperty("--accent",t.palette[1]),r.setProperty("--cream",t.palette[2])),r.setProperty("--font-display",HEAD_FONTS[t.heading]||HEAD_FONTS.Cinzel),r.setProperty("--font-body",BODY_FONTS[t.body]||BODY_FONTS.Jost)},[t.palette,t.heading,t.body]),useEffect(()=>{function ease(t2){return t2<.5?4*t2*t2*t2:(t2-1)*(2*t2-2)*(2*t2-2)+1}function smoothTo(target,dur){const start=window.scrollY,dist=target-start;let t0=null;document.documentElement.style.scrollBehavior="auto";function step(now){t0||(t0=now);const p=Math.min((now-t0)/dur,1);window.scrollTo(0,start+dist*ease(p)),p<1?requestAnimationFrame(step):document.documentElement.style.scrollBehavior=""}requestAnimationFrame(step)}function onClick(e){const a=e.target.closest('a[href^="#"]');if(!a)return;const id=a.getAttribute("href").slice(1),el=id?document.getElementById(id):null;if(id&&!el)return;e.preventDefault(),window._stopInertia&&window._stopInertia();const y=el?el.getBoundingClientRect().top+window.scrollY:0;smoothTo(y,900)}return document.addEventListener("click",onClick),()=>document.removeEventListener("click",onClick)},[]),useEffect(()=>{const reveal=()=>{const vh=window.innerHeight;document.querySelectorAll(".reveal:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();r.top<vh*.88&&r.bottom>0&&el.classList.add("in")})};reveal(),window.addEventListener("scroll",reveal,{passive:!0}),window.addEventListener("resize",reveal);const id=setTimeout(reveal,200);return()=>{window.removeEventListener("scroll",reveal),window.removeEventListener("resize",reveal),clearTimeout(id)}},[t.prestaLayout,t.aboutLayout,t.heroVariant]),React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,null),React.createElement("main",null,React.createElement(HomeHero,{variant:t.heroVariant}),React.createElement(About,null),React.createElement(Prestations,{layout:t.prestaLayout}),React.createElement(Gallery,null),React.createElement(Process,null),React.createElement(Contact,null)),React.createElement(Footer,null))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App,null));})();

;
/* ============================================================
   KEVIN CHINELLI — persistent conversion CTA + WhatsApp
   Vanilla, injected on every page (no React dependency).
   ⚠️ Replace KC_PHONE with the real number before going live.
   ============================================================ */
(function () {
  if (window.__kcCta) return; window.__kcCta = true;

  var KC_PHONE = "41798507603"; // format international sans "+" ni espaces
  var WA_TEXT  = encodeURIComponent("Bonjour Kevin, j'aimerais des informations pour une séance photo.");
  var here = (location.pathname.split("/").pop() || "").toLowerCase();
  if (here === "contact.html") return; // inutile sur la page contact

  var css = ''
    + '.kc-cta{position:fixed;right:clamp(16px,2.4vw,28px);bottom:clamp(16px,2.4vw,28px);z-index:880;'
    + '  display:flex;flex-direction:column;align-items:flex-end;gap:12px;'
    + '  font-family:var(--font-body,system-ui,sans-serif);'
    + '  opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}'
    + '.kc-cta.in{opacity:1;transform:none}'
    + '.kc-cta a{text-decoration:none}'
    + '.kc-wa{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;'
    + '  background:#1f1d1a;border:1px solid rgba(242,237,230,.16);color:#f2ede6;'
    + '  box-shadow:0 10px 30px rgba(0,0,0,.34);transition:transform .35s cubic-bezier(.2,.7,.2,1),background .35s,border-color .35s}'
    + '.kc-wa:hover{transform:translateY(-3px);background:#262320;border-color:var(--accent,#b9926b)}'
    + '.kc-wa svg{width:25px;height:25px;display:block}'
    + '.kc-devis{display:inline-flex;align-items:center;gap:11px;'
    + '  padding:14px 22px;border-radius:999px;background:var(--accent,#b9926b);color:#141210;'
    + '  font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:500;'
    + '  box-shadow:0 12px 34px rgba(0,0,0,.32);transition:transform .35s cubic-bezier(.2,.7,.2,1),filter .35s}'
    + '.kc-devis:hover{transform:translateY(-3px);filter:brightness(1.06)}'
    + '.kc-devis .ar{transition:transform .4s cubic-bezier(.2,.7,.2,1)}'
    + '.kc-devis:hover .ar{transform:translateX(5px)}'
    + '@media(max-width:600px){.kc-devis{padding:12px 18px;font-size:11px}.kc-wa{width:48px;height:48px}}'
    + '@media print{.kc-cta{display:none}}'
    + '@media (prefers-reduced-motion:reduce){.kc-cta{transition:none;opacity:1;transform:none}}';

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var waSvg = '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.2 1.6 6L4 29l8.2-1.6c1.7.9 3.7 1.4 5.8 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-4.9 1 1-4.7-.2-.4c-1-1.6-1.5-3.4-1.5-5.3C4.4 9.9 9.1 5.2 16 5.2S27.6 9.9 27.6 15 22.9 24.8 16 24.8zm6.5-7.3c-.4-.2-2.1-1-2.4-1.1-.3-.1-.6-.2-.8.2-.2.4-.9 1.1-1.1 1.3-.2.2-.4.2-.8.1-.4-.2-1.5-.6-2.9-1.8-1.1-1-1.8-2.2-2-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.5-.6.2-.2.2-.4.4-.6.1-.2.1-.5 0-.7-.1-.2-.8-2-1.1-2.7-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.5-.3.4-1.2 1.2-1.2 2.9 0 1.7 1.2 3.3 1.4 3.6.2.2 2.4 3.7 5.9 5.2.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 2.1-.9 2.4-1.7.3-.8.3-1.6.2-1.7-.1-.2-.3-.3-.7-.4z"/></svg>';

  var wrap = document.createElement("div");
  wrap.className = "kc-cta";
  wrap.innerHTML =
      '<a class="kc-wa" href="https://wa.me/' + KC_PHONE + '?text=' + WA_TEXT + '" target="_blank" rel="noopener" aria-label="Écrire sur WhatsApp">' + waSvg + '</a>'
    + '<a class="kc-devis" href="contact.html">Demander un devis <span class="ar">→</span></a>';
  document.body.appendChild(wrap);
  requestAnimationFrame(function () { setTimeout(function () { wrap.classList.add("in"); }, 600); });

  /* Remonte les boutons quand le footer entre dans le viewport.
     getBoundingClientRect() est fiable sur mobile (barre URL dynamique incluse). */
  function baseBottom() {
    return Math.max(16, Math.min(28, window.innerWidth * 0.024));
  }
  var footerEl = document.querySelector("footer");
  if (footerEl) {
    function updateCtaBottom() {
      var rect = footerEl.getBoundingClientRect();
      var wh = window.innerHeight;
      if (rect.top < wh) {
        wrap.style.bottom = (wh - rect.top + baseBottom()) + "px";
      } else {
        wrap.style.bottom = "";
      }
    }
    window.addEventListener("scroll", updateCtaBottom, { passive: true });
    window.addEventListener("resize", updateCtaBottom);
    updateCtaBottom();
  }
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
