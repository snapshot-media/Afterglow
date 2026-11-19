/* ============================================================
   KEVIN CHINELLI — Bon cadeau (bon-cadeau.html)
   Conditions de Kevin (19.11.2026) : une séance précise OU un montant libre
   (dès CHF 100), valable 12 mois, envoyé en PDF par e-mail une fois la
   facture réglée. Les séances et leurs prix viennent de window.KC_PRESTA ;
   les liens « Offrir » pré-remplissent le formulaire (contact.html?type=Bon cadeau&bon=…,
   clés lues par kc-contact-app.jsx).
   Loaded after kc-shared.jsx + kc-presta-data.js.
   ============================================================ */
const PRESTA = window.KC_PRESTA;
// Séances qu'on peut offrir (le mariage se réserve sur devis) : slug des données → préfixe de la clé « bon »
const GIFT = [
  { slug: "portrait",  key: "lifestyle", label: "Lifestyle",             sub: "Seul, à deux ou en famille" },
  { slug: "maternite", key: "maternite", label: "Grossesse & maternité", sub: "Le ventre rond, puis le nouveau-né" },
  { slug: "studio",    key: "studio",    label: "Studio",                sub: "Le portrait en lumière maîtrisée" },
];
const MIN_MONTANT = 100;
const CONTACT = "contact.html?type=" + encodeURIComponent("Bon cadeau");
// clé d'une formule : « lifestyle-signature », « maternite-cocon »… (même calcul dans kc-contact-app.jsx)
const bonKey = (prefix, name) => prefix + "-" + name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/)[0];

const CADEAU_FAQ = [
  { q: "Combien de temps le bon cadeau est-il valable ?",
    a: "12 mois à partir de sa date d'émission, inscrite sur le bon. La séance a lieu dans ce délai, à une date que nous choisissons ensemble selon la saison et mes disponibilités." },
  { q: "Jusqu'à quand commander un bon cadeau pour Noël ?",
    a: "Le bon part par e-mail dès que la facture est réglée. Pour l'avoir à temps sous le sapin, commandez-le au plus tard le 20 décembre." },
  { q: "La personne peut-elle choisir une autre séance que celle offerte ?",
    a: "Oui. Le bon vaut le prix de la séance offerte : il peut servir à une autre séance lifestyle, grossesse ou studio. Si la séance choisie coûte plus, la personne règle la différence avant la séance. Un bon d'un montant libre fonctionne de la même façon." },
  { q: "Le bon cadeau est-il remboursable ?",
    a: "Non, il n'est ni remboursable ni échangeable contre de l'argent. Il peut en revanche être offert à quelqu'un d'autre : il suffit de me prévenir." },
  { q: "Où a lieu la séance ?",
    a: "En extérieur, partout en Suisse romande, déplacement inclus, ou en studio pour les séances studio. Le lieu se choisit ensemble au moment de fixer la date." },
];

function priceNum(s) {
  const m = String(s).replace(/['’]/g, "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

/* Les séances, formule par formule, chacune avec son lien « Offrir » */
function GiftRow({ g }) {
  const d = PRESTA[g.slug];
  const min = Math.min(...d.formules.map((f) => priceNum(f.price)));
  return (
    <div className="tarif-row reveal">
      <div className="tr-head">
        <h3>{g.label}</h3>
        <p className="gift-sub">{g.sub}</p>
        <div className="tr-from">À partir de <b>CHF {min}</b></div>
      </div>
      <div className="tr-formules">
        {d.formules.map((f, i) => (
          <a key={i} href={CONTACT + "&bon=" + bonKey(g.key, f.name)} className={"tr-card gift-card" + (f.feature ? " feature" : "")}
             data-umami-event="bon-cadeau-choix" data-umami-event-bon={bonKey(g.key, f.name)}>
            <div className="tr-tag">{f.tag}</div>
            <h4>{f.name}</h4>
            <div className="tr-price">{f.price}</div>
            <span className="gift-offer">Offrir <span className="ar">→</span></span>
          </a>
        ))}
      </div>
    </div>
  );
}

function CadeauApp() {
  const [t, setTweak] = useTweaks({ palette: KC.PALETTES["Noir chaud"], heading: "Cinzel", body: "Jost" });
  useApplyTweaks(t);
  useReveal([]);

  return (
    <>
      <div className="grain"></div>
      <Nav active="cadeau" />
      <main>
        <section className="pf-head s-dark">
          <div className="wrap">
            <h1 className="h1-stack"><span className="overline reveal"><span className="tick"></span>Bon cadeau photo · Suisse romande</span> <span className="display h1-big reveal d1">Offrez une séance photo.</span></h1>
            <p className="tarif-intro reveal d2">
              Une séance lifestyle, grossesse ou studio, ou un montant à valoir sur la séance de son choix.
              Le bon arrive par e-mail, à son nom, prêt à imprimer ou à transmettre. Il reste valable 12&nbsp;mois.
            </p>
            <a href={CONTACT} className="link-arrow reveal d2 gift-head-cta" data-umami-event="bon-cadeau-commander">Commander un bon cadeau <span className="ar">→</span></a>
          </div>
        </section>

        <section className="sec s-light pad-y">
          <div className="wrap">
            <div style={{ textAlign: "center", marginBottom: "clamp(40px,5vw,68px)" }}>
              <Overline className="reveal" style={{ justifyContent: "center" }}>Deux façons d'offrir</Overline>
              <h2 className="display reveal d1" style={{ fontSize: "clamp(30px,4vw,56px)", marginTop: "20px" }}>Une séance, ou un montant.</h2>
            </div>
            <div className="formules two">
              <div className="formule reveal d1">
                <div className="tag">Une séance précise</div>
                <h3>Une séance</h3>
                <div className="price"><small>dès</small> CHF 180</div>
                <ul>
                  <li>Lifestyle, seul, à deux ou en famille : CHF 180 ou 280</li>
                  <li>Grossesse & maternité : CHF 180, 280 ou 480</li>
                  <li>Studio : CHF 220 ou 420</li>
                  <li>La date et le lieu se choisissent ensemble</li>
                </ul>
                <a href="#seances" className="pick">Choisir la séance <span className="ar">→</span></a>
              </div>
              <div className="formule reveal d2">
                <div className="tag">Au choix de la personne</div>
                <h3>Un montant</h3>
                <div className="price"><small>dès</small> CHF {MIN_MONTANT}</div>
                <ul>
                  <li>À valoir sur toute séance lifestyle, grossesse ou studio</li>
                  <li>La personne choisit sa séance, sa date et son lieu</li>
                  <li>Si la séance coûte plus, elle règle simplement la différence</li>
                </ul>
                <a href={CONTACT + "&bon=montant"} className="pick" data-umami-event="bon-cadeau-choix" data-umami-event-bon="montant">Offrir un montant <span className="ar">→</span></a>
              </div>
            </div>
          </div>
        </section>

        <section className="sec s-light pad-y gift-seances" id="seances">
          <div className="wrap">
            <div style={{ textAlign: "center", marginBottom: "clamp(34px,4vw,56px)" }}>
              <Overline className="reveal" style={{ justifyContent: "center" }}>Les séances à offrir</Overline>
              <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,48px)", marginTop: "18px" }}>Choisissez, je m'occupe du reste.</h2>
            </div>
            {GIFT.map((g) => <GiftRow key={g.slug} g={g} />)}
          </div>
        </section>

        <section className="sec s-dark pad-y">
          <div className="wrap">
            <div style={{ textAlign: "center", marginBottom: "clamp(40px,5vw,68px)" }}>
              <Overline className="reveal" style={{ justifyContent: "center" }}>Comment ça se passe</Overline>
              <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,48px)", marginTop: "20px" }}>De votre demande à sa séance.</h2>
            </div>
            <div className="steps">
              {[
                ["01", "Votre demande", "Choisissez la séance ou le montant, et dites-moi pour qui. Le formulaire prend deux minutes."],
                ["02", "La facture", "Je vous envoie une facture QR sous 48 h, à régler depuis votre e-banking."],
                ["03", "Le bon, par e-mail", "Dès le paiement reçu, le bon vous parvient en PDF, à son nom : à imprimer, à glisser dans une carte ou à transmettre."],
                ["04", "La séance", "La personne me contacte avec le code du bon. Nous fixons ensemble la date et le lieu, dans les 12 mois."],
              ].map(([n, title, txt], i) => (
                <div key={n} className={"step reveal d" + (i + 1)}>
                  <div className="sn">{n}</div>
                  <h3>{title}</h3>
                  <p>{txt}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec s-light pad-y">
          <div className="wrap gift-band reveal">
            <div className="gb-text">
              <Overline>Le bon</Overline>
              <h2 className="display" style={{ fontSize: "clamp(26px,3.2vw,44px)", margin: "16px 0 14px" }}>Un bon à son nom.</h2>
              <p>Il porte le prénom de la personne, la séance ou le montant offert, un mot de votre part si vous le souhaitez, son code et sa date de validité. Vous le recevez en PDF, prêt à imprimer ou à envoyer.</p>
              <a href={CONTACT} className="link-arrow" style={{ marginTop: "10px" }} data-umami-event="bon-cadeau-commander">Commander un bon cadeau <span className="ar">→</span></a>
            </div>
            <div className="gb-img"><Slot id="cadeau-img" ph="Bon cadeau — séance photo" alt="Séance photo de grossesse dans un champ de blé au soleil couchant, à offrir en bon cadeau — Kevin Chinelli, photographe en Suisse romande" style={{ width: "100%", height: "100%" }} /></div>
          </div>
        </section>

        <section className="sec s-light pad-y">
          <div className="wrap-narrow">
            <div style={{ textAlign: "center", marginBottom: "clamp(34px,4vw,56px)" }}>
              <Overline className="reveal" style={{ justifyContent: "center" }}>Questions fréquentes</Overline>
              <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.4vw,46px)", marginTop: "20px" }}>Bon à savoir.</h2>
            </div>
            <div className="faq reveal d1">
              {CADEAU_FAQ.map((f, i) => (
                <details key={i} open={i === 0}>
                  <summary>{f.q}<span className="pm"></span></summary>
                  <div className="ans">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <CtaContact overline="Bon cadeau" title="Faites plaisir." href={CONTACT} label="Commander un bon cadeau" />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<CadeauApp />);
