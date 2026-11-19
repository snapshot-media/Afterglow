/* ============================================================
   KEVIN CHINELLI — single article app
   Reads window.KC_ARTICLE (slug) → window.KC_JOURNAL.articles[slug]
   ============================================================ */
const A = window.KC_JOURNAL.articles[window.KC_ARTICLE];
const J_ALL = window.KC_JOURNAL;

/* render inline [texte](href) links inside article copy (internal linking) */
function RichText({ text }) {
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

function ArticleApp() {
  const [t, setTweak] = useTweaks({
    palette: KC.PALETTES["Noir chaud"],
    heading: "Cinzel",
    body: "Jost",
  });
  useApplyTweaks(t);
  useReveal([]);

  const others = J_ALL.order.filter((s) => s !== A.slug).map((s) => J_ALL.articles[s]).slice(0, 2);

  return (
    <>
      <div className="grain"></div>
      <Nav active="journal" />
      <main>
        <article>
          <header className="art-hero">
            <div className="bg"><Slot id={"art-hero-" + A.slug} ph={A.hero} alt={A.heroAlt} loading="eager" fetchpriority="high" style={{ width: "100%", height: "100%" }} /></div>
            <div className="scrim"></div>
            <div className="art-hero-content">
              <div className="crumb reveal in"><a href={KC.HOME}>Accueil</a><span>/</span><a href="journal.html">Journal</a><span>/</span><span>{A.category}</span></div>
              <h1 className="reveal in d1">{A.title}</h1>
              <div className="art-meta reveal in d2"><span>{A.dateLabel}</span><span className="jl-dot">·</span><span>{A.read} de lecture</span></div>
            </div>
          </header>

          <div className="sec s-light pad-y">
            <div className="wrap-narrow art-body">
              <p className="art-lead reveal"><RichText text={A.intro} /></p>
              {A.sections.map((s, i) => (
                <section key={i} className="art-section reveal">
                  <h2>{s.h}</h2>
                  {s.p && s.p.map((p, j) => <p key={j}><RichText text={p} /></p>)}
                  {s.list && <ul className="art-list">{s.list.map((li, j) => <li key={j}><RichText text={li} /></li>)}</ul>}
                </section>
              ))}
              <div className="art-closing reveal">
                <p>{A.closing}</p>
                <a href={A.relatedHref} className="link-arrow">Découvrir mes séances {A.relatedTitle.toLowerCase()} <span className="ar">→</span></a>
              </div>
            </div>
          </div>

          <section className="sec s-dark pad-y">
            <div className="wrap">
              <Overline className="reveal" style={{ justifyContent: "center" }}>À lire aussi</Overline>
              <div className="journal-list two" style={{ marginTop: "clamp(30px,4vw,52px)" }}>
                {others.map((o, i) => (
                  <a key={o.slug} href={o.file} className={"jl-card reveal d" + (i + 1)}>
                    <div className="jl-img"><Slot id={"art-hero-" + o.slug} ph={o.hero} alt={o.heroAlt} style={{ width: "100%", height: "100%" }} /></div>
                    <div className="jl-body">
                      <div className="jl-meta"><span className="jl-cat">{o.category}</span></div>
                      <h2>{o.title}</h2>
                      <span className="link-arrow">Lire l'article <span className="ar">→</span></span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </article>
        <CtaContact title="Réservez votre séance." />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ArticleApp />);
