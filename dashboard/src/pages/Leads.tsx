import { useEffect, useState } from "react";
import { getLeads, Lead, LeadStatus } from "../lib/crm";
import { statusLabel } from "../components/StatusBadge";

const cols: LeadStatus[] = ["new", "in_progress", "won", "lost"];

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  useEffect(() => { getLeads().then(setLeads); }, []);
  return (
    <>
      <h1>Заявки</h1>
      <div className="kanban">
        {cols.map((c) => (
          <div key={c} className="col">
            <div className="col-head">{statusLabel[c]} <span className="muted">{leads.filter((l) => l.status === c).length}</span></div>
            {leads.filter((l) => l.status === c).map((l) => (
              <div key={l.id} className="card lead">
                <b>{l.title}</b>
                <div className="muted small">{l.client} · {l.createdAt}</div>
                <div>{l.amount.toLocaleString("ru-RU")} ₽</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
