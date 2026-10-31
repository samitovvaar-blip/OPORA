// Админка: клиенты с доступом к кабинету — почты, доступ, тариф и ближайшая оплата
import { doc, updateDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { useClientProjects } from "../lib/clients";
import { rub } from "../lib/money";
import { nextPayday } from "../lib/pay";

export default function ClientsAccessCard() {
  const { wsId } = useWorkspace();
  const { list } = useClientProjects();
  const withAccess = list.filter((p) => (p.clientEmails || []).length);
  const today = new Date(new Date().toDateString());
  const rows = withAccess.map((p) => {
    const nd = p.tariff?.payDay ? nextPayday([p.tariff.payDay]) : null;
    return { p, nd, days: nd ? Math.round((+nd - +today) / 86400000) : null };
  }).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  return (
    <div className="card wide">
      <h3>Клиенты: доступ и оплата</h3>
      {!rows.length && <div className="muted small">Пока ни у одного клиента нет доступа. Проекты → клиент → ⚙ → «Кабинет клиента» → почта клиента.</div>}
      {rows.map(({ p, nd, days }) => (
        <div key={p.id} className="adm-client">
          <div className="row" style={{ padding: 0 }}>
            <b>{p.name}</b>
            <button className={p.clientOpen ? "" : "ghost"} onClick={() => updateDoc(doc(db, "workspaces", wsId!, "clients", p.id), { clientOpen: !p.clientOpen })}>
              {p.clientOpen ? "🔓 Доступ открыт" : "🔒 Доступ закрыт"}</button>
          </div>
          <div className="small muted">{(p.clientEmails || []).join(", ")}</div>
          <div className="adm-pay">
            <span>💳 {p.tariff ? <>{p.tariff.name} · <b>{rub(p.tariff.price)}</b></> : <span className="muted">тариф не выбран</span>}</span>
            <span className={days != null && days <= 3 ? "pill pill-wait" : "pill pill-info"}>
              {nd ? <>оплата {nd.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}{days === 0 ? " · сегодня" : ` · через ${days} дн.`}</> : "день оплаты не указан"}</span>
          </div>
          <div className="small" style={{ marginTop: 4 }}>
            <Link to={"/client?p=" + p.id}>👁 Кабинет</Link> · <Link to={"/projects?p=" + p.id}>⚙ Настройки</Link></div>
        </div>
      ))}
    </div>
  );
}
