/* ============================================================
   KEVIN CHINELLI — Politique de confidentialité (confidentialite.html)
   Conforme nLPD (Suisse, en vigueur depuis sept. 2023).
   ============================================================ */
const LEGAL_UPDATED = "juin 2026";

const LEGAL_SECTIONS = [
  {
    t: "1. Responsable du traitement",
    p: [
      "Le présent site afterglowbykevin.ch (« Afterglow by Kevin ») est édité et exploité par Kevin Chinelli, photographe indépendant.",
      "Adresse : Ch. de l'Ancien-Tram 18, 1083 Mézières (Vaud), Suisse.",
      "Contact : contact@afterglowbykevin.ch · +41 79 850 76 03.",
    ],
  },
  {
    t: "2. Données collectées",
    p: [
      "Le site ne collecte des données personnelles que lorsque vous les transmettez volontairement via le formulaire de contact : nom, adresse e-mail, numéro de téléphone (facultatif), type de prestation souhaitée et contenu de votre message.",
      "Aucune création de compte n'est requise. Le site n'utilise ni cookies publicitaires, ni outils de suivi (analytics, pixels, reciblage).",
    ],
  },
  {
    t: "3. Finalités et base légale",
    p: [
      "Vos données sont utilisées uniquement pour répondre à votre demande, établir un devis et assurer le suivi de notre éventuelle collaboration.",
      "La base légale est votre consentement et l'exécution de mesures précontractuelles prises à votre demande (art. 6 nLPD).",
    ],
  },
  {
    t: "4. Durée de conservation",
    p: [
      "Les demandes reçues via le formulaire sont conservées le temps nécessaire au traitement de votre requête, puis archivées au maximum 24 mois, sauf relation contractuelle en cours ou obligation légale (par ex. comptable) imposant une durée plus longue.",
    ],
  },
  {
    t: "5. Destinataires et sous-traitants",
    p: [
      "Vos données ne sont ni vendues, ni louées, ni transmises à des tiers à des fins commerciales.",
      "Elles transitent uniquement par les prestataires techniques nécessaires au fonctionnement du site : l'hébergeur du serveur et le service de messagerie Infomaniak (Suisse) qui achemine les e-mails du formulaire. Les polices d'écriture sont chargées depuis Google Fonts, ce qui transmet votre adresse IP aux serveurs de Google lors de l'affichage des pages.",
    ],
  },
  {
    t: "6. Vos droits",
    p: [
      "Conformément à la nLPD, vous disposez d'un droit d'accès, de rectification, de suppression et d'opposition concernant vos données personnelles.",
      "Pour exercer ces droits, écrivez à contact@afterglowbykevin.ch. Une réponse vous sera apportée dans les meilleurs délais.",
    ],
  },
  {
    t: "7. Sécurité",
    p: [
      "Le site est servi exclusivement en HTTPS (connexion chiffrée). Les demandes envoyées via le formulaire sont stockées hors de la racine web et l'accès au serveur est restreint. Malgré le soin apporté, aucune transmission sur Internet ne peut être garantie comme totalement sûre.",
    ],
  },
  {
    t: "8. Modifications",
    p: [
      "Cette politique peut être mise à jour à tout moment pour refléter l'évolution du site ou de la législation. La date de dernière mise à jour figure ci-dessous.",
    ],
  },
];

function LegalApp() {
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
      <Nav active="" />
      <main>
        <section className="sec s-dark legal-head">
          <div className="wrap-narrow">
            <Overline className="reveal">Informations légales</Overline>
            <h1 className="display reveal d1" style={{ fontSize: "clamp(32px,4.2vw,58px)", marginTop: "18px" }}>
              Politique de confidentialité
            </h1>
            <p className="reveal d1" style={{ color: "var(--muted)", maxWidth: "60ch", marginTop: "18px", lineHeight: 1.7 }}>
              Votre vie privée compte. Voici, en toute transparence, quelles données sont collectées sur ce site et comment elles sont traitées.
            </p>
          </div>
        </section>

        <section className="sec s-light pad-y">
          <div className="wrap-narrow legal-body">
            {LEGAL_SECTIONS.map((s, i) => (
              <div key={i} className="legal-block reveal">
                <h2>{s.t}</h2>
                {s.p.map((para, j) => <p key={j}>{para}</p>)}
              </div>
            ))}
            <p className="legal-updated reveal">Dernière mise à jour : {LEGAL_UPDATED}</p>
          </div>
        </section>

        <CtaContact overline="Une question ?" title="Parlons de votre projet." />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<LegalApp />);
