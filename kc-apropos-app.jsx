/* ============================================================
   KEVIN CHINELLI — À propos page app
   Loaded after kc-shared.jsx.
   ============================================================ */
const VALUES = [
  { n: "01", t: "La vérité avant la pose", p: "Je cherche l'instant non rejoué — un regard, un rire, un silence. Mon travail est d'être présent sans jamais peser, pour que l'émotion reste entière." },
  { n: "02", t: "La lumière, toujours", p: "Naturelle ou maîtrisée en studio, la lumière est mon premier sujet. Elle sculpte, révèle et donne à chaque image sa profondeur et son intemporalité." },
  { n: "03", t: "Un accompagnement entier", p: "De la première rencontre à la livraison de vos tirages, je vous accompagne avec soin. Chaque projet est unique et mérite une attention sur mesure." },
];


function ApHero() {
  return (
    <section className="phero bas">
      <div className="bg">
        <Slot id="apropos-hero" ph="Kevin Chinelli — photographe en Suisse romande, en montagne" loading="eager" fetchpriority="high" media="(min-width:601px)" style={{ width: "100%", height: "100%" }} />
        <Slot id="apropos-hero-mobile" ph="Kevin Chinelli — photographe en Suisse romande" loading="eager" fetchpriority="high" media="(max-width:600px)" style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="scrim"></div>
      <div className="phero-content">
        <div className="crumb reveal in"><a href={KC.HOME}>Accueil</a><span>/</span><span>À propos</span></div>
        <h1 className="reveal in d1"><span className="h1-main">Kevin Chinelli</span> <span className="h1-sub">Photographe en Suisse romande</span></h1>
        <p className="hint reveal in d2">« Les moments qui comptent ne se mettent pas en scène. »</p>
      </div>
    </section>
  );
}

function ApIntro() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap ap-intro">
        <Overline className="reveal">Le photographe</Overline>
        <p className="ap-lead reveal d1">
          Mon travail, c'est d'être là — attentif, discret, à l'écoute — au moment exact où
          quelque chose de vrai se passe. Mais avant d'être un métier, la photographie a d'abord
          été une histoire de regard : le mien, posé sur les gens que j'aime.
        </p>
        <div className="ap-intro-grid">
          <div className="ap-intro-col">
            <p className="ap-body reveal d2">
              Tout a commencé en voyage. Au fil de nos escapades à deux, j'ai pris l'habitude de
              photographier ma femme — de chercher la lumière qui lui allait, l'instant où elle
              s'oubliait, le geste juste. C'est là, sans vraiment m'en rendre compte, que s'est
              formé mon œil pour l'émotion humaine : pas dans la pose, mais dans le vrai.
            </p>
            <p className="ap-body reveal d2">
              Avant la photo, j'ai exploré plusieurs terrains créatifs — la musique, la vidéo, la
              création de contenu. Le déclic est venu d'un projet de trois semaines en Tanzanie,
              appareil en main, loin de tout confort : j'en suis rentré avec une certitude
              tranquille. C'était ma voie.
            </p>
            <p className="ap-body reveal d2">
              Depuis, je crois qu'une belle image se joue d'abord dans la relation. Avant
              l'esthétique, il y a la rencontre : prendre le temps de vous comprendre, créer un
              cadre où vous vous sentez à l'aise et compris, pour que vous oubliiez vite
              l'objectif. C'est cette confiance qui rend les images justes — et qui les fait
              respirer des années plus tard.
            </p>
            <p className="ap-body reveal d2">
              Aujourd'hui, je photographie les gens en Suisse romande : vos mariages, vos
              portraits, l'attente d'un enfant. Toujours en lumière naturelle autant que possible,
              avec la même exigence et la même écoute — et l'envie de vous offrir des images dans
              lesquelles vous vous reconnaissez vraiment.
            </p>
          </div>
          <aside className="ap-intro-aside reveal d1">
            <figure className="ap-photo-frame">
              <Slot id="ap-portrait" ph="Kevin Chinelli — photographe en Suisse romande" alt="Kevin Chinelli, photographe d'humains en Suisse romande" style={{ width: "100%", height: "100%" }} />
            </figure>
          </aside>
        </div>
      </div>
    </section>
  );
}

function Values() {
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <div style={{ textAlign: "center", marginBottom: "clamp(44px,5vw,72px)" }}>
          <Overline className="reveal" style={{ justifyContent: "center" }}>Ma démarche</Overline>
          <h2 className="display reveal d1" style={{ fontSize: "clamp(30px,4vw,56px)", marginTop: "20px" }}>Trois convictions.</h2>
        </div>
        <div className="values">
          {VALUES.map((v, i) => (
            <div key={i} className={"value reveal d" + (i + 1)}>
              <span className="vn">{v.n}</span>
              <h4>{v.t}</h4>
              <p>{v.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuoteBand() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <blockquote className="ap-quote reveal">
          « Une photographie réussie, c'est un souvenir qui respire encore, des années plus tard. »
        </blockquote>
      </div>
    </section>
  );
}

function StudioStrip() {
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "clamp(30px,4vw,52px)", flexWrap: "wrap", gap: "18px" }}>
          <div>
            <Overline className="reveal">L'atelier</Overline>
            <h2 className="display reveal d1" style={{ fontSize: "clamp(26px,3vw,44px)", marginTop: "16px" }}>Là où naissent les images.</h2>
          </div>
          <a href="portfolio.html" className="link-arrow reveal d1">Voir le portfolio <span className="ar">→</span></a>
        </div>
        <div className="gal reveal d1" data-lb-group="atelier">
          <div className="cell"><Slot id="ap-studio-1" ph="Mariage — instant d'émotion" style={{ width: "100%", height: "100%" }} /></div>
          <div className="stack">
            <div className="cell"><Slot id="ap-studio-2" ph="Portrait — lumière naturelle" style={{ width: "100%", height: "100%" }} /></div>
            <div className="cell"><Slot id="ap-studio-3" ph="Maternité — douceur de l'attente" style={{ width: "100%", height: "100%" }} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ApApp() {
  const [t, setTweak] = useTweaks({
    palette: KC.PALETTES["Noir chaud"],
    heading: "Cinzel",
    body: "Jost",
  });
  useApplyTweaks(t);
  useReveal([]);

  return (
    <>
      <div className="grain"></div>
      <Nav active="apropos" />
      <main>
        <ApHero />
        <ApIntro />
        <Values />
        <QuoteBand />
        <StudioStrip />
        <CtaContact overline="Travaillons ensemble" title="Racontons votre histoire." />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ApApp />);
