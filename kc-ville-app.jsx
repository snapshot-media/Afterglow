/* ============================================================
   KEVIN CHINELLI — Landing page locale (prestation × ville)
   Reads window.KC_VILLE_SLUG → window.KC_VILLE[slug].
   Generic over prestation: each entry carries a `presta` descriptor.
   Loaded after kc-shared.jsx + kc-ville-data.js.
   ============================================================ */
const V = window.KC_VILLE[window.KC_VILLE_SLUG];
const VP = V.presta || { slug: "mariage", href: "mariages.html", label: "mariage", crumb: "Mariages", card: "La prestation mariage" };
const VLOCAL = VP.label.charAt(0).toUpperCase() + VP.label.slice(1) + " à " + V.ville;

function VilleReassure() {
  const points = ["Déplacement inclus à " + V.ville, "Réponse sous 48 h"];
  if (VP.slug === "mariage") points.push("1 seul mariage par jour");
  points.push("Tarifs transparents");
  return (
    <section className="reassure s-dark" aria-label="Engagements">
      <div className="wrap reassure-row">
        {points.map((p, i) => <div key={i} className="reassure-item"><span className="rdot"></span>{p}</div>)}
      </div>
    </section>
  );
}

/* Les autres villes de la même prestation (maillage interne) : mêmes pastilles que la bande « Par région »
   des pages prestation. */
function VillesSoeurs() {
  const others = Object.values(window.KC_VILLE).filter((o) => o.slug !== V.slug && (o.presta || { slug: "mariage" }).slug === VP.slug);
  if (others.length === 0) return null;
  const Cap = VP.label.charAt(0).toUpperCase() + VP.label.slice(1);
  return (
    <section className="sec s-light pad-y">
      <div className="wrap" style={{ textAlign: "center" }}>
        <Overline className="reveal" style={{ justifyContent: "center" }}>Par région</Overline>
        <h2 className="display reveal d1" style={{ fontSize: "clamp(26px,3.2vw,44px)", margin: "18px 0 clamp(28px,3.5vw,44px)" }}>Je me déplace aussi ailleurs.</h2>
        <div className="villes-row reveal d1">
          {others.map((o) => (
            <a key={o.slug} href={"photographe-" + (o.presta ? o.slug : "mariage-" + o.slug) + ".html"} className="ville-chip">{Cap} à {o.ville} <span className="ar">→</span></a>
          ))}
          <a href={VP.href} className="ville-chip">Partout en Suisse romande <span className="ar">→</span></a>
        </div>
      </div>
    </section>
  );
}

function VilleApp() {
  const [t, setTweak] = useTweaks({ palette: KC.PALETTES["Noir chaud"], heading: "Cinzel", body: "Jost" });
  useApplyTweaks(t);
  useReveal([]);

  return (
    <>
      <div className="grain"></div>
      <Nav active={VP.slug} />
      <main>
        {/* HERO */}
        <section className="phero bas">
          <div className="bg"><Slot id={"ville-hero-" + V.slug} ph={V.heroImg} alt={V.h1 + " — Kevin Chinelli, photographe en Suisse romande"} loading="eager" fetchpriority="high" style={{ width: "100%", height: "100%" }} /></div>
          <div className="scrim"></div>
          <div className="phero-content">
            <div className="crumb reveal in"><a href={KC.HOME}>Accueil</a><span>/</span><a href={VP.href}>{VP.crumb}</a><span>/</span><span>{V.ville}</span></div>
            <h1 className="reveal in d1">{V.h1}</h1>
            <p className="hint reveal in d2">{V.heroHint}</p>
          </div>
        </section>

        <VilleReassure />

        {/* INTRO */}
        <section className="sec s-light pad-y">
          <div className="wrap">
            <Overline className="reveal">{VLOCAL}</Overline>
            <div className="intro-grid" style={{ marginTop: "clamp(34px,4vw,58px)" }}>
              <p className="lead reveal d1">{V.intro.lead}</p>
              <div className="body reveal d2">
                {V.intro.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                <div className="intro-quote">{V.intro.quote}</div>
              </div>
            </div>
          </div>
        </section>

        {/* LIEUX */}
        <section className="sec s-dark pad-y">
          <div className="wrap-narrow">
            <div style={{ textAlign: "center", marginBottom: "clamp(30px,4vw,52px)" }}>
              <Overline className="reveal" style={{ justifyContent: "center" }}>Repérage</Overline>
              <h2 className="display reveal d1" style={{ fontSize: "clamp(26px,3.2vw,44px)", marginTop: "18px" }}>{V.lieux.title}</h2>
            </div>
            <ul className="art-list reveal d1">
              {V.lieux.list.map((li, i) => <li key={i}>{li}</li>)}
            </ul>
          </div>
        </section>

        {/* FUNNEL TO REAL SERVICE PAGE + TARIFS */}
        <section className="sec s-light pad-y">
          <div className="wrap related-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <a href={VP.href} className="related-card reveal">
              <div className="rc-img"><Slot id={"ville-cta-presta-" + V.slug} ph={VP.card} alt={VP.card + " en Suisse romande — Kevin Chinelli"} style={{ width: "100%", height: "100%" }} /></div>
              <div className="rc-meta"><h3>{VP.card}</h3><span className="ar">Découvrir →</span></div>
            </a>
            <a href="tarifs.html" className="related-card reveal d1">
              <div className="rc-img"><Slot id={"ville-cta-tarif-" + V.slug} ph="Tarifs photographe Suisse romande" alt="Tarifs photographe en Suisse romande" style={{ width: "100%", height: "100%" }} /></div>
              <div className="rc-meta"><h3>Voir les tarifs</h3><span className="ar">Découvrir →</span></div>
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec s-dark pad-y">
          <div className="wrap-narrow">
            <div style={{ textAlign: "center", marginBottom: "clamp(34px,4vw,56px)" }}>
              <Overline className="reveal" style={{ justifyContent: "center" }}>Questions fréquentes</Overline>
              <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,46px)", marginTop: "20px" }}>{VLOCAL}.</h2>
            </div>
            <div className="faq reveal d1">
              {V.faq.map((f, i) => (
                <details key={i} open={i === 0}>
                  <summary>{f.q}<span className="pm"></span></summary>
                  <div className="ans">{f.a}</div>
                </details>
              ))}
            </div>
            {V.related && V.related.length > 0 && (
              <div className="ville-reads reveal">
                {V.related.map((r) => <a key={r.article} href={r.article} className="link-arrow">À lire : {r.articleTitle} <span className="ar">→</span></a>)}
              </div>
            )}
          </div>
        </section>

        <VillesSoeurs />

        <CtaContact overline={VLOCAL} title={VP.slug === "mariage" ? "Vérifions votre date." : "Réservez votre séance."} />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<VilleApp />);
