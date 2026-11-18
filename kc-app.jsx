/* ============================================================
   KEVIN CHINELLI — high-fidelity app
   ============================================================ */
const { useState, useEffect, useRef } = React;

/* ---------- TWEAK CONFIG ---------- */
const PALETTES = {
  "Noir chaud":     ["#141210", "#b9926b", "#f8f5ef"],
  "Noir profond":   ["#0f0e0d", "#9a8f7e", "#efe9df"],
  "Anthracite":     ["#16181a", "#8a97a0", "#eef0f1"],
  "Ardoise cuivre": ["#12100f", "#a9744f", "#f3ede4"],
};
const PALETTE_OPTS = Object.values(PALETTES);
const HEAD_FONTS = { Cinzel: '"Cinzel", Georgia, serif', Cormorant: '"Cormorant Garamond", Georgia, serif' };
const BODY_FONTS = { Jost: '"Jost", system-ui, sans-serif', Mulish: '"Mulish", system-ui, sans-serif' };

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": ["#141210", "#b9926b", "#f8f5ef"],
  "heading": "Cinzel",
  "body": "Jost",
  "heroVariant": "a",
  "prestaLayout": "grille",
  "aboutLayout": "split"
}/*EDITMODE-END*/;

/* ---------- CONTENT ---------- */
const PRESTATIONS = [
  { n: "01", title: "Mariages", id: "presta-mariage", href: "mariages.html",
    img: "Mariage — cérémonie / golden hour",
    text: "De la promesse échangée aux derniers pas de danse — une narration sensible et discrète de votre journée, au plus près de l'émotion, sans mise en scène inutile." },
  { n: "02", title: "Lifestyle", id: "presta-portrait", href: "portraits.html",
    img: "Portrait — lumière naturelle / extérieur",
    text: "Un portrait qui vous ressemble, en lumière naturelle ou en extérieur. Personnel, artistique ou pour votre image de marque — sincère et vivant." },
  { n: "03", title: "Studio", id: "presta-studio", href: "studio.html",
    img: "Studio — portrait éditorial",
    text: "Portraits éditoriaux et corporate. Lumière maîtrisée, direction soignée et tirages d'exception pour une présence qui marque." },
  { n: "04", title: "Maternité & Grossesse", short: "Maternité", id: "presta-maternite", href: "maternite-grossesse.html",
    img: "Maternité — studio / lumière douce",
    text: "La douceur de l'attente, saisie en studio ou en lumière naturelle. Des images intemporelles, dans l'intimité et le calme du moment." },
];

const TESTIMONIALS = [
  { quote: "Kevin a capturé notre mariage avec une justesse rare. Chaque image raconte précisément ce que nous avons ressenti ce jour-là.", who: "Camille & Thomas" },
  { quote: "Une délicatesse et un œil remarquables. Nos portraits sont devenus, sans exagération, nos biens les plus précieux.", who: "Léa & Marc" },
];

/* ---------- SMALL HELPERS ---------- */
function Slot({ id, ph, style, loading, fetchpriority }) {
  return <image-slot id={id} shape="rect" fit="cover" placeholder={ph} aria-label={ph} role="img" style={style} loading={loading} fetchpriority={fetchpriority}></image-slot>;
}
function Overline({ children, className = "" }) {
  return <div className={"overline " + className}><span className="tick"></span>{children}</div>;
}

/* ---------- NAV ---------- */
function Nav() {
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
          {PRESTATIONS.map((p) => <a key={p.id} href={p.href} onClick={() => setOpen(false)}>{p.title}</a>)}
        </div>
        <a className="mm-top" href="portfolio.html" onClick={() => setOpen(false)}>Portfolio</a>
        <a className="mm-top" href="tarifs.html" onClick={() => setOpen(false)}>Tarifs</a>
        <a className="mm-top" href="journal.html" onClick={() => setOpen(false)}>Journal</a>
        <a className="mm-top" href="apropos.html" onClick={() => setOpen(false)}>À propos</a>
        <a className="mm-top" href="#contact" onClick={() => setOpen(false)}>Contact</a>
      </div>
    </div>,
    document.body
  );
  return (
    <>
      <nav className={"nav" + (scrolled ? " scrolled" : "") + (open ? " menu-open" : "")}>
        <a href="#hero" className="wordmark"><span className="wm-main">Afterglow</span><span className="wm-by">by Kevin Chinelli</span></a>
        <div className="nav-links">
          <div className="nav-item nav-extra">
            <a href={PRESTATIONS[0].href} aria-haspopup="true">Prestations<span className="caret">▾</span></a>
            <div className="nav-drop">
              {PRESTATIONS.map((p) => <a key={p.id} href={p.href}>{p.title}</a>)}
            </div>
          </div>
          <a href="portfolio.html" className="nav-extra">Portfolio</a>
          <a href="tarifs.html" className="nav-extra">Tarifs</a>
          <a href="journal.html" className="nav-extra">Journal</a>
          <a href="apropos.html" className="nav-extra">À propos</a>
          <a href="#contact" className="nav-cta">Contact</a>
        </div>
        <button className="nav-burger" aria-label="Ouvrir le menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span></span><span></span>
        </button>
      </nav>
      {menu}
    </>
  );
}

/* ---------- HOME HERO (3 variants via tweak) ---------- */
const HOME_HERO = {
  over: "Photographe · Suisse romande",
  title: "Afterglow",
  by: "by Kevin Chinelli",
  tag: "L'émotion d'un instant, et la lumière qui s'attarde.",
};

function HeroCtas({ light }) {
  return (
    <div className="hh-ctas reveal in d3">
      <a className={"hh-btn" + (light ? " on-img" : "")} href="contact.html">Réserver une date <span className="ar">→</span></a>
      <a className="hh-link" href="portfolio.html">Voir le portfolio</a>
    </div>
  );
}

function HomeHero({ variant = "a" }) {
  const H = HOME_HERO;

  if (variant === "b") {
    return (
      <section id="hero" className="hhero vb">
        <div className="hh-text">
          <div className="overline hh-over reveal in">{H.over}</div>
          <h1 className="hh-title reveal in d1">{H.title}</h1>
          <div className="hh-by reveal in d1">{H.by}</div>
          <p className="hh-tag reveal in d2">{H.tag}</p>
          <HeroCtas />
          <div className="hh-meta reveal in d3">Mariage · Couple · Studio · Maternité</div>
        </div>
        <div className="hh-img"><Slot id="home-hero-split" ph="Image hero — portrait vertical" loading="eager" fetchpriority="high" style={{ width: "100%", height: "100%" }} /></div>
      </section>
    );
  }

  if (variant === "c") {
    return (
      <section id="hero" className="hhero vc">
        <div className="hh-inner">
          <div className="hh-kicker reveal in">{H.title} — {H.by}</div>
          <h1 className="hh-statement reveal in d1">L'émotion d'un instant,<br /><em>et la lumière qui s'attarde.</em></h1>
          <HeroCtas />
        </div>
        <div className="hh-strip reveal in d2">
          <div className="cell"><Slot id="home-hero-strip-1" ph="Sélection — 1" loading="eager" fetchpriority="high" style={{ width: "100%", height: "100%" }} /></div>
          <div className="cell"><Slot id="home-hero-strip-2" ph="Sélection — 2" style={{ width: "100%", height: "100%" }} /></div>
          <div className="cell"><Slot id="home-hero-strip-3" ph="Sélection — 3" style={{ width: "100%", height: "100%" }} /></div>
        </div>
      </section>
    );
  }

  /* variant "a" — full-bleed cinematic */
  return (
    <section id="hero" className="hhero va">
      <div className="hh-bg">
        <Slot id="home-hero-full" ph="Image hero — pleine page" loading="eager" fetchpriority="high" style={{ width: "100%", height: "100%" }} />
        <Slot id="home-hero-mobile" ph="Image hero — portrait mobile" loading="eager" fetchpriority="high" style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="scrim"></div>
      <div className="hh-inner">
        <div className="overline hh-over reveal in">{H.over}</div>
        <h1 className="hh-title reveal in d1">{H.title}</h1>
        <div className="hh-by reveal in d1">{H.by}</div>
        <p className="hh-tag reveal in d2">{H.tag}</p>
        <HeroCtas light />
        <div className="hh-meta on-img reveal in d3">Mariage · Couple · Famille · Studio · Maternité</div>
      </div>
      <div className="hh-scroll reveal in d3">
        <svg viewBox="0 0 14 52" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="7" y1="1" x2="7" y2="41"/><polyline points="1 35 7 41 13 35"/></svg>
      </div>
    </section>
  );
}

/* ---------- ABOUT + INTRO (section unique) ---------- */
const ABOUT_INTRO = "Depuis une dizaine d'années que je travaille à travers l'image, j'ai appris une chose : les moments qui comptent ne se mettent pas en scène. Mon travail, c'est d'être là — attentif, discret, à l'écoute — au moment exact où quelque chose de vrai se passe.";

function About() {
  return (
    <section id="about" className="sec s-light pad-y about-ed">
      <div className="wrap about-ed-grid">
        <div className="about-ed-text">
          <Overline className="reveal">Photographe · Suisse romande</Overline>
          <h2 className="display about-ed-hdl reveal d1">Pour les moments qui méritent de rester.</h2>
          <p className="about-ed-intro reveal d1">Des mariages aux portraits de famille, je travaille au plus près de ce qui se passe vraiment — avec discrétion, patience, et le regard de quelqu'un qui cherche l'émotion juste plutôt que la belle image convenue.</p>
          <hr className="hair about-ed-rule reveal d2" />
          <p className="about-ed-name reveal d2">Kevin Chinelli</p>
          <p className="reveal d2">{ABOUT_INTRO}</p>
          <a href="apropos.html" className="link-arrow reveal d3">En savoir plus <span className="ar">→</span></a>
        </div>
        <div className="about-ed-photo reveal d2">
          <figure className="about-ed-frame">
            <Slot id="about-photo" ph="Kevin Chinelli — photographe en Suisse romande" loading="lazy" style={{ width: "100%", height: "100%" }} />
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ---------- PRESTATIONS ---------- */
function PrestationsBandes() {
  return (
    <div>
      {PRESTATIONS.map((p, i) => (
        <div key={p.id} className={"band reveal " + (i % 2 === 1 ? "flip" : "")}>
          <div className="band-img">
            <Slot id={p.id} ph={p.img} style={{ width: "100%", height: "100%" }} />
          </div>
          <div className="band-txt">
            <div className="num">{p.n}</div>
            <h3>{p.title}</h3>
            <p>{p.text}</p>
            <a href={p.href} className="link-arrow" style={{ marginTop: "6px" }}>Découvrir <span className="ar">→</span></a>
          </div>
        </div>
      ))}
    </div>
  );
}
function PrestationsGrille() {
  return (
    <div className="wrap" style={{ paddingBottom: "clamp(90px,12vw,170px)" }}>
      <div className="svc-grid">
        {PRESTATIONS.map((p) => (
          <a key={p.id} href={p.href} className="svc-card reveal">
            <Slot id={p.id} ph={p.img} style={{ width: "100%", height: "100%" }} />
            <div className="veil"></div>
            <div className="svc-body">
              <div className="num">{p.n}</div>
              <h3>{p.title}</h3>
              <span className="link-arrow">Découvrir <span className="ar">→</span></span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
function Prestations({ layout }) {
  return (
    <section id="prestations" className="sec s-dark">
      <div className="wrap" style={{ paddingTop: "clamp(90px,12vw,150px)", paddingBottom: "clamp(50px,6vw,80px)", textAlign: "center" }}>
        <Overline className="reveal" >Prestations</Overline>
        <h2 className="display reveal d1" style={{ fontSize: "clamp(30px,4vw,56px)", marginTop: "22px" }}>
          À chaque histoire, son écriture.
        </h2>
      </div>
      {layout === "grille" ? <PrestationsGrille /> : <PrestationsBandes />}
    </section>
  );
}

/* ---------- GALLERY ---------- */
function Gallery() {
  return (
    <section id="portfolio" className="sec s-dark pad-y">
      <div className="wrap">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "clamp(34px,4vw,60px)", flexWrap: "wrap", gap: "20px" }}>
          <div>
            <Overline className="reveal">Travaux choisis</Overline>
            <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,48px)", marginTop: "18px" }}>Une sélection.</h2>
          </div>
          <a href="portfolio.html" className="link-arrow reveal d1">Voir le portfolio <span className="ar">→</span></a>
        </div>
        <div className="gal-mosaic reveal d1" data-lb-group="portfolio">
          <div className="gm-cell gm-p3"><Slot id="home-p3" ph="Mariage — portrait des mariés" style={{ width: "100%", height: "100%" }} /></div>
          <div className="gm-cell gm-m5"><Slot id="home-m5" ph="Mariage — instant d'émotion" style={{ width: "100%", height: "100%" }} /></div>
          <div className="gm-cell gm-m6"><Slot id="home-m6" ph="Mariage — moment clé" style={{ width: "100%", height: "100%" }} /></div>
          <div className="gm-cell gm-g5"><Slot id="home-g5" ph="Maternité — douceur de l'attente" style={{ width: "100%", height: "100%" }} /></div>
          <div className="gm-cell gm-p5"><Slot id="home-p5" ph="Portrait — lumière naturelle" style={{ width: "100%", height: "100%" }} /></div>
          <div className="gm-cell gm-m8"><Slot id="home-m8" ph="Mariage — scène large" style={{ width: "100%", height: "100%" }} /></div>
        </div>
      </div>
    </section>
  );
}

/* ---------- PROCESSUS ---------- */
const PROCESS = [
  { n: "01", title: "On se parle", text: "Un échange sans engagement pour comprendre votre projet, vos envies, et trouver ensemble la date idéale." },
  { n: "02", title: "La séance", text: "Je vous guide avec discrétion. Pas de poses figées — juste la lumière, le moment, ce qui se passe naturellement." },
  { n: "03", title: "La sélection", text: "Je prends le temps de sélectionner et retoucher chaque image avec soin. Votre galerie est prête sous trois semaines." },
  { n: "04", title: "La livraison", text: "Vos photos en haute résolution, dans une galerie privée en ligne. Des souvenirs pour toujours." },
];
function Process() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <Overline className="reveal">Comment ça se passe</Overline>
        <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,48px)", marginTop: "18px", marginBottom: "clamp(50px,7vw,90px)" }}>
          De la prise de contact<br />à vos souvenirs.
        </h2>
        <div className="process-grid">
          {PROCESS.map((s, i) => (
            <div key={s.n} className={"process-step reveal d" + (i + 1)}>
              <div className="process-num">{s.n}</div>
              <h3 className="process-title">{s.title}</h3>
              <p className="process-text">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- TESTIMONIALS (désactivé — réactiver quand disponibles) ---------- */
function Testimonials() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <Overline className="reveal" >Témoignages</Overline>
        <div className="tst-2" style={{ marginTop: "clamp(40px,5vw,70px)" }}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className={"tst reveal d" + (i + 1)}>
              <blockquote>« {t.quote} »</blockquote>
              <div className="who"><span className="dash"></span>{t.who}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- CONTACT ---------- */
function Contact() {
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const data = {
      nom: f.nom.value.trim(),
      email: f.email.value.trim(),
      type: f.type.value,
      message: f.message.value.trim(),
    };
    const errs = {};
    if (!data.nom) errs.nom = "Indiquez votre nom.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) errs.email = "Adresse email invalide.";
    if (!data.message) errs.message = "Écrivez quelques mots sur votre projet.";
    setErr(errs);
    if (Object.keys(errs).length) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch("contact.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j && j.ok) {
        setSent(true);
      } else if (res.status === 429) {
        setSendError("Trop d'envois en peu de temps. Patientez quelques minutes, puis réessayez.");
      } else {
        setSendError("Une erreur est survenue à l'envoi. Réessayez, ou écrivez-moi directement à contact@afterglowbykevin.ch.");
      }
    } catch (e) {
      setSendError("Connexion impossible. Vérifiez votre réseau, ou écrivez-moi à contact@afterglowbykevin.ch.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="contact" className="sec s-darker contact">
      <div className="wrap pad-y">
        <div className="grid" style={{ textAlign: "center" }}>
          <div>
            <Overline className="reveal" >Parlons de votre projet</Overline>
            <h2 className="display reveal d1" style={{ fontSize: "clamp(34px,5.4vw,70px)", marginTop: "22px" }}>Réservez votre date.</h2>
          </div>
          {sent ? (
            <div className="form-sent reveal d2">
              <div className="fs-mark">✓</div>
              <h3>Merci, votre demande est bien partie.</h3>
              <p>Je l'ai bien reçue et je vous réponds personnellement sous 48&nbsp;h ouvrées. À très vite&nbsp;!</p>
              <a href="mailto:contact@afterglowbykevin.ch" className="link-arrow">contact@afterglowbykevin.ch <span className="ar">→</span></a>
            </div>
          ) : (
            <form className="form reveal d2" noValidate onSubmit={onSubmit}>
              <div className="field-row">
                <div className={"field" + (err.nom ? " error" : "")}>
                  <label>Nom</label>
                  <input className="control" name="nom" type="text" placeholder="Votre nom" />
                  {err.nom && <span className="field-err">{err.nom}</span>}
                </div>
                <div className={"field" + (err.email ? " error" : "")}>
                  <label>Email</label>
                  <input className="control" name="email" type="email" placeholder="vous@email.com" />
                  {err.email && <span className="field-err">{err.email}</span>}
                </div>
              </div>
              <div className="field">
                <label>Type de shooting</label>
                <select className="control" name="type" defaultValue="">
                  <option value="" disabled>Sélectionner</option>
                  {PRESTATIONS.map((p) => <option key={p.id} value={p.title}>{p.title}</option>)}
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div className={"field" + (err.message ? " error" : "")}>
                <label>Message</label>
                <textarea className="control" name="message" rows="4" placeholder="Parlez-moi de votre projet, de la date envisagée…"></textarea>
                {err.message && <span className="field-err">{err.message}</span>}
              </div>
              {sendError && <span className="field-err" style={{ display: "block", marginBottom: "12px" }}>{sendError}</span>}
              <button className="btn-submit" type="submit" disabled={sending}>{sending ? "Envoi…" : "Envoyer"} <span className="ar">→</span></button>
            </form>
          )}
          <div className="contact-direct reveal d3">
            <a href="mailto:contact@afterglowbykevin.ch">contact@afterglowbykevin.ch</a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- FOOTER ---------- */
function Footer() {
  return (
    <footer className="s-dark" style={{ borderTop: "1px solid var(--line-d)" }}>
      <div className="footer">
        <div className="wordmark"><span className="wm-main">Afterglow</span><span className="wm-by">by Kevin Chinelli</span></div>
        <div className="copy">© 2026 — Tous droits réservés · Site créé par <a href="https://snapshotmedia.ch" target="_blank" rel="noopener">Snapshot Media</a></div>
        <div className="social"><a href="apropos.html">À propos</a><a href="confidentialite.html">Confidentialité</a><a href="https://www.instagram.com/afterglowbykevin/" target="_blank" rel="noopener">Instagram</a><a href="tel:+41798507603">+41 79 850 76 03</a><a href="mailto:contact@afterglowbykevin.ch">contact@afterglowbykevin.ch</a></div>
      </div>
    </footer>
  );
}

/* ---------- APP ---------- */
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // apply palette + fonts to CSS vars
  useEffect(() => {
    const r = document.documentElement.style;
    if (Array.isArray(t.palette)) {
      r.setProperty("--bg", t.palette[0]);
      r.setProperty("--accent", t.palette[1]);
      r.setProperty("--cream", t.palette[2]);
    }
    r.setProperty("--font-display", HEAD_FONTS[t.heading] || HEAD_FONTS.Cinzel);
    r.setProperty("--font-body", BODY_FONTS[t.body] || BODY_FONTS.Jost);
  }, [t.palette, t.heading, t.body]);

  // smooth scroll — easing cubique sur les liens d'ancre (#section)
  useEffect(() => {
    function ease(t) { return t < .5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1; }
    function smoothTo(target, dur) {
      const start = window.scrollY, dist = target - start;
      let t0 = null;
      document.documentElement.style.scrollBehavior = "auto";
      function step(now) {
        if (!t0) t0 = now;
        const p = Math.min((now - t0) / dur, 1);
        window.scrollTo(0, start + dist * ease(p));
        if (p < 1) requestAnimationFrame(step);
        else document.documentElement.style.scrollBehavior = "";
      }
      requestAnimationFrame(step);
    }
    function onClick(e) {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href").slice(1);
      const el = id ? document.getElementById(id) : null;
      if (id && !el) return;
      e.preventDefault();
      window._stopInertia && window._stopInertia();
      const y = el ? el.getBoundingClientRect().top + window.scrollY : 0;
      smoothTo(y, 900);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // scroll reveals (rect-based — robust across environments)
  useEffect(() => {
    const reveal = () => {
      const vh = window.innerHeight;
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.88 && r.bottom > 0) el.classList.add("in");
      });
    };
    reveal();
    window.addEventListener("scroll", reveal, { passive: true });
    window.addEventListener("resize", reveal);
    const id = setTimeout(reveal, 200);
    return () => {
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("resize", reveal);
      clearTimeout(id);
    };
  }, [t.prestaLayout, t.aboutLayout, t.heroVariant]);

  return (
    <>
      <div className="grain"></div>
      <Nav />
      <main>
        <HomeHero variant={t.heroVariant} />
        <About />
        <Prestations layout={t.prestaLayout} />
        <Gallery />
        <Process />
        {/* <Testimonials /> — réactiver quand les premiers avis sont disponibles */}
        <Contact />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
