// P&L: доходы — оплаты по проектам, расходы — вносятся здесь; план на месяц и план/факт.
// Всё в личном Firestore (users/{uid}), сотрудник не видит.
import { FormEvent, useState } from "react";
import { today, useCollection } from "../lib/store";
import { expected, Expense, parseAmount, Payment, PlanLine, rub, useBilling, usePaid, usePaidAll, usePlan } from "../lib/money";
import { useClientProjects } from "../lib/clients";
import { monthKey } from "../lib/catalog";

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const sum = (l: { amount: number }[]) => l.reduce((a, x) => a + (x.amount || 0), 0);
const dm = (s: string) => s.split("-").reverse().slice(0, 2).join(".");

function PlanEditor({ title, lines, onSave }: { title: string; lines: PlanLine[]; onSave: (l: PlanLine[]) => void }) {
  const [t, setT] = useState(""); const [a, setA] = useState("");
  return (
    <div>
      <h3>{title} <span className="muted small">{rub(sum(lines))}</span></h3>
      {lines.map((l, i) => (
        <div key={i} className="row small"><span>{l.title}</span>
          <span>{rub(l.amount)} <button className="ghost" onClick={() => onSave(lines.filter((_, j) => j !== i))}>✕</button></span></div>))}
      <form className="inline" style={{ marginTop: 6 }} onSubmit={(e) => { e.preventDefault(); const n = parseAmount(a); if (!t.trim() || !n) return; onSave([...lines, { title: t.trim(), amount: n }]); setT(""); setA(""); }}>
        <input placeholder="Статья" value={t} onChange={(e) => setT(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <input inputMode="decimal" placeholder="₽" value={a} onChange={(e) => setA(e.target.value)} style={{ width: 100 }} />
        <button className="ghost">+</button>
      </form>
    </div>
  );
}

export default function PnL() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const mk = monthKey(month);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1); const nk = monthKey(next);
  const payments = useCollection<Payment>("payments");
  const manual = useCollection<Expense>("incomes"); // ручные доходы — живут только в P&L
  const [fi, setFi] = useState({ title: "", amount: "", date: today() });
  const expenses = useCollection<Expense>("expenses");
  const { plan } = usePlan(mk);
  const nextPlan = usePlan(nk);
  const [f, setF] = useState({ title: "", amount: "", date: today(), category: "" });
  const { list: projects } = useClientProjects();
  const { map: billing } = useBilling();
  const { marks: paid, set: setPaid } = usePaid(mk);
  const exp_ = expected(mk, projects, billing);
  const paidList = exp_.filter((x) => paid[x.key]?.paid);
  const waitSum = exp_.filter((x) => !paid[x.key]?.paid).reduce((a, x) => a + x.price, 0);
  const nextExpected = expected(nk, projects, billing);
  const paidByMonth = usePaidAll();

  const inc = payments.items.filter((p) => p.date?.startsWith(mk)).sort((a, b) => b.date.localeCompare(a.date));
  const exp = expenses.items.filter((x) => x.date?.startsWith(mk)).sort((a, b) => b.date.localeCompare(a.date));
  const paidIncome = paidList.map((x) => ({ project: x.project, amount: paid[x.key].amount }));
  const man = manual.items.filter((x) => x.date?.startsWith(mk)).sort((a, b) => b.date.localeCompare(a.date));
  const I = sum(inc) + sum(paidIncome) + sum(man), E = sum(exp), P = I - E;
  const byProject = Object.entries([...inc.map((p) => ({ project: p.projectName, amount: p.amount })), ...paidIncome, ...man.map((x) => ({ project: x.title, amount: x.amount }))]
    .reduce<Record<string, number>>((m, p) => ((m[p.project] = (m[p.project] || 0) + p.amount), m), {})).sort((a, b) => b[1] - a[1]);
  const byCat = Object.entries(exp.reduce<Record<string, number>>((m, x) => ((m[x.category || "Прочее"] = (m[x.category || "Прочее"] || 0) + x.amount), m), {})).sort((a, b) => b[1] - a[1]);
  const cats = [...new Set(expenses.items.map((x) => x.category).filter(Boolean))] as string[];
  const hasPlan = plan.income.length || plan.expenses.length;
  const pI = sum(plan.income), pE = sum(plan.expenses);

  // 6 месяцев для графика
  const hist = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(month.getFullYear(), month.getMonth() - 5 + i, 1); const k = monthKey(d);
    const a = sum(payments.items.filter((p) => p.date?.startsWith(k))) + (paidByMonth[k] || 0) + sum(manual.items.filter((x) => x.date?.startsWith(k))), b = sum(expenses.items.filter((x) => x.date?.startsWith(k)));
    return { label: MONTHS[d.getMonth()].slice(0, 3), i: a, e: b };
  });
  const max = Math.max(1, ...hist.flatMap((h) => [h.i, h.e]));

  async function addExpense(e: FormEvent) {
    e.preventDefault(); const n = parseAmount(f.amount); if (!f.title.trim() || !n) return;
    await expenses.add({ title: f.title.trim(), amount: n, date: f.date, category: f.category.trim() });
    setF({ ...f, title: "", amount: "" });
  }
  const diff = (fact: number, pl: number, good: "up" | "down") => {
    const d = fact - pl; if (!pl) return null;
    const ok = good === "up" ? d >= 0 : d <= 0;
    return <span className={`small ${ok ? "ok" : "error"}`}>{d >= 0 ? "+" : ""}{rub(d)}</span>;
  };

  return (
    <>
      <h1>P&L</h1>
      <div className="row" style={{ maxWidth: 420 }}>
        <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
        <button className="ghost" onClick={() => setMonth(next)}>›</button>
      </div>

      <div className="bento" style={{ marginTop: 12 }}>
        <div className="card stat"><div className="muted">Доходы</div><b className="ok">{rub(I)}</b>{hasPlan ? <div className="small muted">план {rub(pI)} {diff(I, pI, "up")}</div> : null}</div>
        <div className="card stat"><div className="muted">Расходы</div><b>{rub(E)}</b>{hasPlan ? <div className="small muted">план {rub(pE)} {diff(E, pE, "down")}</div> : null}</div>
        <div className="card stat"><div className="muted">Чистая прибыль</div><b className={P < 0 ? "error" : "ok"}>{rub(P)}</b>{hasPlan ? <div className="small muted">план {rub(pI - pE)} {diff(P, pI - pE, "up")}</div> : null}</div>
        <div className="card stat"><div className="muted">Маржа</div><b>{I ? Math.round(P / I * 100) : 0}%</b></div>

        <div className="card wide2">
          <h3>💳 Оплаты клиентов за месяц</h3>
          {exp_.map((x) => {
            const m = paid[x.key]; const late = !m?.paid && x.due < today();
            return (
              <label key={x.key} className={`row small task ${m?.paid ? "done" : ""}`} style={{ cursor: "pointer", gap: 8 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={!!m?.paid} onChange={() => setPaid(x.key, m?.paid ? null : { paid: true, amount: x.price, date: today() })} />
                  <span><b>{x.project}</b> · {x.service}</span></span>
                <span className={late ? "error" : "muted"}>{rub(x.price)} · {m?.paid ? `✓ ${dm(m.date)}` : `до ${dm(x.due)}${late ? " ⚠" : ""}`}</span>
              </label>);
          })}
          {!exp_.length && <div className="muted small">Нет услуг. Добавь их в <a href="#/projects">Проекты</a> → 💰 Услуги и оплата</div>}
          {exp_.length > 0 && <div className="row small" style={{ marginTop: 6 }}><span className="muted">Ждём оплату</span><b>{rub(waitSum)}</b></div>}
          <h3 style={{ marginTop: 16 }}>💰 Доходы по проектам</h3>
          {byProject.map(([n, v]) => <div key={n} className="row small"><span>{n}</span><b>{rub(v)}</b></div>)}
          {inc.length > 0 && <details className="small" style={{ marginTop: 6 }}><summary className="muted">Разовые оплаты ({inc.length})</summary>
            {inc.map((p) => <div key={p.id} className="row"><span>{dm(p.date)} · {p.projectName}{p.note ? <span className="muted"> · {p.note}</span> : null}</span><span>{rub(p.amount)}</span></div>)}</details>}
          {!byProject.length && <div className="muted small">Пока ничего не оплачено</div>}
        </div>

        <div className="card wide2">
          <h3>➕ Доходы вручную</h3>
          <div className="muted small">Для прошлых месяцев и разовых поступлений. Видны только в P&L.</div>
          <form className="inline" onSubmit={async (e) => { e.preventDefault(); const n = parseAmount(fi.amount); if (!fi.title.trim() || !n) return;
            await manual.add({ title: fi.title.trim(), amount: n, date: fi.date }); setFi({ ...fi, title: "", amount: "" }); }}>
            <input placeholder="Клиент / за что" value={fi.title} onChange={(e) => setFi({ ...fi, title: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
            <input inputMode="decimal" placeholder="₽" value={fi.amount} onChange={(e) => setFi({ ...fi, amount: e.target.value })} style={{ width: 100 }} />
            <input type="date" value={fi.date} onChange={(e) => setFi({ ...fi, date: e.target.value })} />
            <button>+ Доход</button>
          </form>
          {man.map((x) => (
            <div key={x.id} className="row small"><span>{dm(x.date)} · {x.title}</span>
              <span>{rub(x.amount)} <button className="ghost" onClick={() => confirm("Удалить доход?") && manual.remove(x.id)}>✕</button></span></div>))}
          <h3 style={{ marginTop: 16 }}>🧾 Расходы</h3>
          <form className="inline" onSubmit={addExpense}>
            <input placeholder="За что" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
            <input inputMode="decimal" placeholder="₽" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 100 }} />
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <input list="cats" placeholder="Категория" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 130 }} />
            <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
            <button>+ Расход</button>
          </form>
          {byCat.length > 1 && byCat.map(([c, v]) => <div key={c} className="row small"><span className="muted">{c}</span><span>{rub(v)}</span></div>)}
          {exp.map((x) => (
            <div key={x.id} className="row small" style={{ borderTop: "1px solid var(--border)", paddingTop: 4 }}>
              <span>{dm(x.date)} · {x.title}{x.category ? <span className="tagc" style={{ marginLeft: 6 }}>{x.category}</span> : null}</span>
              <span>{rub(x.amount)} <button className="ghost" onClick={() => confirm("Удалить расход?") && expenses.remove(x.id)}>✕</button></span>
            </div>))}
          {!exp.length && <div className="muted small">Расходов в этом месяце нет</div>}
        </div>

        <div className="card wide">
          <h3>Последние 6 месяцев</h3>
          <div className="chart">
            {hist.map((h) => (
              <div key={h.label} className="chart-col" title={`Доход ${rub(h.i)} · Расход ${rub(h.e)} · Прибыль ${rub(h.i - h.e)}`}>
                <div className="chart-bars">
                  <div className="bar-i" style={{ height: h.i / max * 100 + "%" }} />
                  <div className="bar-e" style={{ height: h.e / max * 100 + "%" }} />
                </div>
                <div className="small muted">{h.label}</div>
                <div className={`small ${h.i - h.e < 0 ? "error" : ""}`}>{h.i || h.e ? Math.round((h.i - h.e) / 1000) + "к" : "—"}</div>
              </div>))}
          </div>
          <div className="small muted"><span className="dot i" /> доходы <span className="dot e" /> расходы · внизу прибыль, тыс. ₽</div>
        </div>

        <div className="card wide">
          <h3>📅 План на {MONTHS[next.getMonth()].toLowerCase()} {next.getFullYear()}</h3>
          <div className="plan-grid">
            <PlanEditor title="Доходы" lines={nextPlan.plan.income} onSave={(l) => nextPlan.save({ ...nextPlan.plan, income: l })} />
            <PlanEditor title="Расходы" lines={nextPlan.plan.expenses} onSave={(l) => nextPlan.save({ ...nextPlan.plan, expenses: l })} />
          </div>
          {nextExpected.length > 0 && <div className="row small muted" style={{ marginTop: 6 }}><span>Ожидается по услугам клиентов</span><b>{rub(sum(nextExpected.map((x) => ({ amount: x.price }))))}</b></div>}
          <div className="row" style={{ marginTop: 8 }}><b>Плановая прибыль</b><b>{rub(sum(nextPlan.plan.income) - sum(nextPlan.plan.expenses))}</b></div>
          {!nextPlan.plan.income.length && nextExpected.length > 0 &&
            <button className="ghost" onClick={() => nextPlan.save({ ...nextPlan.plan, income: nextExpected.map((x) => ({ title: `${x.project} · ${x.service}`, amount: x.price })) })}>
              ↺ Заполнить доходы из услуг клиентов</button>}
          {!nextPlan.plan.expenses.length && byCat.length > 0 &&
            <button className="ghost" onClick={() => nextPlan.save({ ...nextPlan.plan, expenses: byCat.map(([title, amount]) => ({ title, amount })) })}>
              ↺ Заполнить расходы как в этом месяце</button>}
          <div className="muted small">Когда наступит этот месяц, на карточках сверху появится сравнение «план / факт».</div>
        </div>
      </div>
    </>
  );
}
