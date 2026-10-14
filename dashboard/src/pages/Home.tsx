import { useEffect, useState } from "react";
import { getLeads, isMock, Lead } from "../lib/crm";
import StatusBadge from "../components/StatusBadge";

const rub = (n: number) => n.toLocaleString("ru-RU") + " ₽";

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  useEffect(() => { getLeads().then(setLeads); }, []);
  const count = (s: Lead["status"]) => leads.filter((l) => l.status === s).length;
  const pipeline = leads.filter((l) => l.status === "in_progress").reduce((a, l) => a + l.amount, 0);

  return (
    <>
      <h1>Привет, Арина 👋 {isMock && <span className="badge">тестовые данные</span>}</h1>
      <div className="bento">
        <div className="card stat"><div className="muted">Новые заявки</div><b>{count("new")}</b></div>
        <div className="card stat"><div className="muted">В работе</div><b>{count("in_progress")}</b></div>
        <div className="card stat"><div className="muted">Закрыто</div><b>{count("won")}</b></div>
        <div className="card stat"><div className="muted">Сумма в работе</div><b>{rub(pipeline)}</b></div>
        <div className="card wide">
          <h3>Последние заявки</h3>
          {leads.slice(0, 5).map((l) => (
            <div key={l.id} className="row"><span>{l.title} · <span className="muted">{l.client}</span></span><StatusBadge s={l.status} /></div>
          ))}
        </div>
      </div>
    </>
  );
}
