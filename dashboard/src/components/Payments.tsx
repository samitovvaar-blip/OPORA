// Услуги проекта: название, цена, день оплаты — повторяются каждый месяц (личное, видит только владелец)
import { FormEvent, useState } from "react";
import { monthKey } from "../lib/catalog";
import { newId, parseAmount, rub, Service, useBilling } from "../lib/money";

export default function Payments({ projectId }: { projectId: string; projectName: string }) {
  const { map, save } = useBilling();
  const list = map[projectId] || [];
  const [f, setF] = useState({ title: "", price: "", day: "" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const price = parseAmount(f.price), day = parseInt(f.day);
    if (!f.title.trim() || !price || !(day >= 1 && day <= 31)) return alert("Заполни услугу, цену и день оплаты (1–31)");
    const s: Service = { id: newId(), title: f.title.trim(), price, day, from: monthKey(new Date()) };
    await save(projectId, [...list, s]); setF({ title: "", price: "", day: "" });
  }
  return (
    <div style={{ marginTop: 8 }}>
      {list.map((s) => (
        <div key={s.id} className="row small">
          <span>{s.title} · <b>{rub(s.price)}</b> · до {s.day}-го каждого месяца</span>
          <button className="ghost" onClick={() => confirm(`Удалить услугу «${s.title}»?`) && save(projectId, list.filter((x) => x.id !== s.id))}>✕</button>
        </div>))}
      {list.length > 0 && <div className="small muted">В месяц: <b>{rub(list.reduce((a, s) => a + s.price, 0))}</b></div>}
      <form className="inline" onSubmit={submit} style={{ margin: "6px 0" }}>
        <input placeholder="Услуга" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <input inputMode="decimal" placeholder="Цена, ₽" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} style={{ width: 100 }} />
        <input type="number" min={1} max={31} placeholder="день" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} style={{ width: 70 }} />
        <button>+ Услуга</button>
      </form>
      <div className="small muted">Оплату отмечаешь галочкой в разделе <a href="#/pnl">P&L</a> — тогда она попадает в доход.</div>
    </div>
  );
}
