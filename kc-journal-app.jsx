/* ============================================================
   KEVIN CHINELLI — Journal index app  (journal.html)
   ============================================================ */
const J = window.KC_JOURNAL;

function JournalApp() {
  const [t, setTweak] = useTweaks({
    palette: KC.PALETTES["Noir chaud"],
    heading: "Cinzel",
    body: "Jost",
  });
  useApplyTweaks(t);
  useReveal([]);
  const arts = J.order.map((s) => J.articles[s]);

  return (
    <>
      <div className="grain"></div>
      <Nav active="journal" />
      <main>
        <section className="sec s-dark pf-head">
          <div className="wrap">
            <h1 className="h1-stack"><span className="overline reveal"><span className="tick"></span>Conseils photo et lieux en Suisse romande</span> <span className="display h1-big reveal d1">Le journal.</span></h1>
            <p className="reveal d1">{J.meta.intro}</p>
          </div>
        </section>

        <section className="sec s-light pad-y">
          <div className="wrap">
            <div className="journal-list">
              {arts.map((a, i) => (
                <a key={a.slug} href={a.file} className={"jl-card reveal d" + ((i % 3) + 1)}>
                  <div className="jl-img"><Slot id={"art-hero-" + a.slug} ph={a.hero} alt={a.heroAlt} style={{ width: "100%", height: "100%" }} /></div>
                  <div className="jl-body">
                    <div className="jl-meta"><span className="jl-cat">{a.category}</span><span className="jl-dot">·</span><span>{a.read} de lecture</span></div>
                    <h2>{a.title}</h2>
                    <p>{a.excerpt}</p>
                    <span className="link-arrow">Lire l'article <span className="ar">→</span></span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
        <CtaContact overline="Une question, un projet ?" title="Écrivons votre histoire." />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<JournalApp />);
