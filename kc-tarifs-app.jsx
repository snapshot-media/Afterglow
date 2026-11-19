/* ============================================================
   KEVIN CHINELLI — Tarifs (page d'intention commerciale)
   Récapitule les formules de window.KC_PRESTA + FAQ tarifaire.
   Loaded after kc-shared.jsx + kc-presta-data.js.
   ============================================================ */
const PRESTA = window.KC_PRESTA;
const ORDER = ["mariage", "portrait", "studio", "maternite"];
const HREF = {};
(window.PRESTA_NAV || []).forEach((p) => { HREF[p.slug] = p.href; });

const TARIF_FAQ = [
  { q: "Combien coûte un photographe de mariage en Suisse romande ?",
    a: "Un reportage de mariage se situe généralement entre CHF 1'290 (demi-journée) et CHF 4'500 et plus (couverture sur deux jours, second photographe et album). Ma formule la plus choisie — Signature, 10 h de couverture — est à CHF 2'490. Chaque devis reste personnalisé selon votre déroulé." },
  { q: "Les frais de déplacement sont-ils inclus ?",
    a: "Oui — aucun frais de déplacement à l'intérieur de la Suisse romande (Vaud, Genève, Fribourg, Neuchâtel, Valais). Pour un projet ailleurs en Suisse ou à l'étranger, le déplacement et l'hébergement éventuel sont chiffrés clairement dans le devis." },
  { q: "Les tarifs sont-ils fixes ou sur devis ?",
    a: "Les prix affichés sont des repères transparents, alignés sur le marché romand. Le devis final est personnalisé : il s'ajuste à la durée, au lieu, aux livrables (album, tirages) et aux options choisies." },
  { q: "Comment réserver et régler ?",
    a: "La date est bloquée à la signature du contrat et au versement d'un acompte de 30 %. Le solde est réglé avant la prestation ; pour les mariages, il est versé 10 jours après la célébration, et je conseille de réserver 8 à 14 mois à l'avance pour les samedis de mai à septembre." },
  { q: "Proposez-vous des bons cadeaux ?",
    a: "Oui, des bons cadeaux personnalisés valables un an — pour une séance lifestyle (solo, couple ou famille), studio ou maternité. Une belle idée de cadeau pour un anniversaire, une naissance ou les fêtes." },
];

function priceNum(s) {
  const m = String(s).replace(/['’']/g, "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}
function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function TarifRow({ slug }) {
  const d = PRESTA[slug];
  const min = Math.min(...d.formules.map((f) => priceNum(f.price)));
  return (
    <div className="tarif-row reveal">
      <div className="tr-head">
        <h3>{d.title}</h3>
        <div className="tr-from">À partir de <b>CHF {fmt(min)}</b></div>
        <a href={HREF[d.slug] || (d.slug + ".html")}
           className="link-arrow">Voir le détail <span className="ar">→</span></a>
      </div>
      <div className="tr-formules">
        {d.formules.map((f, i) => (
          <div key={i} className={"tr-card" + (f.feature ? " feature" : "")}>
            <div className="tr-tag">{f.tag}</div>
            <h4>{f.name}</h4>
            <div className="tr-price">{f.price}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TarifsApp() {
  const [t, setTweak] = useTweaks({ palette: KC.PALETTES["Noir chaud"], heading: "Cinzel", body: "Jost" });
  useApplyTweaks(t);
  useReveal([]);

  return (
    <>
      <div className="grain"></div>
      <Nav active="tarifs" />
      <main>
        <section className="pf-head s-dark">
          <div className="wrap">
            <h1 className="h1-stack"><span className="overline reveal"><span className="tick"></span>Tarifs photographe · Suisse romande</span> <span className="display h1-big reveal d1">Des tarifs clairs, annoncés.</span></h1>
            <p className="tarif-intro reveal d2">
              Pas de prix caché ni de devis opaque. Voici mes formules de référence pour la photographie de
              mariage, lifestyle (solo, couple, famille), studio et maternité en Suisse romande. Chaque projet étant unique,
              le devis final est personnalisé — mais vous savez d'emblée à quoi vous attendre.
            </p>
          </div>
        </section>

        <section className="sec s-light pad-y">
          <div className="wrap">
            {ORDER.map((slug) => <TarifRow key={slug} slug={slug} />)}
          </div>
        </section>

        <section className="sec s-dark pad-y">
          <div className="wrap inclus-grid">
            <div className="reveal">
              <Overline>Toujours inclus</Overline>
              <h2 className="display" style={{ fontSize: "clamp(26px,3vw,42px)", marginTop: "20px", lineHeight: 1.15 }}>
                Ce que comprend chaque prestation.
              </h2>
            </div>
            <ul className="inclus-list reveal d1">
              {["Conseils avant la séance", "Galerie privée en ligne, téléchargement HD",
                "Retouche soignée image par image", "Droits d'usage privé inclus",
                "Déplacement inclus en Suisse romande", "Double sauvegarde sécurisée"].map((it, i) => (
                <li key={i}><span className="ck">—</span>{it}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="sec s-light pad-y">
          <div className="wrap-narrow">
            <div style={{ textAlign: "center", marginBottom: "clamp(34px,4vw,56px)" }}>
              <Overline className="reveal" style={{ justifyContent: "center" }}>Questions sur les tarifs</Overline>
              <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,46px)", marginTop: "20px" }}>Bon à savoir.</h2>
            </div>
            <div className="faq reveal d1">
              {TARIF_FAQ.map((f, i) => (
                <details key={i} open={i === 0}>
                  <summary>{f.q}<span className="pm"></span></summary>
                  <div className="ans">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <CtaContact overline="Parlons de votre projet" title="Demandez votre devis." />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<TarifsApp />);
