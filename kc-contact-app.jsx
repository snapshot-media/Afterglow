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
  { key: "Lifestyle", href: "portraits.html" },
  { key: "Studio", href: "studio.html" },
  { key: "Maternité & Grossesse", href: "maternite-grossesse.html" },
  { key: "Bon cadeau", href: "" },
  { key: "Autre", href: "" },
];

const FORMULES = {
  "Mariage": [
    { name: "Essentiel — 4 h", price: "CHF 1'290" },
    { name: "Signature — 10 h", price: "CHF 2'490" },
    { name: "Prestige — 2 jours", price: "dès CHF 4'500" },
    { name: "Je ne sais pas encore", price: "" },
  ],
  // Lifestyle : une seule grille, seul, à deux ou en famille
  "Lifestyle": [
    { name: "Essentiel — 30 min", price: "CHF 180" },
    { name: "Signature — 1 h", price: "CHF 280" },
    { name: "Je ne sais pas encore", price: "" },
  ],
  "Studio": [
    { name: "Portrait — 30 min", price: "CHF 220" },
    { name: "Éditorial — 1 h", price: "CHF 420" },
    { name: "Je ne sais pas encore", price: "" },
  ],
  "Maternité & Grossesse": [
    { name: "Lumière — 30 min", price: "CHF 180" },
    { name: "Cocon — 1 h", price: "CHF 280" },
    { name: "Continuité — grossesse + nouveau-né", price: "CHF 480" },
    { name: "Je ne sais pas encore", price: "" },
  ],
};

const REGIONS = ["Vaud / Lausanne", "Genève", "Fribourg", "Neuchâtel", "Valais", "Riviera / Montreux", "Autre / à définir"];

/* Bon cadeau (conditions du 19.11.2026) : une séance précise ou un montant libre dès CHF 100.
   Les clés (« lifestyle-signature », « montant ») sont celles des liens de bon-cadeau.html (kc-cadeau-app.jsx).
   contact.php ne connaît que ses champs habituels : le choix part dans « formule », le prénom et le mot dans « message ». */
const GIFT_TYPES = [
  { type: "Lifestyle", key: "lifestyle", label: "Lifestyle" },
  { type: "Maternité & Grossesse", key: "maternite", label: "Grossesse" },
  { type: "Studio", key: "studio", label: "Studio" },
];
const bonKey = (prefix, name) => prefix + "-" + name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/)[0];
const GIFT_OPTS = GIFT_TYPES.flatMap((g) => FORMULES[g.type]
  .filter((f) => f.price)
  .map((f) => ({ key: bonKey(g.key, f.name), label: g.label + " · " + f.name, price: f.price })));
const MIN_MONTANT = 100;
function giftLabel(a) {
  if (a.bon === "montant") return a.montant ? "Montant libre · CHF " + a.montant : "Montant libre";
  const o = GIFT_OPTS.find((x) => x.key === a.bon);
  return o ? o.label + " · " + o.price : "";
}

function normType(v) {
  if (!v) return "";
  // les séances solo, couple et famille sont des séances Lifestyle
  if (/^(solo|couple|famille|portrait)/i.test(v)) return "Lifestyle";
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
    // bon cadeau
    bon: (() => { const b = Q.get("bon") || ""; return b === "montant" || GIFT_OPTS.some((o) => o.key === b) ? b : ""; })(),
    montant: "", pour: "", mot: "",
  });
  useReveal([step, sent]);

  const set = (k, v) => setA((s) => ({ ...s, [k]: v }));
  const isGift = a.type === "Bon cadeau";
  const hasFormules = !!FORMULES[a.type];
  const STEPS = isGift
    ? ["Prestation", "Le bon", "Coordonnées", "Récapitulatif"]
    : ["Prestation", hasFormules ? "Formule" : null, "Date & lieu", "Coordonnées", "Récapitulatif"].filter(Boolean);

  const validateStep = (i) => {
    const e = {};
    const label = STEPS[i];
    if (label === "Prestation" && !a.type) e.type = "Choisissez une prestation.";
    if (label === "Le bon") {
      if (!a.bon) e.bon = "Choisissez une séance ou un montant.";
      else if (a.bon === "montant" && !(parseInt(a.montant, 10) >= MIN_MONTANT)) e.montant = "Le montant commence à CHF " + MIN_MONTANT + ".";
    }
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
      // Bon cadeau : le choix dans « formule », le prénom et le mot en tête du message (champs connus de contact.php)
      const payload = isGift
        ? { ...a, formule: giftLabel(a), date: "", region: "",
            message: ["Pour : " + (a.pour.trim() || "(non précisé)"),
                      "Mot sur le bon : " + (a.mot.trim() || "(aucun)"),
                      a.message.trim() ? "\n" + a.message.trim() : ""].join("\n").trim() }
        : a;
      const res = await fetch("contact.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j && j.ok) {
        setSent(true);
        // mesure d'audience (Umami, sans cookies) : une demande envoyée, avec la prestation choisie
        if (window.umami) window.umami.track("demande-envoyee", { type: a.type || "non précisé", formule: payload.formule || "", page: "contact" });
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
                {isGift
                  ? <p>Je vous envoie la facture sous 48&nbsp;h ouvrées. Le bon vous parvient par e-mail dès le paiement reçu.</p>
                  : <p>Je l'ai bien reçue et je vous réponds personnellement sous 48&nbsp;h ouvrées. À très vite&nbsp;!</p>}
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

                {label === "Le bon" && (
                  <div className="fn-body">
                    <h2 className="fn-q">Que souhaitez-vous offrir&nbsp;?</h2>
                    <div className="fn-list">
                      {GIFT_OPTS.map((o) => (
                        <button key={o.key} type="button" className={"fn-row" + (a.bon === o.key ? " sel" : "")}
                          onClick={() => set("bon", o.key)}>
                          <span>{o.label}</span><span className="fn-price">{o.price}</span>
                        </button>
                      ))}
                      <button type="button" className={"fn-row" + (a.bon === "montant" ? " sel" : "")}
                        onClick={() => set("bon", "montant")}>
                        <span>Un montant, à valoir sur la séance de son choix</span><span className="fn-price">dès CHF {MIN_MONTANT}</span>
                      </button>
                    </div>
                    {err.bon && <span className="field-err">{err.bon}</span>}
                    {a.bon === "montant" && (
                      <div className={"field" + (err.montant ? " error" : "")} style={{ marginTop: "18px" }}>
                        <label htmlFor="gift-montant">Montant (CHF)</label>
                        <input id="gift-montant" className="control" type="number" inputMode="numeric" min={MIN_MONTANT} step="10"
                          value={a.montant} onChange={(e) => set("montant", e.target.value)} placeholder={String(MIN_MONTANT)} />
                        {err.montant && <span className="field-err">{err.montant}</span>}
                      </div>
                    )}
                    <div className="field" style={{ marginTop: "18px" }}>
                      <label htmlFor="gift-pour">Pour qui&nbsp;? <span className="opt">(prénom inscrit sur le bon, facultatif)</span></label>
                      <input id="gift-pour" className="control" type="text" value={a.pour} onChange={(e) => set("pour", e.target.value)} placeholder="Prénom" />
                    </div>
                    <div className="field">
                      <label htmlFor="gift-mot">Un mot sur le bon <span className="opt">(facultatif)</span></label>
                      <input id="gift-mot" className="control" type="text" maxLength="140" value={a.mot} onChange={(e) => set("mot", e.target.value)} placeholder="Joyeux Noël, avec tout mon amour…" />
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
                      <textarea className="control" rows="4" value={a.message} onChange={(e) => set("message", e.target.value)} placeholder={isGift ? "Une précision pour le bon, une question…" : "Le lieu, l'ambiance souhaitée, vos questions…"}></textarea></div>
                    <input type="text" name="website" tabIndex="-1" autoComplete="off" aria-hidden="true" value={a.website} onChange={(e) => set("website", e.target.value)} style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0 }} />
                  </div>
                )}

                {label === "Récapitulatif" && (
                  <div className="fn-body">
                    <h2 className="fn-q">On y est. Un dernier coup d'œil&nbsp;:</h2>
                    <dl className="fn-recap">
                      <div><dt>Prestation</dt><dd>{a.type || "—"}</dd></div>
                      {hasFormules && <div><dt>Formule</dt><dd>{a.formule || "—"}{estimate ? " · " + estimate : ""}</dd></div>}
                      {isGift ? <>
                        <div><dt>Le bon</dt><dd>{giftLabel(a) || "—"}</dd></div>
                        <div><dt>Pour</dt><dd>{a.pour.trim() || "—"}</dd></div>
                        {a.mot.trim() && <div><dt>Mot</dt><dd>{a.mot.trim()}</dd></div>}
                      </> : <>
                        <div><dt>Date</dt><dd>{a.date || "à définir"}</dd></div>
                        <div><dt>Lieu</dt><dd>{a.region || "à définir"}</dd></div>
                      </>}
                      <div><dt>Nom</dt><dd>{a.nom || "—"}</dd></div>
                      <div><dt>Email</dt><dd>{a.email || "—"}</dd></div>
                      {a.tel && <div><dt>Téléphone</dt><dd>{a.tel}</dd></div>}
                    </dl>
                    <p className="fn-note">{isGift
                      ? <>En envoyant, votre demande m'est transmise directement. Je vous envoie la facture sous 48&nbsp;h&nbsp;; le bon, valable 12&nbsp;mois, vous parvient par e-mail dès le paiement reçu.</>
                      : <>En envoyant, votre demande m'est transmise directement. Je vous réponds personnellement sous 48&nbsp;h.</>}</p>
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
              <a href="mailto:contact@afterglowbykevin.ch" data-umami-event="email">contact@afterglowbykevin.ch</a>
              <span className="jl-dot">·</span>
              <a href="tel:+41798507603" data-umami-event="telephone">+41 79 850 76 03</a>
              <span className="jl-dot">·</span>
              <a href={KC.WHATSAPP} target="_blank" rel="noopener" data-umami-event="whatsapp">WhatsApp</a>
              <span className="jl-dot">·</span>
              <a href="https://www.instagram.com/afterglowbykevin/" target="_blank" rel="noopener" data-umami-event="instagram">@afterglowbykevin</a>
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
