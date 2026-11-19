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
