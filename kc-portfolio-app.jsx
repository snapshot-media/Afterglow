/* ============================================================
   KEVIN CHINELLI — Portfolio page app
   Filterable gallery. All cells stay mounted (filter toggles a .hide
   class) so dropped images persist when switching categories. The
   lightbox (kc-lightbox.js) reads only the visible filled slots.
   Loaded after kc-shared.jsx.
   ============================================================ */
const { useState } = React;

const PF_CATS = [
  { key: "all",       label: "Tout" },
  { key: "mariage",   label: "Mariages" },
  { key: "portrait",  label: "Lifestyle" },
  { key: "studio",    label: "Studio" },
  { key: "maternite", label: "Maternité" },
];

const PF_ITEMS = [
  { id: "pf-1",         cat: "mariage",   ph: "Mariage — cérémonie" },
  { id: "pf-19",        cat: "portrait",  ph: "Portrait — lumière naturelle" },
  { id: "maternite-g0", cat: "maternite", ph: "Maternité — silhouette" },
  { id: "pf-5",         cat: "mariage",   ph: "Mariage — préparatifs" },
  { id: "pf-22",        cat: "portrait",  ph: "Portrait — regard", wide: true },
  { id: "maternite-g1", cat: "maternite", ph: "Maternité — douceur de l'attente", wide: true },
  { id: "pf-8",         cat: "mariage",   ph: "Mariage — première danse" },
  { id: "pf-20",        cat: "portrait",  ph: "Portrait — extérieur" },
  { id: "maternite-g2", cat: "maternite", ph: "Maternité — portrait serein" },
  { id: "pf-24",        cat: "mariage",   ph: "Mariage — regards", wide: true },
  { id: "maternite-g4", cat: "maternite", ph: "Maternité — drapé" },
  { id: "pf-12",        cat: "mariage",   ph: "Mariage — détails du lieu" },
  { id: "pf-21",        cat: "portrait",  ph: "Portrait — regard franc" },
  { id: "maternite-g3", cat: "maternite", ph: "Maternité — en couple" },
  { id: "pf-16",        cat: "mariage",   ph: "Mariage — sortie de cérémonie" },
  { id: "maternite-g5", cat: "maternite", ph: "Maternité — portrait intimiste" },
  { id: "pf-17",        cat: "mariage",   ph: "Mariage — moment clé" },
  { id: "maternite-g6", cat: "maternite", ph: "Maternité — paysage", wide: true },
  { id: "pf-23",        cat: "mariage",   ph: "Mariage — lumière de fin de journée" },
  { id: "maternite-g8", cat: "maternite", ph: "Maternité — détail" },
  // Studio : visible uniquement via le filtre « Studio » (exclu de la vue « Tout »
  // pour préserver la cohérence visuelle du portfolio général).
  { id: "studio-g0",    cat: "studio",    ph: "Studio — portrait éditorial" },
  { id: "studio-g1",    cat: "studio",    ph: "Studio — portrait corporate" },
  { id: "studio-g2",    cat: "studio",    ph: "Studio — clair-obscur" },
  { id: "studio-g3",    cat: "studio",    ph: "Studio — attitude" },
  { id: "studio-g4",    cat: "studio",    ph: "Studio — fond sobre" },
  { id: "studio-g5",    cat: "studio",    ph: "Studio — portrait de profil" },
];

function PortfolioApp() {
  const [t, setTweak] = useTweaks({
    palette: KC.PALETTES["Noir chaud"],
    heading: "Cinzel",
    body: "Jost",
  });
  const [cat, setCat] = useState("all");
  useApplyTweaks(t);
  useReveal([cat]);

  return (
    <>
      <div className="grain"></div>
      <Nav active="portfolio" />
      <main>
        <section className="pf-head s-dark">
          <div className="wrap">
            <h1 className="h1-stack"><span className="overline reveal"><span className="tick"></span>Portfolio · mariage, lifestyle, grossesse</span> <span className="display h1-big reveal d1">Travaux choisis.</span></h1>
            <p className="reveal d2">
              Une sélection d'images à travers les mariages, les portraits et la maternité.
              Cliquez sur une photo pour l'agrandir.
            </p>
            <div className="pf-filters reveal d2">
              {PF_CATS.map((c) => (
                <button
                  key={c.key}
                  className={"pf-filter" + (cat === c.key ? " active" : "")}
                  onClick={() => setCat(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="sec s-dark" style={{ paddingBottom: "clamp(90px,12vw,170px)" }}>
          <div className="wrap">
            <div className="pf-grid" data-lb-group="portfolio">
              {PF_ITEMS.map((it) => (
                <div key={it.id} className={"pf-cell" + (it.wide ? " pf-cell--wide" : "") + (((cat === "all" && it.cat !== "studio") || it.cat === cat) ? "" : " hide")}>
                  <Slot id={it.id} ph={it.ph} style={{ width: "100%", height: "100%" }} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <CtaContact overline="Une séance en tête ?" title="Réservez votre date." />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<PortfolioApp />);
