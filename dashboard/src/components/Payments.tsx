// Услуги проекта: название, цена, день оплаты — повторяются каждый месяц (личное, видит только владелец)
import { FormEvent, useState } from "react";
import { monthKey } from "../lib/catalog";
import { newId, parseAmount, rub, Service, useBilling } from "../lib/money";
import { useCollection } from "../lib/store";
import type { Product } from "../pages/Products";

export default function Payments({ projectId }: { projectId: string; projectName: string }) {
  const { map, save } = useBilling();
  const list = map[projectId] || [];
  const [f, setF] = useState({ title: "", price: "", day: "", prepay: true });
  const products = useCollection<Product>("products").items;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const price = parseAmount(f.price), day = parseInt(f.day);
    if (!f.title.trim() || !price || !(day >= 1 && day <= 31)) return alert("Заполни услугу, цену и день оплаты (1–31)");
    const s: Service = { id: newId(), title: f.title.trim(), price, day, from: monthKey(new Date()), prepay: f.prepay };
    await save(projectId, [...list, s]); setF({ title: "", price: "", day: "", prepay: true });
  }
  return (
    <div style={{ marginTop: 8 }}>
      {list.map((s) => (
        <div key={s.id} className="row small">
          <span>{s.title} · <b>{rub(s.price)}</b> · {s.prepay ? `предоплата до ${s.day}-го за следующий месяц` : `до ${s.day}-го каждого месяца`}
            <button className="ghost" title="Переключить предоплату" onClick={() => save(projectId, list.map((x) => x.id === s.id ? { ...x, prepay: !x.prepay } : x))}>{s.prepay ? "⇄ обычная" : "⇄ предоплата"}</button></span>
          <button className="ghost" onClick={() => confirm(`Удалить услугу «${s.title}»?`) && save(projectId, list.filter((x) => x.id !== s.id))}>✕</button>
        </div>))}
      {list.length > 0 && <div className="small muted">В месяц: <b>{rub(list.reduce((a, s) => a + s.price, 0))}</b></div>}
      {products.length > 0 && <select value="" onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (p) setF({ ...f, title: p.title, price: String(p.price) }); }}>
        <option value="">Выбрать из продуктов…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.title} · {rub(p.price)}</option>)}
      </select>}
      <form className="inline" onSubmit={submit} style={{ margin: "6px 0" }}>
        <input placeholder="Услуга" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <input inputMode="decimal" placeholder="Цена, ₽" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} style={{ width: 100 }} />
        <input type="number" min={1} max={31} placeholder="день" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} style={{ width: 70 }} />
        <label className="small" title="Платят заранее: 25.09 за октябрь"><input type="checkbox" checked={f.prepay} onChange={(e) => setF({ ...f, prepay: e.target.checked })} /> предоплата</label>
        <button>+ Услуга</button>
      </form>
      <div className="small muted">Оплату отмечаешь галочкой в разделе <a href="#/pnl">P&L</a> — тогда она попадает в доход.</div>
    </div>
  );
}
