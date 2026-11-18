/* ============================================================
   KEVIN CHINELLI — Contact / tunnel de devis guidé (contact.html)
   Multi-step: prestation → formule → date & lieu → coordonnées → récap.
   Builds a structured mailto. Reads ?type= and ?date= to pre-seed.
   ============================================================ */
const { useState } = React;
const PRESTA_OPTS = window.PRESTA_NAV;
const Q = new URLSearchParams(window.location.search);

const TYPES = [
  { key: "Mariage", href: "mariages.html" },
  { key: "Portrait", href: "portraits.html" },
  { key: "Studio", href: "studio.html" },
  { key: "Maternité & Grossesse", href: "maternite-grossesse.html" },
  { key: "Bon cadeau", href: "" },
  { key: "Autre", href: "" },
];

const FORMULES = {
  "Mariage": [
    { name: "Essentiel — 6 h", price: "CHF 1'290" },
    { name: "Signature — 10 h", price: "CHF 2'690" },
    { name: "Prestige — 2 jours", price: "dès CHF 4'500" },
    { name: "Je ne sais pas encore", price: "" },
  ],
  "Portrait": [
    { name: "Signature — 45 min", price: "CHF 320" },
    { name: "Lumière — 1 h 30", price: "CHF 520" },
    { name: "Présence — 2 h (pro)", price: "CHF 850" },
    { name: "Je ne sais pas encore", price: "" },
  ],
  "Studio": [
    { name: "Portrait — 30 min", price: "CHF 220" },
    { name: "Éditorial — 1 h", price: "CHF 420" },
    { name: "Corporate — équipe", price: "dès CHF 1'400" },
    { name: "Je ne sais pas encore", price: "" },
  ],
  "Maternité & Grossesse": [
    { name: "Lumière — 1 h studio", price: "CHF 380" },
    { name: "Cocon — 1 h 30", price: "CHF 590" },
    { name: "Continuité — grossesse + nouveau-né", price: "CHF 980" },
    { name: "Je ne sais pas encore", price: "" },
  ],
  "Couple": [
    { name: "Escapade — 45 min", price: "CHF 320" },
    { name: "Complices — 1 h 30", price: "CHF 520" },
    { name: "Promesse — fiançailles 2 h", price: "CHF 850" },
    { name: "Je ne sais pas encore", price: "" },
  ],
  "Famille": [
    { name: "Tribu — 1 h", price: "CHF 390" },
    { name: "Complices — 1 h 30", price: "CHF 590" },
    { name: "Tribu élargie — 2 h", price: "CHF 890" },
    { name: "Je ne sais pas encore", price: "" },
  ],
};

const REGIONS = ["Vaud / Lausanne", "Genève", "Fribourg", "Neuchâtel", "Valais", "Riviera / Montreux", "Autre / à définir"];

function normType(v) {
  if (!v) return "";
  const hit = TYPES.find((t) => t.key.toLowerCase() === v.toLowerCase() || t.key.toLowerCase().startsWith(v.toLowerCase()));
  return hit ? hit.key : v;
}

function ContactApp() {
  const [t, setTweak] = useTweaks({ palette: KC.PALETTES["Noir chaud"], heading: "Cinzel", body: "Jost" });
  useApplyTweaks(t);

  const [step, setStep] = useState(0);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [err, setErr] = useState({});
  const [a, setA] = useState({
    type: normType(Q.get("type") || ""),
    formule: "",
    date: Q.get("date") || "",
    region: "",
    nom: "", email: "", tel: "", message: "", website: "",
  });
  useReveal([step, sent]);

  const set = (k, v) => setA((s) => ({ ...s, [k]: v }));
  const hasFormules = !!FORMULES[a.type];
  const STEPS = ["Prestation", hasFormules ? "Formule" : null, "Date & lieu", "Coordonnées", "Récapitulatif"].filter(Boolean);

  const validateStep = (i) => {
    const e = {};
    const label = STEPS[i];
    if (label === "Prestation" && !a.type) e.type = "Choisissez une prestation.";
    if (label === "Coordonnées") {
      if (!a.nom.trim()) e.nom = "Indiquez votre nom.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)) e.email = "Adresse email invalide.";
    }
    setErr(e);
    return Object.keys(e).length === 0;
  };
  const next = () => { if (validateStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    setSending(true);
    setSendError("");
    try {
      const res = await fetch("contact.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j && j.ok) {
        setSent(true);
      } else if (res.status === 429) {
        setSendError("Trop d'envois en peu de temps. Patientez quelques minutes, puis réessayez.");
      } else {
        setSendError("Une erreur est survenue à l'envoi. Réessayez, ou écrivez-moi directement à contact@afterglowbykevin.ch.");
      }
    } catch (e) {
      setSendError("Connexion impossible. Vérifiez votre réseau, ou écrivez-moi à contact@afterglowbykevin.ch.");
    } finally {
      setSending(false);
    }
  };

  const label = STEPS[step];
  const estimate = hasFormules && a.formule ? (FORMULES[a.type].find((f) => f.name === a.formule) || {}).price : "";

  return (
    <>
      <div className="grain"></div>
      <Nav active="contact" />
      <main>
        <section className="sec s-dark contact-page" style={{ paddingTop: "clamp(140px,15vw,210px)", paddingBottom: "clamp(80px,11vw,150px)" }}>
          <div className="wrap-narrow">
            <div style={{ marginBottom: "clamp(34px,5vw,56px)", textAlign: "center" }}>
              <Overline className="reveal" style={{ justifyContent: "center" }}>Parlons de votre projet</Overline>
              <h1 className="display reveal d1" style={{ fontSize: "clamp(36px,5.4vw,72px)", marginTop: "18px" }}>Demandez votre devis.</h1>
            </div>

            {sent ? (
              <div className="form-sent reveal" style={{ margin: "0 auto", maxWidth: "560px" }}>
                <div className="fs-mark">✓</div>
                <h3>Merci, votre demande est bien partie.</h3>
                <p>Je l'ai bien reçue et je vous réponds personnellement sous 48&nbsp;h ouvrées. À très vite&nbsp;!</p>
                <a href="mailto:contact@afterglowbykevin.ch" className="link-arrow">contact@afterglowbykevin.ch <span className="ar">→</span></a>
              </div>
            ) : (
            <div className="funnel reveal">
              {/* progress */}
              <div className="fn-steps" role="list">
                {STEPS.map((s, i) => (
                  <div key={s} className={"fn-step" + (i === step ? " current" : "") + (i < step ? " done" : "")} role="listitem">
                    <span className="fn-num">{i < step ? "✓" : i + 1}</span><span className="fn-lbl">{s}</span>
                  </div>
                ))}
              </div>

              <div className="fn-panel">
                {label === "Prestation" && (
                  <div className="fn-body">
                    <h2 className="fn-q">Quel type de séance vous intéresse&nbsp;?</h2>
                    <div className="fn-grid">
                      {TYPES.map((ty) => (
                        <button key={ty.key} type="button" className={"fn-opt" + (a.type === ty.key ? " sel" : "")}
                          onClick={() => { set("type", ty.key); set("formule", ""); }}>{ty.key}</button>
                      ))}
                    </div>
                    {err.type && <span className="field-err">{err.type}</span>}
                  </div>
                )}

                {label === "Formule" && (
                  <div className="fn-body">
                    <h2 className="fn-q">Une formule en tête&nbsp;? <span className="fn-q-sub">(indicatif — ajustable sur devis)</span></h2>
                    <div className="fn-list">
                      {FORMULES[a.type].map((f) => (
                        <button key={f.name} type="button" className={"fn-row" + (a.formule === f.name ? " sel" : "")}
                          onClick={() => set("formule", f.name)}>
                          <span>{f.name}</span>{f.price && <span className="fn-price">{f.price}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {label === "Date & lieu" && (
                  <div className="fn-body">
                    <h2 className="fn-q">Quand et où&nbsp;?</h2>
                    <div className="field"><label>Date envisagée</label>
                      <input className="control" type="date" value={a.date} onChange={(e) => set("date", e.target.value)} /></div>
                    <div className="field"><label>Lieu / région</label>
                      <select className="control" value={a.region} onChange={(e) => set("region", e.target.value)}>
                        <option value="">Sélectionner</option>
                        {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select></div>
                  </div>
                )}

                {label === "Coordonnées" && (
                  <div className="fn-body">
                    <h2 className="fn-q">Comment vous joindre&nbsp;?</h2>
                    <div className="field-row">
                      <div className={"field" + (err.nom ? " error" : "")}><label>Nom</label>
                        <input className="control" type="text" value={a.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Votre nom" />
                        {err.nom && <span className="field-err">{err.nom}</span>}</div>
                      <div className={"field" + (err.email ? " error" : "")}><label>Email</label>
                        <input className="control" type="email" value={a.email} onChange={(e) => set("email", e.target.value)} placeholder="vous@email.com" />
                        {err.email && <span className="field-err">{err.email}</span>}</div>
                    </div>
                    <div className="field"><label>Téléphone <span className="opt">(facultatif)</span></label>
                      <input className="control" type="tel" value={a.tel} onChange={(e) => set("tel", e.target.value)} placeholder="+41 …" /></div>
                    <div className="field"><label>Votre message <span className="opt">(facultatif)</span></label>
                      <textarea className="control" rows="4" value={a.message} onChange={(e) => set("message", e.target.value)} placeholder="Le lieu, l'ambiance souhaitée, vos questions…"></textarea></div>
                    <input type="text" name="website" tabIndex="-1" autoComplete="off" aria-hidden="true" value={a.website} onChange={(e) => set("website", e.target.value)} style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0 }} />
                  </div>
                )}

                {label === "Récapitulatif" && (
                  <div className="fn-body">
                    <h2 className="fn-q">On y est. Un dernier coup d'œil&nbsp;:</h2>
                    <dl className="fn-recap">
                      <div><dt>Prestation</dt><dd>{a.type || "—"}</dd></div>
                      {hasFormules && <div><dt>Formule</dt><dd>{a.formule || "—"}{estimate ? " · " + estimate : ""}</dd></div>}
                      <div><dt>Date</dt><dd>{a.date || "à définir"}</dd></div>
                      <div><dt>Lieu</dt><dd>{a.region || "à définir"}</dd></div>
                      <div><dt>Nom</dt><dd>{a.nom || "—"}</dd></div>
                      <div><dt>Email</dt><dd>{a.email || "—"}</dd></div>
                      {a.tel && <div><dt>Téléphone</dt><dd>{a.tel}</dd></div>}
                    </dl>
                    <p className="fn-note">En envoyant, votre demande m'est transmise directement. Je vous réponds personnellement sous 48&nbsp;h.</p>
                  </div>
                )}

                {sendError && (
                  <p className="field-err" style={{ textAlign: "center", marginBottom: "12px" }}>{sendError}</p>
                )}
                <div className="fn-actions">
                  {step > 0 ? <button type="button" className="fn-back" onClick={back}>← Retour</button> : <span></span>}
                  {label === "Récapitulatif"
                    ? <button type="button" className="dc-btn fn-send" onClick={submit} disabled={sending}>{sending ? "Envoi…" : "Envoyer ma demande"} <span className="ar">→</span></button>
                    : <button type="button" className="dc-btn" onClick={next}>Continuer <span className="ar">→</span></button>}
                </div>
              </div>
            </div>
            )}

            <div className="fn-aside reveal d1">
              <a href="mailto:contact@afterglowbykevin.ch">contact@afterglowbykevin.ch</a>
              <span className="jl-dot">·</span>
              <a href="tel:+41798507603">+41 79 850 76 03</a>
              <span className="jl-dot">·</span>
              <a href="https://www.instagram.com/afterglowbykevin/" target="_blank" rel="noopener">@afterglowbykevin</a>
              <span className="jl-dot">·</span>
              <span>Réponse sous 48 h</span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ContactApp />);
