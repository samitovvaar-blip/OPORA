// Админка: клиенты с доступом к кабинету — почты, доступ, тариф и ближайшая оплата
import { arrayUnion, collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { bdayText, seenText } from "./AccessCard";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { useClientProjects } from "../lib/clients";
import { rub } from "../lib/money";
import { nextPayday } from "../lib/pay";

export default function ClientsAccessCard() {
  const { wsId } = useWorkspace();
  const { list } = useClientProjects();
  const [pres, setPres] = useState<Record<string, { lastSeen?: any }>>({});
  useEffect(() => wsId ? onSnapshot(collection(db, "workspaces", wsId, "presence"), (s) => setPres(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as any]))), () => {}) : undefined, [wsId]);
  const withAccess = list;   // все клиенты: у кого нет почты — можно выдать доступ прямо здесь
  const today = new Date(new Date().toDateString());
  const rows = withAccess.map((p) => {
    const nd = p.tariff?.payDay ? nextPayday([p.tariff.payDay]) : null;
    return { p, nd, days: nd ? Math.round((+nd - +today) / 86400000) : null };
  }).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>💼 Клиенты</h3>
      {!rows.length && <div className="muted small">Пока ни у одного клиента нет доступа. Проекты → клиент → ⚙ → «Кабинет клиента» → почта клиента.</div>}
      {rows.map(({ p, nd, days }) => (
        <div key={p.id} className="adm-client">
          <div className="row" style={{ padding: 0 }}>
            <b>{p.name}</b>
            <button className={p.clientOpen ? "" : "ghost"} onClick={() => updateDoc(doc(db, "workspaces", wsId!, "clients", p.id), { clientOpen: !p.clientOpen })}>
              {p.clientOpen ? "🔓 Доступ открыт" : "🔒 Доступ закрыт"}</button>
          </div>
          <form className="inline" style={{ margin: "4px 0" }} onSubmit={async (e) => { e.preventDefault(); const inp = e.currentTarget.elements.namedItem("em") as HTMLInputElement;
              const v = inp.value.trim().toLowerCase(); if (!v.includes("@")) return;
              await updateDoc(doc(db, "workspaces", wsId!, "clients", p.id), { clientEmails: arrayUnion(v) }); await setDoc(doc(db, "clientIndex", v), { ws: wsId, cid: p.id }); inp.value = ""; }}>
            <input name="em" type="email" placeholder="+ почта клиента для кабинета" style={{ flex: 1, minWidth: 180, padding: "4px 8px" }} /><button style={{ padding: "4px 10px" }}>Дать доступ</button></form>
          <div className="small muted">{(p.clientEmails || []).join(", ") || "почта не указана"} · {(() => { const ls = (p.clientEmails || []).map((e) => pres[e]?.lastSeen?.toDate?.() as Date | undefined).filter(Boolean) as Date[];
            const last = ls.length ? new Date(Math.max(...ls.map((x) => +x))) : undefined; const st = seenText(last); return <span className={st.online ? "ok" : ""}>{st.text.replace("заходил(а)", "заходил")}</span>; })()}</div>
          <div className="adm-pay">
            <span>💳 {p.tariff ? <>{p.tariff.name} · <b>{rub(p.tariff.price)}</b></> : <span className="muted">тариф не выбран</span>}</span>
            <span className={days != null && days <= 3 ? "pill pill-wait" : "pill pill-info"}>
              {nd ? <>оплата {nd.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}{days === 0 ? " · сегодня" : ` · через ${days} дн.`}</> : "день оплаты не указан"}</span>
          </div>
          <div className="small" style={{ marginTop: 4 }}>🎂 <input type="date" defaultValue={p.birthday || ""} key={"b" + (p.birthday || "")}
              onBlur={(e) => e.target.value !== (p.birthday || "") && updateDoc(doc(db, "workspaces", wsId!, "clients", p.id), { birthday: e.target.value })} />
            {bdayText(p.birthday) && <span className="muted"> {bdayText(p.birthday)}</span>}</div>
          <div className="small" style={{ marginTop: 4 }}>
            <Link to={"/client?p=" + p.id}>👁 Кабинет</Link> · <Link to={"/projects?p=" + p.id}>⚙ Настройки</Link></div>
        </div>
      ))}
    </div>
  );
}
