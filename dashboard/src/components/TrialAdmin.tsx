import { FormEvent, useEffect, useState } from "react";
import { collection, deleteDoc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { trialRef, TRIAL_DURATION, type TrialInvite } from "../lib/trial";

export default function TrialAdmin({ ws }: { ws: string }) {
  const [invites, setInvites] = useState<(TrialInvite & { email: string })[]>([]);
  const [email, setEmail] = useState("");
  const [offers, setOffers] = useState("");
  const [error, setError] = useState("");
  const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(query(collection(db, "demoInvites"), where("owner", "==", ws)), (snap) => {
    setInvites(snap.docs.flatMap((doc) => {
      const value = doc.data() as TrialInvite;
      return value.issuedAt ? [{ ...value, email: doc.id }] : [];
    }));
    setReadError(false);
  }, () => setReadError(true)), [ws]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    const lines = offers.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!address || address.includes("/") || !lines.length || lines.length > 3 || lines.some((line) => line.length > 180)) {
      setError("Укажи почту и от одного до трёх тарифов, каждый до 180 символов.");
      return;
    }
    setBusy(true); setError("");
    try {
      await setDoc(trialRef(address), { owner: ws, issuedAt: serverTimestamp(), offers: lines });
      setEmail("");
    } catch {
      setError("Не удалось выдать приглашение. Проверь правила Firestore и доступ к этой почте.");
    } finally { setBusy(false); }
  }

  return <section className="card trial-admin">
    <h2>Пробный доступ на 3 дня</h2>
    <p>Приглашение открывает «Товары» и «Услуги». Повторная выдача продлевает доступ на три дня.</p>
    {readError && <p role="alert">Не удалось загрузить приглашения. Проверь правила Firestore.</p>}
    <form className="neila-feedback-form" onSubmit={submit}>
      <label>Почта <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>До трёх тарифов, по одному на строку
        <textarea rows={3} required value={offers} onChange={(event) => setOffers(event.target.value)} placeholder="Название тарифа · цена" />
      </label>
      <button disabled={busy}>Выдать демо-доступ</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {invites.map((invite) => <div className="row trial-invite" key={invite.email}>
      <span><b>{invite.email}</b><br /><small>До {new Date(invite.issuedAt.toMillis() + TRIAL_DURATION)
        .toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} мск</small></span>
      <span className="inline">
        <button className="ghost" onClick={() => { setEmail(invite.email); setOffers(invite.offers.join("\n")); }}>Заполнить для продления</button>
        <button className="ghost" onClick={() => deleteDoc(trialRef(invite.email)).catch(() => setError("Не удалось отозвать приглашение."))}>Отозвать</button>
      </span>
    </div>)}
  </section>;
}
