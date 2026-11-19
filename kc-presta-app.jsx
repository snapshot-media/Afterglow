/* ============================================================
   KEVIN CHINELLI — shared prestation page app
   Reads window.KC_SLUG → window.KC_PRESTA[slug] and renders the
   full prestation page. Loaded after kc-shared.jsx + kc-presta-data.js.
   ============================================================ */
const { useEffect } = React;
const DATA = window.KC_PRESTA[window.KC_SLUG];
// Sous-page (solo, couple, famille) : sa page mère dans le menu (Lifestyle).
const PARENT_NAV = DATA.parent ? PRESTA_NAV.find((p) => p.slug === DATA.parent) : null;
// Prestation présélectionnée dans le formulaire de contact (clés de TYPES, kc-contact-app.jsx)
const CONTACT_TYPE = { mariage: "Mariage", studio: "Studio", maternite: "Maternité & Grossesse" }[window.KC_SLUG] || "Lifestyle";
const CONTACT_HREF = "contact.html?type=" + encodeURIComponent(CONTACT_TYPE);

/* mosaic cell class par orientation de la photo :
   v = verticale → cellule verticale (m-tall) · h = horizontale → cellule large (m-wide)
   big = horizontale mise en avant → grande cellule (m-big).
   Règle : une photo verticale ne va JAMAIS dans une cellule non verticale. */
const M_CLASS = { v: "m-tall", h: "m-wide", big: "m-big" };

/* ---------- HERO ---------- */
function PrestaHero({ layout }) {
  return (
    <section className={"phero " + layout}>
      <div className="bg">
        <Slot id={"phero-" + DATA.slug} ph={DATA.heroImg} alt={"Photographe " + DATA.title.toLowerCase() + " en Suisse romande — " + DATA.heroImg + " par Kevin Chinelli"} loading="eager" fetchpriority="high" media="(min-width:601px)" style={{ width: "100%", height: "100%" }} />
        <Slot id={"phero-" + DATA.slug + "-mobile"} ph={DATA.heroImg} alt={"Photographe " + DATA.title.toLowerCase() + " en Suisse romande — " + DATA.heroImg + " par Kevin Chinelli"} loading="eager" fetchpriority="high" media="(max-width:600px)" style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="scrim"></div>
      <div className="phero-content">
        <div className="crumb reveal in">
          <a href={KC.HOME}>Accueil</a><span>/</span>
          {PARENT_NAV && <><a href={PARENT_NAV.href}>{PARENT_NAV.title}</a><span>/</span></>}
          <span>{DATA.crumb}</span>
        </div>
        {/* H1 = le grand titre + la ligne de mots-clés (affichée comme avant, sous le titre) */}
        <h1 className="reveal in d1"><span className="h1-main">{DATA.title}</span> <span className="h1-sub">{DATA.heroHint}</span></h1>
      </div>
    </section>
  );
}

/* ---------- REASSURANCE BAR (trust strip under hero) ---------- */
function ReassureBar() {
  const isMariage = window.KC_SLUG === "mariage";
  const points = isMariage
    ? ["Réponse sous 48 h", "1 seul mariage par jour", "Tarifs transparents"]
    : ["Réponse sous 48 h", "Tarifs transparents"];
  // Sur mobile, on ne garde qu'un seul point — le plus pertinent selon la prestation.
  const mobileKeep = isMariage ? "1 seul mariage par jour" : "Réponse sous 48 h";
  return (
    <section className="reassure s-dark" aria-label="Engagements">
      <div className="wrap reassure-row">
        {points.map((p, i) => (
          <div key={i} className={"reassure-item" + (p === mobileKeep ? " keep-mobile" : "")}><span className="rdot"></span>{p}</div>
        ))}
      </div>
    </section>
  );
}

/* ---------- INTRO / APPROCHE ---------- */
function Intro() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <Overline className="reveal">L'approche</Overline>
        <div className="intro-grid" style={{ marginTop: "clamp(34px,4vw,58px)" }}>
          <p className="lead reveal d1">{DATA.intro.lead}</p>
          <div className="body reveal d2">
            {DATA.intro.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            <div className="intro-quote">{DATA.intro.quote}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- SOUS-PAGES (page mère Lifestyle : solo, couple, famille) ---------- */
function SubpagesBand() {
  const nav = PRESTA_NAV.find((p) => p.slug === window.KC_SLUG);
  if (!nav || !nav.children) return null;
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <div style={{ textAlign: "center", marginBottom: "clamp(34px,4vw,56px)" }}>
          <Overline className="reveal" style={{ justifyContent: "center" }}>Trois façons de vivre la séance</Overline>
          <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,48px)", marginTop: "18px" }}>Seul, à deux ou en famille.</h2>
        </div>
        <div className="related-grid sub-grid">
          {nav.children.map((c, i) => {
            const d = window.KC_PRESTA[c.slug] || {};
            const from = d.formules && d.formules[0] ? d.formules[0].price : "";
            return (
              <a key={c.slug} href={c.href} className={"related-card sub-card reveal d" + (i + 1)}>
                <div className="rc-img"><Slot id={"presta-" + c.slug} ph={"Séance " + c.title.toLowerCase()} alt={(d.schemaName || c.title) + " en Suisse romande — Kevin Chinelli, photographe"} style={{ width: "100%", height: "100%" }} /></div>
                <div className="sub-body">
                  <div className="rc-meta"><h3>{c.title}</h3><span className="ar">Découvrir →</span></div>
                  {d.cardText && <p className="sub-text">{d.cardText}</p>}
                  {from && <p className="sub-from">Dès {from}</p>}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- GALLERY (mosaic) ---------- */
function GalleryMosaic() {
  // Pas encore de photos pour cette prestation (couple, famille) : pas de galerie plutôt que des cases vides.
  if (!DATA.gallery || DATA.gallery.length === 0) return null;
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "clamp(34px,4vw,56px)", flexWrap: "wrap", gap: "20px" }}>
          <div>
            <Overline className="reveal">Galerie</Overline>
            <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,48px)", marginTop: "16px" }}>Un aperçu.</h2>
          </div>
          <a href="contact.html" className="link-arrow reveal d1">Demander la galerie complète <span className="ar">→</span></a>
        </div>
        <div className="mosaic reveal d1" data-lb-group="mosaic">
          {DATA.gallery.map((g, i) => (
            <div key={i} className={"cell " + (M_CLASS[g.o] || "")}>
              <Slot id={DATA.slug + "-g" + i} ph={g.ph} alt={g.ph + " — " + DATA.title.toLowerCase() + " en Suisse romande, photographie par Kevin Chinelli"} style={{ width: "100%", height: "100%" }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- FORMULES & TARIFS ---------- */
function Formules() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <div style={{ textAlign: "center", marginBottom: "clamp(40px,5vw,68px)" }}>
          <Overline className="reveal" style={{ justifyContent: "center" }}>Formules & tarifs</Overline>
          <h2 className="display reveal d1" style={{ fontSize: "clamp(30px,4vw,56px)", marginTop: "20px" }}>Trouvons la bonne formule.</h2>
        </div>
        <div className={"formules" + (DATA.formules.length === 2 && !DATA.entreprise ? " two" : "")}>
          {DATA.formules.map((f, i) => (
            <div key={i} className={"formule reveal d" + (i + 1) + (f.feature ? " feature" : "")}>
              <div className="tag">{f.tag}</div>
              <h3>{f.name}</h3>
              <div className="price">{f.price.startsWith("dès ") ? <><small>dès</small>{f.price.slice(3)}</> : f.price}</div>
              <ul>{f.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
              <a href={CONTACT_HREF} className="pick">Choisir <span className="ar">→</span></a>
            </div>
          ))}
          {/* Entreprises : portraits pro et d'équipe chez Snapshot Media (décision du 19.11.2026) */}
          {DATA.entreprise && (
            <div className={"formule formule-pro reveal d" + (DATA.formules.length + 1)}>
              <div className="tag">Entreprises & équipes</div>
              <h3>Portrait professionnel</h3>
              <p className="pro-text">Portraits d'équipe, image de marque, photos pour votre site ou votre profil LinkedIn : je les réalise avec Snapshot Media, mon studio pour les entreprises.</p>
              <a href={KC.PRO_URL} className="pick" target="_blank" rel="noopener" data-umami-event="vers-snapshot-media">Voir sur Snapshot Media <span className="ar">→</span></a>
            </div>
          )}
        </div>
        <p className="tarif-note">Tarifs sur devis personnalisé — chaque projet est unique. Contactez-moi pour une proposition détaillée.
          {window.KC_SLUG !== "mariage" && <><br /><a href="bon-cadeau.html" className="gift-link" data-umami-event="vers-bon-cadeau">Offrir cette séance en bon cadeau <span className="ar">→</span></a></>}
        </p>
      </div>
    </section>
  );
}

/* ---------- PROCESS / DÉROULÉ ---------- */
function Process() {
  const three = DATA.process.length === 3;
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <div style={{ textAlign: "center", marginBottom: "clamp(40px,5vw,68px)" }}>
          <Overline className="reveal" style={{ justifyContent: "center" }}>Le déroulé</Overline>
          <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,48px)", marginTop: "20px" }}>De l'idée à vos images.</h2>
        </div>
        <div className={"steps" + (three ? " three" : "")}>
          {DATA.process.map((s, i) => (
            <div key={i} className={"step reveal d" + (i + 1)}>
              <div className="sn">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- INCLUS ---------- */
function Inclus() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <div className="inclus-grid">
          <div className="reveal">
            <Overline>Toujours inclus</Overline>
            <h2 className="display" style={{ fontSize: "clamp(26px,3vw,42px)", marginTop: "20px", lineHeight: 1.15 }}>
              Le soin du détail, à chaque étape.
            </h2>
          </div>
          <ul className="inclus-list reveal d1">
            {DATA.inclus.map((it, i) => (
              <li key={i}><span className="ck">—</span>{it}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */
function Faq() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap-narrow">
        <div style={{ textAlign: "center", marginBottom: "clamp(34px,4vw,56px)" }}>
          <Overline className="reveal" style={{ justifyContent: "center" }}>Questions fréquentes</Overline>
          <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,46px)", marginTop: "20px" }}>Bon à savoir.</h2>
        </div>
        <div className="faq reveal d1">
          {DATA.faq.map((f, i) => (
            <details key={i} open={i === 0}>
              <summary>{f.q}<span className="pm"></span></summary>
              <div className="ans">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- DATE AVAILABILITY (mariage) ---------- */
function DateCheck() {
  const [date, setDate] = React.useState("");
  const go = () => {
    const q = date ? "?date=" + encodeURIComponent(date) + "&type=" + encodeURIComponent(CONTACT_TYPE) : "?type=" + encodeURIComponent(CONTACT_TYPE);
    window.location.href = "contact.html" + q;
  };
  return (
    <section className="sec s-darker pad-y">
      <div className="wrap-narrow datecheck reveal">
        <Overline style={{ justifyContent: "center" }}>Disponibilité</Overline>
        <h2 className="display" style={{ fontSize: "clamp(26px,3.2vw,44px)", margin: "18px 0 14px", textAlign: "center" }}>Votre date est-elle libre&nbsp;?</h2>
        <p className="dc-sub">Je ne réserve qu'un seul mariage par jour. Indiquez votre date&nbsp;: je vous confirme ma disponibilité sous 48&nbsp;h.</p>
        <div className="dc-row">
          <input className="control" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date du mariage" />
          <button className="dc-btn" onClick={go}>Vérifier ma date <span className="ar">→</span></button>
        </div>
      </div>
    </section>
  );
}

/* ---------- GIFT CARD (couple) ---------- */
function GiftBand() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap gift-band reveal">
        <div className="gb-text">
          <Overline>Bon cadeau</Overline>
          <h2 className="display" style={{ fontSize: "clamp(26px,3.2vw,44px)", margin: "16px 0 14px" }}>Offrez une séance.</h2>
          <p>Une demande à venir, un anniversaire de rencontre, les fêtes&nbsp;? Offrez une séance, ou un montant à valoir sur la séance de son choix. Le bon arrive par e-mail et reste valable 12&nbsp;mois.</p>
          <a href="bon-cadeau.html" className="link-arrow" style={{ marginTop: "10px" }} data-umami-event="vers-bon-cadeau">Offrir un bon cadeau <span className="ar">→</span></a>
        </div>
        <div className="gb-img"><Slot id="couple-gift" ph="Bon cadeau — séance couple" alt="Bon cadeau pour une séance photo de couple en Suisse romande — Kevin Chinelli" style={{ width: "100%", height: "100%" }} /></div>
      </div>
    </section>
  );
}

/* ---------- VILLES (internal linking, prestation × ville) ---------- */
const VILLE_LINKS = {
  mariage: { label: "mariage", items: [
    { ville: "Lausanne", href: "photographe-mariage-lausanne.html" },
    { ville: "Genève", href: "photographe-mariage-geneve.html" },
    { ville: "Montreux", href: "photographe-mariage-montreux.html" },
  ] },
  famille: { label: "famille", items: [
    { ville: "Lausanne", href: "photographe-famille-lausanne.html" },
    { ville: "Genève", href: "photographe-famille-geneve.html" },
  ] },
};
function VillesBand() {
  const cfg = VILLE_LINKS[window.KC_SLUG];
  if (!cfg) return null;
  const Cap = cfg.label.charAt(0).toUpperCase() + cfg.label.slice(1);
  return (
    <section className="sec s-light pad-y">
      <div className="wrap" style={{ textAlign: "center" }}>
        <Overline className="reveal" style={{ justifyContent: "center" }}>Par région</Overline>
        <h2 className="display reveal d1" style={{ fontSize: "clamp(26px,3.2vw,44px)", margin: "18px 0 clamp(28px,3.5vw,44px)" }}>Photographe {cfg.label} près de chez vous.</h2>
        <div className="villes-row reveal d1">
          {cfg.items.map((v) => (
            <a key={v.ville} href={v.href} className="ville-chip">{Cap} à {v.ville} <span className="ar">→</span></a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- JOURNAL (internal linking, prestation × articles) ---------- */
const JOURNAL_CATS = {
  mariage: ["Mariage"],
  portrait: ["Portrait", "Couple", "Studio"],
  solo: ["Portrait", "Studio"],
  couple: ["Couple", "Portrait"],
  famille: ["Portrait"], // pas encore d'article famille : les conseils de séance (lieux, tenue) valent aussi
  studio: ["Studio", "Portrait"],
  maternite: ["Maternité"],
};
function JournalBand() {
  const J = window.KC_JOURNAL;
  const cats = JOURNAL_CATS[window.KC_SLUG];
  if (!J || !cats) return null;
  // articles de la première catégorie d'abord (ex. Couple sur la page Couple), puis les suivantes ; ordre du journal ensuite
  const all = J.order.map((s) => J.articles[s]).filter((a) => cats.includes(a.category))
    .sort((x, y) => cats.indexOf(x.category) - cats.indexOf(y.category));
  if (all.length === 0) return null;
  // trois en cartes ; les autres du même thème en liens sous les cartes (maillage : avant le 19.11.2026,
  // cinq guides mariage n'étaient liés que depuis la page Journal)
  const arts = all.slice(0, 3), more = all.slice(3);
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "clamp(30px,4vw,52px)", flexWrap: "wrap", gap: "18px" }}>
          <div>
            <Overline className="reveal">Le journal</Overline>
            <h2 className="display reveal d1" style={{ fontSize: "clamp(26px,3vw,44px)", marginTop: "16px" }}>À lire avant votre séance.</h2>
          </div>
          <a href="journal.html" className="link-arrow reveal d1">Tout le journal <span className="ar">→</span></a>
        </div>
        <div className="journal-list three reveal d1">
          {arts.map((a, i) => (
            <a key={a.slug} href={a.file} className={"jl-card reveal d" + (i + 1)}>
              <div className="jl-img"><Slot id={"art-hero-" + a.slug} ph={a.hero} alt={a.heroAlt} style={{ width: "100%", height: "100%" }} /></div>
              <div className="jl-body">
                <div className="jl-meta"><span className="jl-cat">{a.category}</span><span className="jl-dot">·</span><span>{a.read} de lecture</span></div>
                <h2>{a.title}</h2>
                <span className="link-arrow">Lire l'article <span className="ar">→</span></span>
              </div>
            </a>
          ))}
        </div>
        {more.length > 0 && (
          <div className="jl-more reveal">
            <span className="jl-more-label">Aussi dans le journal</span>
            {more.map((a) => <a key={a.slug} href={a.file}>{a.title} <span className="ar">→</span></a>)}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- APP ---------- */
function PrestaApp() {
  const [t, setTweak] = useTweaks({
    palette: KC.PALETTES["Noir chaud"],
    heading: "Cinzel",
    body: "Jost",
    heroLayout: DATA.heroDefault,
  });
  useApplyTweaks(t);
  useReveal([t.heroLayout]);

  return (
    <>
      <div className="grain"></div>
      <Nav active={window.KC_SLUG} />
      <main>
        <PrestaHero layout={t.heroLayout} />
        <ReassureBar />
        <Intro />
        <SubpagesBand />
        <GalleryMosaic />
        <Formules />
        {window.KC_SLUG === "mariage" && <DateCheck />}
        <Process />
        <Inclus />
        {window.KC_SLUG === "couple" && <GiftBand />}
        <Faq />
        <JournalBand />
        {VILLE_LINKS[window.KC_SLUG] && <VillesBand />}
        <RelatedPresta current={window.KC_SLUG} />
        <CtaContact title="Réservez votre séance." />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<PrestaApp />);
