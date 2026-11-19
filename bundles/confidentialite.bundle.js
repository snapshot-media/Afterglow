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
(()=>{const{useState,useEffect,useRef}=React;(function(){try{var p=document.createElement("div");p.style.cssText="position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;transition:opacity .05s linear;pointer-events:none",document.documentElement.appendChild(p),requestAnimationFrame(function(){p.style.opacity="1"}),setTimeout(function(){var op=parseFloat(getComputedStyle(p).opacity);op>.9||document.documentElement.classList.add("no-anim"),p.remove()},220)}catch{}})();const KC={PALETTES:{"Noir chaud":["#141210","#b9926b","#f8f5ef"],"Noir profond":["#0f0e0d","#9a8f7e","#efe9df"],Anthracite:["#16181a","#8a97a0","#eef0f1"],"Ardoise cuivre":["#12100f","#a9744f","#f3ede4"]},HEAD_FONTS:{Cinzel:'"Cinzel", Georgia, serif',Cormorant:'"Cormorant Garamond", Georgia, serif'},BODY_FONTS:{Jost:'"Jost", system-ui, sans-serif',Mulish:'"Mulish", system-ui, sans-serif'},HOME:"/",WHATSAPP:"https://wa.me/41798507603?text="+encodeURIComponent("Bonjour Kevin, je vous \xE9cris depuis le site Afterglow au sujet d'une s\xE9ance photo : "),PRO_URL:"https://snapshotmedia.ch/services/photographie/portraits-professionnels/"},PALETTE_OPTS=Object.values(KC.PALETTES),PRESTA_NAV=[{slug:"mariage",title:"Mariages",short:"Mariages",href:"mariages.html"},{slug:"portrait",title:"Lifestyle",short:"Lifestyle",href:"portraits.html",children:[{slug:"solo",title:"Solo",href:"solo.html"},{slug:"couple",title:"Couple",href:"couple.html"},{slug:"famille",title:"Famille",href:"famille.html"}]},{slug:"studio",title:"Studio",short:"Studio",href:"studio.html"},{slug:"maternite",title:"Maternit\xE9 & Grossesse",short:"Maternit\xE9",href:"maternite-grossesse.html"}],PRESTA_PARENT={};PRESTA_NAV.forEach(p=>(p.children||[]).forEach(c=>{PRESTA_PARENT[c.slug]=p.slug}));function Slot({id,ph,alt,style,className,loading,fetchpriority}){return React.createElement("image-slot",{id,shape:"rect",fit:"cover",placeholder:ph,alt:alt||ph,"aria-label":alt||ph,role:"img",style,class:className,loading,fetchpriority})}function Overline({children,className=""}){return React.createElement("div",{className:"overline "+className},React.createElement("span",{className:"tick"}),children)}function Nav({active=""}){const[scrolled,setScrolled]=useState(!1),[open,setOpen]=useState(!1);useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>40);return onScroll(),window.addEventListener("scroll",onScroll,{passive:!0}),()=>window.removeEventListener("scroll",onScroll)},[]),useEffect(()=>(document.body.style.overflow=open?"hidden":"",()=>{document.body.style.overflow=""}),[open]);const menu=ReactDOM.createPortal(React.createElement("div",{className:"mobile-menu"+(open?" is-open":""),onClick:()=>setOpen(!1)},React.createElement("div",{className:"mm-inner",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"mm-group"},React.createElement("span",{className:"mm-label"},"Prestations"),PRESTA_NAV.map(p=>[React.createElement("a",{key:p.slug,href:p.href,onClick:()=>setOpen(!1)},p.title),...(p.children||[]).map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"mm-sub",onClick:()=>setOpen(!1)},c.title))]),React.createElement("a",{href:"bon-cadeau.html",onClick:()=>setOpen(!1)},"Bon cadeau")),React.createElement("a",{className:"mm-top",href:"portfolio.html",onClick:()=>setOpen(!1)},"Portfolio"),React.createElement("a",{className:"mm-top",href:"tarifs.html",onClick:()=>setOpen(!1)},"Tarifs"),React.createElement("a",{className:"mm-top",href:"journal.html",onClick:()=>setOpen(!1)},"Journal"),React.createElement("a",{className:"mm-top",href:"apropos.html",onClick:()=>setOpen(!1)},"\xC0 propos"),React.createElement("a",{className:"mm-top",href:"contact.html",onClick:()=>setOpen(!1)},"Contact"))),document.body);return React.createElement(React.Fragment,null,React.createElement("nav",{className:"nav"+(scrolled?" scrolled":"")+(open?" menu-open":"")},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"nav-links"},React.createElement("div",{className:"nav-item nav-extra"+(active==="cadeau"||PRESTA_NAV.some(p=>p.slug===active||p.slug===PRESTA_PARENT[active])?" is-active":"")},React.createElement("a",{href:PRESTA_NAV[0].href,"aria-haspopup":"true"},"Prestations",React.createElement("span",{className:"caret"},"\u25BE")),React.createElement("div",{className:"nav-drop"},PRESTA_NAV.map(p=>[React.createElement("a",{key:p.slug,href:p.href,className:active===p.slug?"is-active":""},p.title),...(p.children||[]).map(c=>React.createElement("a",{key:c.slug,href:c.href,className:"nd-sub"+(active===c.slug?" is-active":"")},c.title))]),React.createElement("a",{href:"bon-cadeau.html",className:"nd-gift"+(active==="cadeau"?" is-active":"")},"Bon cadeau"))),React.createElement("a",{href:"portfolio.html",className:"nav-extra"+(active==="portfolio"?" is-active":"")},"Portfolio"),React.createElement("a",{href:"tarifs.html",className:"nav-extra"+(active==="tarifs"?" is-active":"")},"Tarifs"),React.createElement("a",{href:"journal.html",className:"nav-extra"+(active==="journal"?" is-active":"")},"Journal"),React.createElement("a",{href:"apropos.html",className:"nav-extra"+(active==="apropos"?" is-active":"")},"\xC0 propos"),React.createElement("a",{href:"contact.html",className:"nav-cta"+(active==="contact"?" is-active":"")},"Contact")),React.createElement("button",{className:"nav-burger","aria-label":"Ouvrir le menu","aria-expanded":open,onClick:()=>setOpen(o=>!o)},React.createElement("span",null),React.createElement("span",null))),menu)}function Footer(){return React.createElement("footer",{className:"s-dark",style:{borderTop:"1px solid var(--line-d)"}},React.createElement("div",{className:"footer"},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"copy"},"\xA9 2026 \u2014 Tous droits r\xE9serv\xE9s \xB7 Site cr\xE9\xE9 par ",React.createElement("a",{href:"https://snapshotmedia.ch",target:"_blank",rel:"noopener"},"Snapshot Media")),React.createElement(FooterLinks,null)))}function FooterLinks(){return React.createElement("div",{className:"social"},React.createElement("a",{href:"apropos.html"},"\xC0 propos"),React.createElement("a",{href:"bon-cadeau.html"},"Bon cadeau"),React.createElement("a",{href:"confidentialite.html"},"Confidentialit\xE9"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener","data-umami-event":"instagram"},"Instagram"),React.createElement("a",{href:"https://g.page/r/Ccd14Q8WzKZuEBM",target:"_blank",rel:"noopener","data-umami-event":"fiche-google"},"Google"),React.createElement("a",{href:KC.WHATSAPP,target:"_blank",rel:"noopener","data-umami-event":"whatsapp"},"WhatsApp"),React.createElement("a",{href:"tel:+41798507603","data-umami-event":"telephone"},"+41 79 850 76 03"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch","data-umami-event":"email"},"contact@afterglowbykevin.ch"))}function RelatedPresta({current}){const parentSlug=PRESTA_PARENT[current],parent=PRESTA_NAV.find(p=>p.slug===parentSlug),items=parent?[parent,...parent.children.filter(c=>c.slug!==current)].slice(0,3):PRESTA_NAV.filter(p=>p.slug!==current).slice(0,3);return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(32px,4vw,52px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"\xC0 d\xE9couvrir aussi"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"}},parent?"Les autres s\xE9ances lifestyle.":"Autres prestations.")),React.createElement("div",{className:"related-grid"},items.map((p,i)=>React.createElement("a",{key:p.slug,href:p.href,className:"related-card reveal d"+(i+1)},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"presta-"+p.slug,ph:p.title,alt:"Photographe "+p.title.toLowerCase()+" en Suisse romande \u2014 Kevin Chinelli",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,p.title),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192")))))))}function CtaContact({overline="Parlons de votre projet",title="R\xE9servez votre date.",href="contact.html",label="Me contacter"}){return React.createElement("section",{className:"sec s-darker cta-band"},React.createElement("div",{className:"wrap pad-y",style:{textAlign:"center"}},React.createElement(Overline,{className:"reveal"},overline),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(34px,5.4vw,72px)",margin:"22px 0 38px"}},title),React.createElement("a",{href,className:"link-arrow reveal d2",style:{fontSize:"14px"}},label," ",React.createElement("span",{className:"ar"},"\u2192"))))}function useReveal(deps=[]){useEffect(()=>{const reveal=()=>{const vh=window.innerHeight;document.querySelectorAll(".reveal:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();r.top<vh*.9&&r.bottom>0&&el.classList.add("in")})};reveal(),window.addEventListener("scroll",reveal,{passive:!0}),window.addEventListener("resize",reveal);const id=setTimeout(reveal,220);return()=>{window.removeEventListener("scroll",reveal),window.removeEventListener("resize",reveal),clearTimeout(id)}},deps)}function useApplyTweaks(t){useEffect(()=>{const r=document.documentElement.style;Array.isArray(t.palette)&&(r.setProperty("--bg",t.palette[0]),r.setProperty("--accent",t.palette[1]),r.setProperty("--cream",t.palette[2])),r.setProperty("--font-display",KC.HEAD_FONTS[t.heading]||KC.HEAD_FONTS.Cinzel),r.setProperty("--font-body",KC.BODY_FONTS[t.body]||KC.BODY_FONTS.Jost)},[t.palette,t.heading,t.body])}Object.assign(window,{KC,PALETTE_OPTS,PRESTA_NAV,PRESTA_PARENT,Slot,Overline,Nav,Footer,FooterLinks,CtaContact,RelatedPresta,useReveal,useApplyTweaks});})();

;
(()=>{const LEGAL_UPDATED="novembre 2026",LEGAL_SECTIONS=[{t:"1. Responsable du traitement",p:["Le pr\xE9sent site afterglowbykevin.ch (\xAB Afterglow by Kevin \xBB) est \xE9dit\xE9 et exploit\xE9 par Kevin Chinelli, photographe ind\xE9pendant.","Adresse : Ch. de l'Ancien-Tram 18, 1083 M\xE9zi\xE8res (Vaud), Suisse.","Contact : contact@afterglowbykevin.ch \xB7 +41 79 850 76 03."]},{t:"2. Donn\xE9es collect\xE9es",p:["Le site ne collecte des donn\xE9es personnelles que lorsque vous les transmettez volontairement via le formulaire de contact : nom, adresse e-mail, num\xE9ro de t\xE9l\xE9phone (facultatif), type de prestation souhait\xE9e et contenu de votre message.","Aucune cr\xE9ation de compte n'est requise. Le site n'utilise ni cookies, ni publicit\xE9, ni pixels de suivi ou de reciblage.","Une mesure d'audience anonyme (Umami, h\xE9berg\xE9 sur le m\xEAme serveur que le site) compte les pages vues, les clics sur les moyens de contact et les demandes envoy\xE9es. Elle n'utilise aucun cookie, ne conserve pas votre adresse IP et ne vous suit pas d'un site \xE0 l'autre.","Si vous m'\xE9crivez sur WhatsApp, votre message est achemin\xE9 par WhatsApp (Meta) selon ses propres conditions ; je le conserve dans mon outil de suivi des demandes le temps de traiter votre demande."]},{t:"3. Finalit\xE9s et base l\xE9gale",p:["Vos donn\xE9es sont utilis\xE9es uniquement pour r\xE9pondre \xE0 votre demande, \xE9tablir un devis et assurer le suivi de notre \xE9ventuelle collaboration.","La base l\xE9gale est votre consentement et l'ex\xE9cution de mesures pr\xE9contractuelles prises \xE0 votre demande (art. 6 nLPD)."]},{t:"4. Dur\xE9e de conservation",p:["Les demandes re\xE7ues via le formulaire sont conserv\xE9es le temps n\xE9cessaire au traitement de votre requ\xEAte, puis archiv\xE9es au maximum 24 mois, sauf relation contractuelle en cours ou obligation l\xE9gale (par ex. comptable) imposant une dur\xE9e plus longue."]},{t:"5. Destinataires et sous-traitants",p:["Vos donn\xE9es ne sont ni vendues, ni lou\xE9es, ni transmises \xE0 des tiers \xE0 des fins commerciales.","Elles transitent uniquement par les prestataires techniques n\xE9cessaires au fonctionnement du site : l'h\xE9bergeur du serveur et le service de messagerie Infomaniak (Suisse) qui achemine les e-mails du formulaire. Les polices d'\xE9criture sont h\xE9berg\xE9es sur le site lui-m\xEAme : l'affichage des pages ne transmet aucune donn\xE9e \xE0 Google. Si vous choisissez WhatsApp, vos messages transitent par Meta."]},{t:"6. Vos droits",p:["Conform\xE9ment \xE0 la nLPD, vous disposez d'un droit d'acc\xE8s, de rectification, de suppression et d'opposition concernant vos donn\xE9es personnelles.","Pour exercer ces droits, \xE9crivez \xE0 contact@afterglowbykevin.ch. Une r\xE9ponse vous sera apport\xE9e dans les meilleurs d\xE9lais."]},{t:"7. S\xE9curit\xE9",p:["Le site est servi exclusivement en HTTPS (connexion chiffr\xE9e). Les demandes envoy\xE9es via le formulaire sont stock\xE9es hors de la racine web et l'acc\xE8s au serveur est restreint. Malgr\xE9 le soin apport\xE9, aucune transmission sur Internet ne peut \xEAtre garantie comme totalement s\xFBre."]},{t:"8. Modifications",p:["Cette politique peut \xEAtre mise \xE0 jour \xE0 tout moment pour refl\xE9ter l'\xE9volution du site ou de la l\xE9gislation. La date de derni\xE8re mise \xE0 jour figure ci-dessous."]}];function LegalApp(){const[t,setTweak]=useTweaks({palette:KC.PALETTES["Noir chaud"],heading:"Cinzel",body:"Jost"});return useApplyTweaks(t),useReveal([]),React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,{active:""}),React.createElement("main",null,React.createElement("section",{className:"sec s-dark legal-head"},React.createElement("div",{className:"wrap-narrow"},React.createElement(Overline,{className:"reveal"},"Informations l\xE9gales"),React.createElement("h1",{className:"display reveal d1",style:{fontSize:"clamp(32px,4.2vw,58px)",marginTop:"18px"}},"Politique de confidentialit\xE9"),React.createElement("p",{className:"reveal d1",style:{color:"var(--muted)",maxWidth:"60ch",marginTop:"18px",lineHeight:1.7}},"Votre vie priv\xE9e compte. Voici, en toute transparence, quelles donn\xE9es sont collect\xE9es sur ce site et comment elles sont trait\xE9es."))),React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap-narrow legal-body"},LEGAL_SECTIONS.map((s,i)=>React.createElement("div",{key:i,className:"legal-block reveal"},React.createElement("h2",null,s.t),s.p.map((para,j)=>React.createElement("p",{key:j},para)))),React.createElement("p",{className:"legal-updated reveal"},"Derni\xE8re mise \xE0 jour : ",LEGAL_UPDATED))),React.createElement(CtaContact,{overline:"Une question ?",title:"Parlons de votre projet."})),React.createElement(Footer,null))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(LegalApp,null));})();

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
