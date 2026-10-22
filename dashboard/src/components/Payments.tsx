// Оплаты по проекту (личное, видит только владелец)
import { FormEvent, useState } from "react";
import { today, useCollection } from "../lib/store";
import { parseAmount, Payment, rub } from "../lib/money";

export default function Payments({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { items, add, remove } = useCollection<Payment>("payments");
  const list = items.filter((p) => p.projectId === projectId).sort((a, b) => b.date.localeCompare(a.date));
  const [amount, setAmount] = useState(""); const [date, setDate] = useState(today()); const [note, setNote] = useState("");
  const total = list.reduce((a, p) => a + p.amount, 0);

  async function submit(e: FormEvent) {
    e.preventDefault(); const n = parseAmount(amount); if (!n) return;
    await add({ projectId, projectName, amount: n, date, note: note.trim() });
    setAmount(""); setNote("");
  }
  return (
    <div style={{ marginTop: 8 }}>
      <form className="inline" onSubmit={submit} style={{ margin: "6px 0" }}>
        <input inputMode="decimal" placeholder="Сумма, ₽" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 110 }} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input placeholder="За что (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <button>+ Оплата</button>
      </form>
      {list.map((p) => (
        <div key={p.id} className="row small">
          <span>{p.date.split("-").reverse().join(".")} · <b>{rub(p.amount)}</b>{p.note ? <span className="muted"> · {p.note}</span> : null}</span>
          <button className="ghost" onClick={() => confirm("Удалить оплату?") && remove(p.id)}>✕</button>
        </div>))}
      {list.length > 0 && <div className="small muted">Всего получено: <b>{rub(total)}</b></div>}
      {!list.length && <div className="small muted">Оплат пока нет</div>}
    </div>
  );
}
