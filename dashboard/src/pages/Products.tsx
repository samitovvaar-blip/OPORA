// Продукты: карточки услуг в фирменном стиле ОПОРЫ.
// Копируются текстом или скачиваются картинкой, чтобы отправить клиенту. Личное: users/{uid}/products
import { FormEvent, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useCollection } from "../lib/store";
import { parseAmount, rub } from "../lib/money";
import { SEED } from "../lib/productSeed";

export interface Section { title: string; items: string[]; }
export interface Tier { label: string; price: string; sub?: string; best?: boolean; }
export interface Product {
  title: string; price: number; priceFrom?: boolean; period?: string; short?: string;
  includes: string[]; note?: string; order?: number;
  oldPrice?: number; saving?: string; badge?: string; sections?: Section[]; tiers?: Tier[];
}
const CONTACT = "Telegram @samitovva · oporasamitovva.ru";

const sectionsOf = (p: Product): Section[] => p.sections?.length ? p.sections : p.includes.length ? [{ title: "Что входит", items: p.includes }] : [];

export function productText(p: Product) {
  const price = `${p.priceFrom ? "от " : ""}${rub(p.price)}${p.period ? " " + p.period : ""}`;
  return [
    `✨ ${p.title}${p.badge ? ` (${p.badge.toLowerCase()})` : ""}`,
    p.short || null,
    `\n💰 ${price}${p.oldPrice ? ` вместо ${rub(p.oldPrice)}` : ""}`,
    p.saving ? `💚 ${p.saving}` : null,
    p.tiers?.length ? "\nПодписка:\n" + p.tiers.map((t) => `• ${t.label} — ${t.price}${t.sub ? ` (${t.sub})` : ""}${t.best ? " ⭐ самая выгодная" : ""}`).join("\n") : null,
    ...sectionsOf(p).map((s) => `\n${s.title}:\n` + s.items.map((i) => `✅ ${i}`).join("\n")),
    p.note ? `\n${p.note}` : null,
    `\nОПОРА · бухгалтерия и управленческий учёт\n${CONTACT}`,
  ].filter(Boolean).join("\n");
}

// Карточка в стиле тарифов (тёмно-синяя, оранжевый акцент) — её же и сохраняем картинкой
function BrandCard({ p }: { p: Product }) {
  return (
    <div className={`bcard ${p.badge ? "accent" : ""}`}>
      <div className="bc-top"><span className="bc-logo">◎ ОПОРА</span><span className="bc-sub">бухгалтерия и управленческий учёт</span></div>
      {p.badge && <span className="bc-badge">{p.badge}</span>}
      <div className="bc-title">{p.title}</div>
      {p.short && <div className="bc-short">{p.short}</div>}
      {p.oldPrice ? <div className="bc-old">{rub(p.oldPrice)} в месяц отдельно</div> : null}
      <div className="bc-price">{p.priceFrom && <span className="bc-from">от </span>}{rub(p.price)}{p.period && <span className="bc-per"> {p.period}</span>}</div>
      {p.saving && <div className="bc-saving">{p.saving}</div>}
      {p.tiers?.length ? <div className="bc-tiers">{p.tiers.map((t) => (
        <div key={t.label} className={`bc-tier ${t.best ? "best" : ""}`}><div className="bc-tl">{t.label}</div><b>{t.price}</b>
          {t.sub && <div className="bc-ts">{t.sub}</div>}{t.best && <div className="bc-best">самая выгодная</div>}</div>))}</div> : null}
      {sectionsOf(p).map((s) => (
        <div key={s.title} className="bc-sec"><div className="bc-st">{s.title}</div>
          <ul>{s.items.map((i, k) => <li key={k}>{i}</li>)}</ul></div>))}
      {p.note && <div className="bc-note">{p.note}</div>}
      <div className="bc-foot">{CONTACT}</div>
    </div>
  );
}

const empty = { title: "", price: "", priceFrom: false, period: "в месяц", short: "", includes: "", note: "", badge: "" };

export default function Products() {
  const { items, add, update, remove } = useCollection<Product>("products");
  const list = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  const toForm = (p: Product) => ({ title: p.title, price: String(p.price), priceFrom: !!p.priceFrom, period: p.period || "",
    short: p.short || "", note: p.note || "", badge: p.badge || "",
    includes: sectionsOf(p).map((s) => (sectionsOf(p).length > 1 ? `# ${s.title}\n` : "") + s.items.join("\n")).join("\n") });
  function fromForm(): Partial<Product> | null {
    const price = parseAmount(form.price);
    if (!form.title.trim() || !price) { alert("Нужны название и цена"); return null; }
    // строки «# Заголовок» начинают новый блок
    const sections: Section[] = []; let cur: Section = { title: "Что вы получаете", items: [] };
    form.includes.split("\n").map((s) => s.trim()).filter(Boolean).forEach((l) => {
      if (l.startsWith("#")) { if (cur.items.length) sections.push(cur); cur = { title: l.replace(/^#+\s*/, ""), items: [] }; }
      else cur.items.push(l.replace(/^[-•✅✓\s]+/, ""));
    });
    if (cur.items.length) sections.push(cur);
    return { title: form.title.trim(), price, priceFrom: form.priceFrom, period: form.period.trim(), short: form.short.trim(),
      note: form.note.trim(), badge: form.badge.trim(), sections, includes: [] };
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); const p = fromForm(); if (!p) return;
    if (editId) await update(editId, p); else await add({ ...p, order: Date.now() });
    setForm(empty); setEditId(null);
  }
  async function copy(p: Product) {
    try { await navigator.clipboard.writeText(productText(p)); flash(`«${p.title}» скопирован — вставь в чат клиенту`); }
    catch { flash("Не удалось скопировать"); }
  }
  async function image(p: Product & { id: string }, mode: "download" | "share") {
    const el = refs.current[p.id]; if (!el) return;
    try {
      const url = await toPng(el, { pixelRatio: 2, cacheBust: true });
      const name = `OPORA-${p.title.replace(/[^\wА-Яа-яЁё-]+/g, "_")}.png`;
      if (mode === "share" && navigator.canShare) {
        const file = new File([await (await fetch(url)).blob()], name, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: p.title, text: productText(p) }); return; }
      }
      const a = document.createElement("a"); a.href = url; a.download = name; a.click();
      flash("Картинка скачана");
    } catch { flash("Не удалось сделать картинку"); }
  }

  return (
    <>
      <h1>Продукты</h1>
      {!list.length && <div className="card" style={{ maxWidth: 560 }}>
        <div>Пока пусто. Загрузить карточки из твоих тарифов (Цифры, Контроль, Бухгалтерия, НЕЙЛА)?</div>
        <button style={{ marginTop: 10 }} onClick={() => SEED.forEach((p) => add(p))}>⬇ Загрузить тарифы ОПОРЫ</button>
      </div>}
      <div className="product-grid">
        {list.map((p) => (
          <div key={p.id} className="product-wrap">
            <div ref={(el) => (refs.current[p.id] = el)}><BrandCard p={p} /></div>
            <div className="inline" style={{ marginTop: 8 }}>
              <button onClick={() => copy(p)}>📋 Текст</button>
              <button onClick={() => image(p, "download")}>🖼 Скачать</button>
              <button className="ghost" onClick={() => image(p, "share")}>↗ Отправить</button>
              <button className="ghost" onClick={() => { setEditId(p.id); setForm(toForm(p)); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 0); }}>✏️</button>
              <button className="ghost" onClick={() => confirm(`Удалить «${p.title}»?`) && remove(p.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <form className="card" onSubmit={submit} style={{ maxWidth: 640, marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <h3>{editId ? "Редактировать продукт" : "+ Новый продукт"}</h3>
        <input placeholder="Название, например «ОПОРА-Цифры»" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input placeholder="Коротко: для кого и зачем" value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value })} />
        <div className="inline" style={{ margin: 0, alignItems: "center" }}>
          <label className="small"><input type="checkbox" checked={form.priceFrom} onChange={(e) => setForm({ ...form, priceFrom: e.target.checked })} /> от</label>
          <input inputMode="decimal" placeholder="Цена, ₽" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ width: 120 }} />
          <input placeholder="в месяц" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} style={{ width: 110 }} />
          <input placeholder="Плашка (например «Основной пакет»)" value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
        </div>
        <textarea placeholder={"Что входит — каждый пункт с новой строки.\nНовый блок начинай строкой «# Заголовок»"} value={form.includes} onChange={(e) => setForm({ ...form, includes: e.target.value })} style={{ minHeight: 140 }} />
        <input placeholder="Примечание внизу карточки" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <div className="inline" style={{ margin: 0 }}>
          <button>{editId ? "Сохранить" : "Добавить продукт"}</button>
          {editId && <button type="button" className="ghost" onClick={() => { setEditId(null); setForm(empty); }}>Отмена</button>}
        </div>
        {editId && <div className="muted small">Старая цена, экономия и сетка подписки (как у НЕЙЛЫ) сохраняются как были.</div>}
      </form>
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
