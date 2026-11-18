/* ============================================================
   KEVIN CHINELLI — shared chrome & helpers (all sub-pages)
   Loaded after React + tweaks-panel.jsx, before each page app.
   ============================================================ */
const { useState, useEffect, useRef } = React;

/* frozen-timeline fallback (offscreen/throttled previews) */
(function () {
  try {
    var p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;transition:opacity .05s linear;pointer-events:none';
    document.documentElement.appendChild(p);
    requestAnimationFrame(function () { p.style.opacity = '1'; });
    setTimeout(function () {
      var op = parseFloat(getComputedStyle(p).opacity);
      if (!(op > 0.9)) document.documentElement.classList.add('no-anim');
      p.remove();
    }, 220);
  } catch (e) {}
})();

const KC = {
  PALETTES: {
    "Noir chaud":     ["#141210", "#b9926b", "#f8f5ef"],
    "Noir profond":   ["#0f0e0d", "#9a8f7e", "#efe9df"],
    "Anthracite":     ["#16181a", "#8a97a0", "#eef0f1"],
    "Ardoise cuivre": ["#12100f", "#a9744f", "#f3ede4"],
  },
  HEAD_FONTS: { Cinzel: '"Cinzel", Georgia, serif', Cormorant: '"Cormorant Garamond", Georgia, serif' },
  BODY_FONTS: { Jost: '"Jost", system-ui, sans-serif', Mulish: '"Mulish", system-ui, sans-serif' },
  HOME: "index.html",
};
const PALETTE_OPTS = Object.values(KC.PALETTES);

const PRESTA_NAV = [
  { slug: "mariage",   title: "Mariages",              short: "Mariages",  href: "mariages.html" },
  { slug: "portrait",  title: "Lifestyle",             short: "Lifestyle", href: "portraits.html" },
  { slug: "studio",    title: "Studio",                short: "Studio",    href: "studio.html" },
  { slug: "maternite", title: "Maternité & Grossesse", short: "Maternité", href: "maternite-grossesse.html" },
];

/* ---------- atoms ---------- */
function Slot({ id, ph, alt, style, className, loading, fetchpriority }) {
  return <image-slot id={id} shape="rect" fit="cover" placeholder={ph} alt={alt || ph} aria-label={alt || ph} role="img" style={style} class={className} loading={loading} fetchpriority={fetchpriority}></image-slot>;
}
function Overline({ children, className = "" }) {
  return <div className={"overline " + className}><span className="tick"></span>{children}</div>;
}

/* ---------- nav ---------- */
function Nav({ active = "" }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const menu = ReactDOM.createPortal(
    <div className={"mobile-menu" + (open ? " is-open" : "")} onClick={() => setOpen(false)}>
      <div className="mm-inner" onClick={(e) => e.stopPropagation()}>
        <div className="mm-group">
          <span className="mm-label">Prestations</span>
          {PRESTA_NAV.map((p) => <a key={p.slug} href={p.href} onClick={() => setOpen(false)}>{p.title}</a>)}
        </div>
        <a className="mm-top" href="portfolio.html" onClick={() => setOpen(false)}>Portfolio</a>
        <a className="mm-top" href="tarifs.html" onClick={() => setOpen(false)}>Tarifs</a>
        <a className="mm-top" href="journal.html" onClick={() => setOpen(false)}>Journal</a>
        <a className="mm-top" href="apropos.html" onClick={() => setOpen(false)}>À propos</a>
        <a className="mm-top" href="contact.html" onClick={() => setOpen(false)}>Contact</a>
      </div>
    </div>,
    document.body
  );
  return (
    <>
      <nav className={"nav" + (scrolled ? " scrolled" : "") + (open ? " menu-open" : "")}>
        <a href={KC.HOME} className="wordmark"><span className="wm-main">Afterglow</span><span className="wm-by">by Kevin Chinelli</span></a>
        <div className="nav-links">
          <div className={"nav-item nav-extra" + (PRESTA_NAV.some((p) => p.slug === active) ? " is-active" : "")}>
            <a href={PRESTA_NAV[0].href} aria-haspopup="true">Prestations<span className="caret">▾</span></a>
            <div className="nav-drop">
              {PRESTA_NAV.map((p) => <a key={p.slug} href={p.href} className={active === p.slug ? "is-active" : ""}>{p.title}</a>)}
            </div>
          </div>
          <a href="portfolio.html" className={"nav-extra" + (active === "portfolio" ? " is-active" : "")}>Portfolio</a>
          <a href="tarifs.html" className={"nav-extra" + (active === "tarifs" ? " is-active" : "")}>Tarifs</a>
          <a href="journal.html" className={"nav-extra" + (active === "journal" ? " is-active" : "")}>Journal</a>
          <a href="apropos.html" className={"nav-extra" + (active === "apropos" ? " is-active" : "")}>À propos</a>
          <a href="contact.html" className={"nav-cta" + (active === "contact" ? " is-active" : "")}>Contact</a>
        </div>
        <button className="nav-burger" aria-label="Ouvrir le menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span></span><span></span>
        </button>
      </nav>
      {menu}
    </>
  );
}

/* ---------- footer ---------- */
function Footer() {
  return (
    <footer className="s-dark" style={{ borderTop: "1px solid var(--line-d)" }}>
      <div className="footer">
        <a href={KC.HOME} className="wordmark"><span className="wm-main">Afterglow</span><span className="wm-by">by Kevin Chinelli</span></a>
        <div className="copy">© 2026 — Tous droits réservés · Site créé par <a href="https://snapshotmedia.ch" target="_blank" rel="noopener">Snapshot Media</a></div>
        <div className="social"><a href="apropos.html">À propos</a><a href="confidentialite.html">Confidentialité</a><a href="https://www.instagram.com/afterglowbykevin/" target="_blank" rel="noopener">Instagram</a><a href="https://g.page/r/Ccd14Q8WzKZuEBM" target="_blank" rel="noopener">Google</a><a href="tel:+41798507603">+41 79 850 76 03</a><a href="mailto:contact@afterglowbykevin.ch">contact@afterglowbykevin.ch</a></div>
      </div>
    </footer>
  );
}

/* ---------- related prestations (internal linking) ---------- */
function RelatedPresta({ current }) {
  const items = PRESTA_NAV.filter((p) => p.slug !== current).slice(0, 3);
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <div style={{ textAlign: "center", marginBottom: "clamp(32px,4vw,52px)" }}>
          <Overline className="reveal" style={{ justifyContent: "center" }}>À découvrir aussi</Overline>
          <h2 className="display reveal d1" style={{ fontSize: "clamp(26px,3.2vw,44px)", marginTop: "18px" }}>Autres prestations.</h2>
        </div>
        <div className="related-grid">
          {items.map((p, i) => (
            <a key={p.slug} href={p.href} className={"related-card reveal d" + (i + 1)}>
              <div className="rc-img"><Slot id={"presta-" + p.slug} ph={p.title} alt={"Photographe " + p.title.toLowerCase() + " en Suisse romande — Kevin Chinelli"} style={{ width: "100%", height: "100%" }} /></div>
              <div className="rc-meta"><h3>{p.title}</h3><span className="ar">Découvrir →</span></div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- CTA band ---------- */
function CtaContact({ overline = "Parlons de votre projet", title = "Réservez votre date." }) {
  return (
    <section className="sec s-darker cta-band">
      <div className="wrap pad-y" style={{ textAlign: "center" }}>
        <Overline className="reveal">{overline}</Overline>
        <h2 className="display reveal d1" style={{ fontSize: "clamp(34px,5.4vw,72px)", margin: "22px 0 38px" }}>{title}</h2>
        <a href="contact.html" className="link-arrow reveal d2" style={{ fontSize: "14px" }}>Me contacter <span className="ar">→</span></a>
      </div>
    </section>
  );
}

/* ---------- hooks ---------- */
function useReveal(deps = []) {
  useEffect(() => {
    const reveal = () => {
      const vh = window.innerHeight;
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.9 && r.bottom > 0) el.classList.add("in");
      });
    };
    reveal();
    window.addEventListener("scroll", reveal, { passive: true });
    window.addEventListener("resize", reveal);
    const id = setTimeout(reveal, 220);
    return () => {
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("resize", reveal);
      clearTimeout(id);
    };
  }, deps);
}
function useApplyTweaks(t) {
  useEffect(() => {
    const r = document.documentElement.style;
    if (Array.isArray(t.palette)) {
      r.setProperty("--bg", t.palette[0]);
      r.setProperty("--accent", t.palette[1]);
      r.setProperty("--cream", t.palette[2]);
    }
    r.setProperty("--font-display", KC.HEAD_FONTS[t.heading] || KC.HEAD_FONTS.Cinzel);
    r.setProperty("--font-body", KC.BODY_FONTS[t.body] || KC.BODY_FONTS.Jost);
  }, [t.palette, t.heading, t.body]);
}

Object.assign(window, {
  KC, PALETTE_OPTS, PRESTA_NAV,
  Slot, Overline, Nav, Footer, CtaContact, RelatedPresta,
  useReveal, useApplyTweaks,
});
