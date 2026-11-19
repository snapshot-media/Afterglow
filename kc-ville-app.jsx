/* ============================================================
   KEVIN CHINELLI — Landing page locale (prestation × ville)
   Reads window.KC_VILLE_SLUG → window.KC_VILLE[slug].
   Generic over prestation: each entry carries a `presta` descriptor.
   Loaded after kc-shared.jsx + kc-ville-data.js (+ kc-presta-data.js pour les formules).

   Deux gabarits dans le même composant, selon les données de la ville :
   - pages mariage (réécrites le 19.11.2026) : civil, lieux de photo, photos, journée type,
     « bon à savoir », formules. Chaque bloc ne s'affiche que si la ville le fournit ;
   - pages famille : intro, liste de lieux, deux cartes, FAQ (gabarit d'origine).
   ============================================================ */
const V = window.KC_VILLE[window.KC_VILLE_SLUG];
const VP = V.presta || { slug: "mariage", href: "mariages.html", label: "mariage", crumb: "Mariages", card: "La prestation mariage" };
const VLOCAL = VP.label.charAt(0).toUpperCase() + VP.label.slice(1) + " à " + V.ville;
const H2 = { fontSize: "clamp(26px,3.2vw,44px)", marginTop: "18px" };

/* [texte](lien) dans les textes : lien interne, ou externe (source officielle) ouvert à part */
function Rich({ text }) {
  const parts = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const external = /^https?:/.test(m[2]);
    parts.push(<a key={k++} href={m[2]} className="art-ilink" {...(external ? { target: "_blank", rel: "noopener" } : {})}>{m[1]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

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

/* ---------- le mariage civil sur place : repères vérifiés + ce que ça change pour les photos ---------- */
function Civil() {
  const C = V.civil;
  if (!C) return null;
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <Overline className="reveal">{C.over}</Overline>
        <h2 className="display reveal d1" style={{ ...H2, maxWidth: "24ch" }}>{C.title}</h2>
        <div className="vciv">
          <dl className="vfacts reveal d1">
            {C.facts.map((f, i) => <div key={i}><dt>{f.k}</dt><dd><Rich text={f.v} /></dd></div>)}
          </dl>
          <div className="vbody reveal d2">
            {C.paragraphs.map((p, i) => <p key={i}><Rich text={p} /></p>)}
            {C.source && <p className="vsrc"><Rich text={C.source} /></p>}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- où faire les photos de couple ---------- */
function Spots() {
  const S = V.spots;
  if (!S) return null;
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <Overline className="reveal">{S.over}</Overline>
        <h2 className="display reveal d1" style={{ ...H2, maxWidth: "22ch" }}>{S.title}</h2>
        {S.intro && <p className="vintro reveal d1"><Rich text={S.intro} /></p>}
        <div className="vspots">
          {S.list.map((s, i) => (
            <article key={i} className="vspot reveal">
              <div className="vspot-meta">{s.meta}</div>
              <h3>{s.name}</h3>
              <p><Rich text={s.text} /></p>
            </article>
          ))}
        </div>
        {S.outro && <p className="vintro vout reveal"><Rich text={S.outro} /></p>}
      </div>
    </section>
  );
}

/* ---------- quelques images, légendées sans jamais situer une photo ailleurs que là où elle a été prise ---------- */
function Photos() {
  const P = V.photos;
  if (!P || P.length === 0) return null;
  return (
    <section className="sec s-dark vphotos-sec" aria-label="Images de mariage">
      <div className="wrap vphotos" data-lb-group>
        {P.map((p) => (
          <figure key={p.id} className="reveal">
            <div className="vph"><Slot id={p.id} ph={p.alt} alt={p.alt} style={{ width: "100%", height: "100%" }} /></div>
            <figcaption>{p.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ---------- une journée type, heure par heure ---------- */
function Journee() {
  const J = V.journee;
  if (!J) return null;
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <Overline className="reveal">{J.over}</Overline>
        <h2 className="display reveal d1" style={{ ...H2, maxWidth: "24ch" }}>{J.title}</h2>
        {J.intro && <p className="vintro reveal d1"><Rich text={J.intro} /></p>}
        <div className={"steps vsteps" + (J.steps.length === 3 ? " three" : "")}>
          {J.steps.map((s, i) => (
            <div key={i} className={"step reveal d" + (i + 1)}>
              <div className="sn">{s.t}</div>
              <h3>{s.title}</h3>
              <p><Rich text={s.text} /></p>
            </div>
          ))}
        </div>
        {J.note && <p className="vintro vout reveal"><Rich text={J.note} /></p>}
      </div>
    </section>
  );
}

/* ---------- bon à savoir : pluie, affluence, déplacements, lieux de réception ---------- */
function Savoir() {
  const S = V.savoir;
  if (!S) return null;
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <Overline className="reveal">{S.over}</Overline>
        <h2 className="display reveal d1" style={{ ...H2, maxWidth: "22ch" }}>{S.title}</h2>
        <div className="vnotes">
          {S.items.map((n, i) => (
            <div key={i} className="vnote reveal">
              <h3>{n.title}</h3>
              <p><Rich text={n.text} /></p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- les formules mariage (kc-presta-data.js : une seule source pour les prix) ---------- */
function Tarifs() {
  const T = V.tarifs;
  const F = window.KC_PRESTA && window.KC_PRESTA.mariage ? window.KC_PRESTA.mariage.formules : null;
  if (!T || !F) return null;
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <Overline className="reveal">{T.over}</Overline>
        <h2 className="display reveal d1" style={{ ...H2, maxWidth: "24ch" }}>{T.title}</h2>
        <p className="vintro reveal d1"><Rich text={T.intro} /></p>
        <div className="tr-formules vformules reveal d1">
          {F.map((f) => (
            <div key={f.name} className={"tr-card" + (f.feature ? " feature" : "")}>
              <div className="tr-tag">{f.tag}</div>
              <h3>{f.name}</h3>
              <div className="tr-price">{f.price}</div>
            </div>
          ))}
        </div>
        <div className="vcta reveal">
          <a href="mariages.html" className="link-arrow">Le détail des formules <span className="ar">→</span></a>
          <a href="contact.html?type=Mariage" className="link-arrow">Vérifier ma date <span className="ar">→</span></a>
        </div>
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
  const heroAlt = V.heroAlt || (V.h1 + " — Kevin Chinelli, photographe en Suisse romande");

  return (
    <>
      <div className="grain"></div>
      <Nav active={VP.slug} />
      <main>
        {/* HERO (heroMobile : une seconde image, en hauteur, pour le téléphone) */}
        <section className="phero bas">
          <div className="bg">
            <Slot id={"ville-hero-" + V.slug} ph={V.heroImg} alt={heroAlt} loading="eager" fetchpriority="high" media={V.heroMobile ? "(min-width:601px)" : undefined} style={{ width: "100%", height: "100%" }} />
            {V.heroMobile && <Slot id={"ville-hero-" + V.slug + "-mobile"} ph={V.heroImg} alt={heroAlt} loading="eager" fetchpriority="high" media="(max-width:600px)" style={{ width: "100%", height: "100%" }} />}
          </div>
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
                {V.intro.paragraphs.map((p, i) => <p key={i}><Rich text={p} /></p>)}
                {V.intro.quote && <div className="intro-quote">{V.intro.quote}</div>}
              </div>
            </div>
          </div>
        </section>

        <Civil />
        <Spots />
        <Photos />
        <Journee />
        <Savoir />
        <Tarifs />

        {/* LIEUX (gabarit d'origine, pages sans « spots ») */}
        {V.lieux && !V.spots && (
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
        )}

        {/* FUNNEL TO REAL SERVICE PAGE + TARIFS (pages sans le bloc des formules) */}
        {!V.tarifs && (
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
        )}

        {/* FAQ */}
        <section className="sec s-dark pad-y">
          <div className="wrap-narrow">
            <div style={{ textAlign: "center", marginBottom: "clamp(34px,4vw,56px)" }}>
              <Overline className="reveal" style={{ justifyContent: "center" }}>Questions fréquentes</Overline>
              <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,46px)", marginTop: "20px" }}>{V.faqTitle || (VLOCAL + ".")}</h2>
            </div>
            <div className="faq reveal d1">
              {V.faq.map((f, i) => (
                <details key={i} open={i === 0}>
                  <summary>{f.q}<span className="pm"></span></summary>
                  <div className="ans"><Rich text={f.a} /></div>
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
