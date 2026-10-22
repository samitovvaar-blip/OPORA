// Продукты: карточки услуг с ценой и составом. Копируются текстом, чтобы отправить клиенту.
// Личное: users/{uid}/products
import { FormEvent, useState } from "react";
import { useCollection } from "../lib/store";
import { parseAmount, rub } from "../lib/money";

export interface Product { title: string; price: number; priceFrom?: boolean; period?: string; short?: string; includes: string[]; note?: string; order?: number; }

export function productText(p: Product) {
  const price = `${p.priceFrom ? "от " : ""}${rub(p.price)}${p.period ? " / " + p.period : ""}`;
  return [
    `✨ ${p.title}`,
    p.short ? p.short : null,
    `💰 ${price}`,
    p.includes.length ? "\nЧто входит:\n" + p.includes.map((i) => `✅ ${i}`).join("\n") : null,
    p.note ? `\n${p.note}` : null,
    `\nОПОРА · oporasamitovva.ru`,
  ].filter(Boolean).join("\n");
}

const empty = { title: "", price: "", priceFrom: false, period: "мес", short: "", includes: "", note: "" };

export default function Products() {
  const { items, add, update, remove } = useCollection<Product>("products");
  const list = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const toForm = (p: Product) => ({ title: p.title, price: String(p.price), priceFrom: !!p.priceFrom, period: p.period || "",
    short: p.short || "", includes: p.includes.join("\n"), note: p.note || "" });
  const fromForm = (): Product | null => {
    const price = parseAmount(form.price);
    if (!form.title.trim() || !price) { alert("Нужны название и цена"); return null; }
    return { title: form.title.trim(), price, priceFrom: form.priceFrom, period: form.period.trim(), short: form.short.trim(),
      includes: form.includes.split("\n").map((s) => s.replace(/^[-•✅\s]+/, "").trim()).filter(Boolean), note: form.note.trim() };
  };
  async function submit(e: FormEvent) {
    e.preventDefault(); const p = fromForm(); if (!p) return;
    if (editId) await update(editId, p); else await add({ ...p, order: Date.now() });
    setForm(empty); setEditId(null);
  }
  async function copy(p: Product) {
    try { await navigator.clipboard.writeText(productText(p)); setMsg(`«${p.title}» скопирован — вставь в чат клиенту`); }
    catch { setMsg("Не удалось скопировать — выдели текст карточки вручную"); }
    setTimeout(() => setMsg(""), 2500);
  }
  async function share(p: Product) {
    if (navigator.share) { try { await navigator.share({ title: p.title, text: productText(p) }); } catch {} }
    else copy(p);
  }

  return (
    <>
      <h1>Продукты</h1>
      <div className="product-grid">
        {list.map((p) => (
          <div key={p.id} className="card product">
            <div className="product-h">
              <b>{p.title}</b>
              <span className="price">{p.priceFrom ? "от " : ""}{rub(p.price)}{p.period ? <span className="small"> / {p.period}</span> : null}</span>
            </div>
            {p.short && <div className="muted small">{p.short}</div>}
            {p.includes.length > 0 && <ul className="incl">{p.includes.map((i, k) => <li key={k}>{i}</li>)}</ul>}
            {p.note && <div className="small muted">{p.note}</div>}
            <div className="inline" style={{ marginTop: "auto", paddingTop: 10 }}>
              <button onClick={() => copy(p)}>📋 Скопировать</button>
              <button className="ghost" onClick={() => share(p)}>↗ Отправить</button>
              <button className="ghost" onClick={() => { setEditId(p.id); setForm(toForm(p)); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}>✏️</button>
              <button className="ghost" onClick={() => confirm(`Удалить «${p.title}»?`) && remove(p.id)}>✕</button>
            </div>
          </div>
        ))}
        {!list.length && <div className="muted">Пока нет продуктов — добавь первый ниже 👇</div>}
      </div>

      <form className="card" onSubmit={submit} style={{ maxWidth: 640, marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <h3>{editId ? "Редактировать продукт" : "+ Новый продукт"}</h3>
        <input placeholder="Название, например «Цифры»" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input placeholder="Коротко: для кого и зачем" value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value })} />
        <div className="inline" style={{ margin: 0, alignItems: "center" }}>
          <label className="small"><input type="checkbox" checked={form.priceFrom} onChange={(e) => setForm({ ...form, priceFrom: e.target.checked })} /> от</label>
          <input inputMode="decimal" placeholder="Цена, ₽" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ width: 120 }} />
          <span className="small muted">за</span>
          <input placeholder="мес" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} style={{ width: 90 }} />
        </div>
        <textarea placeholder={"Что входит — каждый пункт с новой строки"} value={form.includes} onChange={(e) => setForm({ ...form, includes: e.target.value })} style={{ minHeight: 120 }} />
        <input placeholder="Примечание (например: до 15 сотрудников)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <div className="inline" style={{ margin: 0 }}>
          <button>{editId ? "Сохранить" : "Добавить продукт"}</button>
          {editId && <button type="button" className="ghost" onClick={() => { setEditId(null); setForm(empty); }}>Отмена</button>}
        </div>
      </form>
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
