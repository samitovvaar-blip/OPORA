// Личные деньги: прибыль бизнеса (из P&L) + другие доходы, личные траты. Только владелец: users/{uid}/walletIn, walletOut
import { FormEvent, useState } from "react";
import { today, useCollection } from "../lib/store";
import { addMonths, parseAmount, rub, useBusinessProfit } from "../lib/money";
import { monthKey } from "../lib/catalog";

interface Entry { title: string; amount: number; date: string; category?: string; }
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const dm = (s: string) => s.split("-").reverse().slice(0, 2).join(".");
const sum = (l: Entry[]) => l.reduce((a, x) => a + x.amount, 0);
const group = (l: Entry[], fallback: string) => Object.entries(l.reduce<Record<string, number>>((m, x) => {
  const k = x.category || fallback; m[k] = (m[k] || 0) + x.amount; return m; }, {})).sort((a, b) => b[1] - a[1]);

function EntryForm({ placeholder, cats, onAdd }: { placeholder: string; cats: string[]; onAdd: (e: Entry) => void }) {
  const [f, setF] = useState({ title: "", amount: "", date: today(), category: "" });
  const id = "c" + placeholder.length;
  return (
    <form className="inline" onSubmit={(e: FormEvent) => { e.preventDefault(); const n = parseAmount(f.amount); if (!f.title.trim() || !n) return;
      onAdd({ title: f.title.trim(), amount: n, date: f.date, category: f.category.trim() }); setF({ ...f, title: "", amount: "" }); }}>
      <input placeholder={placeholder} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
      <input inputMode="decimal" placeholder="₽" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 100 }} />
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <input list={id} placeholder="Категория" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 130 }} />
      <datalist id={id}>{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <button>+</button>
    </form>
  );
}

export default function Wallet() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const mk = monthKey(month);
  const ins = useCollection<Entry>("walletIn"), outs = useCollection<Entry>("walletOut");
  const biz = useBusinessProfit();
  const [withBiz, setWithBiz] = useState(true);

  const b = biz(mk);
  const inM = ins.items.filter((x) => x.date?.startsWith(mk)).sort((a, c) => c.date.localeCompare(a.date));
  const outM = outs.items.filter((x) => x.date?.startsWith(mk)).sort((a, c) => c.date.localeCompare(a.date));
  const bizPart = withBiz ? b.profit : 0;
  const IN = bizPart + sum(inM), OUT = sum(outM), LEFT = IN - OUT;
  const inCats = [...new Set(ins.items.map((x) => x.category).filter(Boolean))] as string[];
  const outCats = [...new Set(outs.items.map((x) => x.category).filter(Boolean))] as string[];
  const outByCat = group(outM, "Прочее");

  const hist = Array.from({ length: 6 }, (_, i) => {
    const k = addMonths(mk, i - 5); const [, m] = k.split("-").map(Number);
    const a = (withBiz ? biz(k).profit : 0) + sum(ins.items.filter((x) => x.date?.startsWith(k)));
    const c = sum(outs.items.filter((x) => x.date?.startsWith(k)));
    return { label: MONTHS[m - 1].slice(0, 3), i: Math.max(0, a), e: c, left: a - c };
  });
  const max = Math.max(1, ...hist.flatMap((h) => [h.i, h.e]));
  const Row = ({ x, remove }: { x: Entry & { id: string }; remove: (id: string) => void }) => (
    <div className="row small" style={{ borderTop: "1px solid var(--border)", paddingTop: 4 }}>
      <span>{dm(x.date)} · {x.title}{x.category ? <span className="tagc" style={{ marginLeft: 6 }}>{x.category}</span> : null}</span>
      <span>{rub(x.amount)} <button className="ghost" onClick={() => confirm("Удалить?") && remove(x.id)}>✕</button></span>
    </div>);

  return (
    <>
      <h1>Личные деньги</h1>
      <div className="row" style={{ maxWidth: 420 }}>
        <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
        <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>

      <div className="bento" style={{ marginTop: 12 }}>
        <div className="card stat"><div className="muted">Пришло всего</div><b className="ok">{rub(IN)}</b></div>
        <div className="card stat"><div className="muted">Потратила</div><b>{rub(OUT)}</b></div>
        <div className="card stat"><div className="muted">Осталось</div><b className={LEFT < 0 ? "error" : "ok"}>{rub(LEFT)}</b>
          <div className="muted small">{IN ? Math.round(LEFT / IN * 100) : 0}% отложено</div></div>
        <div className="card stat"><div className="muted">Из бизнеса (P&L)</div><b className={b.profit < 0 ? "error" : ""}>{rub(b.profit)}</b>
          <div className="muted small">чистая прибыль месяца</div></div>

        <div className="card wide2">
          <h3>💼 Бизнес</h3>
          <div className="row small"><span>Доходы бизнеса</span><span>{rub(b.income)}</span></div>
          <div className="row small"><span>Расходы бизнеса</span><span>−{rub(b.expenses)}</span></div>
          <div className="row"><b>Чистыми с бизнеса</b><b className={b.profit < 0 ? "error" : "ok"}>{rub(b.profit)}</b></div>
          <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
            <input type="checkbox" checked={withBiz} onChange={(e) => setWithBiz(e.target.checked)} /> учитывать прибыль бизнеса в личном доходе</label>
          <div className="muted small">Считается автоматически из <a href="#/pnl">P&L</a>.</div>

          <h3 style={{ marginTop: 16 }}>💰 Другие доходы</h3>
          <EntryForm placeholder="Источник: аренда, кэшбэк, подарок…" cats={inCats} onAdd={(e) => ins.add(e)} />
          {group(inM, "Другое").length > 1 && group(inM, "Другое").map(([c, v]) => <div key={c} className="row small"><span className="muted">{c}</span><span>{rub(v)}</span></div>)}
          {inM.map((x) => <Row key={x.id} x={x} remove={ins.remove} />)}
          {!inM.length && <div className="muted small">Других доходов в этом месяце нет</div>}
        </div>

        <div className="card wide2">
          <h3>🛍 Куда ушли деньги</h3>
          <EntryForm placeholder="На что: продукты, кафе, такси…" cats={outCats} onAdd={(e) => outs.add(e)} />
          {outByCat.map(([c, v]) => (
            <div key={c} style={{ margin: "6px 0" }}>
              <div className="row small"><span>{c}</span><span>{rub(v)} <span className="muted">· {OUT ? Math.round(v / OUT * 100) : 0}%</span></span></div>
              <div className="progress" style={{ margin: 0 }}><div style={{ width: (OUT ? v / OUT * 100 : 0) + "%", background: "#e8873a" }} /></div>
            </div>))}
          {outM.map((x) => <Row key={x.id} x={x} remove={outs.remove} />)}
          {!outM.length && <div className="muted small">Трат в этом месяце нет</div>}
        </div>

        <div className="card wide">
          <h3>Последние 6 месяцев</h3>
          <div className="chart">
            {hist.map((h) => (
              <div key={h.label} className="chart-col" title={`Пришло ${rub(h.i)} · Потрачено ${rub(h.e)} · Осталось ${rub(h.left)}`}>
                <div className="chart-bars"><div className="bar-i" style={{ height: h.i / max * 100 + "%" }} /><div className="bar-e" style={{ height: h.e / max * 100 + "%" }} /></div>
                <div className="small muted">{h.label}</div>
                <div className={`small ${h.left < 0 ? "error" : ""}`}>{h.i || h.e ? Math.round(h.left / 1000) + "к" : "—"}</div>
              </div>))}
          </div>
          <div className="small muted"><span className="dot i" /> пришло <span className="dot e" /> потрачено · внизу остаток, тыс. ₽</div>
        </div>
      </div>
      <div className="muted small" style={{ marginTop: 10 }}>🔒 Личный кошелёк видишь только ты.</div>
    </>
  );
}
