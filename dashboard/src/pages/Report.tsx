// Отчёт за месяц: проекты, сроки, «ждём ответ», задания, кто что отметил
import { useState } from "react";
import { today } from "../lib/store";
import { isRecurring, occursOn } from "../lib/recurring";
import { projectDeadlines, useAssignments, useClientProjects, useMarks } from "../lib/clients";
import { monthKey, STAGES } from "../lib/catalog";
import { visibleItems } from "../components/Checklist";

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const ymd = (d: Date) => d.toLocaleDateString("sv-SE");
const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) : 0);
const titleOf = (id: string) => STAGES.flatMap((s) => s.items).find((i) => i.id === id)?.title || id;

export default function Report() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const mk = monthKey(month);
  const { list: projects } = useClientProjects();
  const { marks } = useMarks(projects.map((p) => p.id), mk);
  const assignments = useAssignments();
  const d = today();

  // Проекты
  const rows = projects.map((p) => {
    const items = visibleItems(p); const m = marks[p.id] || {};
    return { p, total: items.length, done: items.filter((it) => m[it.id]?.done).length };
  });
  const deadlines = projectDeadlines(projects, marks, mk).filter((x) => x.date <= d);
  const lateDl = deadlines.filter((x) => !x.done);
  const waiting = projects.flatMap((p) => Object.entries(marks[p.id] || {})
    .filter(([, m]) => m.comment && !m.done).map(([id, m]) => ({ p, id, m })));

  // Задания календаря за месяц (по сегодняшний день)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: string[] = [];
  for (let x = new Date(month); x <= last && ymd(x) <= d; x.setDate(x.getDate() + 1)) days.push(ymd(x));
  const once = assignments.filter((a) => !isRecurring(a) && a.date?.startsWith(mk));
  const onceDone = once.filter((a) => a.status === "done").length;
  const onceLate = once.filter((a) => a.status !== "done" && a.date < d);
  const rec = assignments.filter((a) => isRecurring(a)).map((a) => {
    const occ = days.filter((x) => occursOn(a, x));
    return { a, occ: occ.length, done: occ.filter((x) => (a.doneDates || []).includes(x)).length };
  }).filter((r) => r.occ);

  // Кто что отметил в чек-листах
  const who: Record<string, number> = {};
  projects.forEach((p) => Object.values(marks[p.id] || {}).forEach((m) => { if (m.done && m.doneBy) who[m.doneBy] = (who[m.doneBy] || 0) + 1; }));

  const totalDone = rows.reduce((a, r) => a + r.done, 0), total = rows.reduce((a, r) => a + r.total, 0);

  return (
    <>
      <h1>Отчёт</h1>
      <div className="row" style={{ maxWidth: 420 }}>
        <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
        <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="bento" style={{ marginTop: 12 }}>
        <div className="card stat"><div className="muted">Чек-листы выполнены</div><b>{pct(totalDone, total)}%</b><div className="muted small">{totalDone} из {total}</div></div>
        <div className="card stat"><div className="muted">Сроки вовремя</div><b>{pct(deadlines.length - lateDl.length, deadlines.length)}%</b><div className="muted small">просрочено: {lateDl.length}</div></div>
        <div className="card stat"><div className="muted">💬 Ждём ответ</div><b>{waiting.length}</b></div>
        <div className="card stat"><div className="muted">Разовые задания</div><b>{onceDone}/{once.length}</b><div className="muted small">просрочено: {onceLate.length}</div></div>

        <div className="card wide">
          <h3>По проектам</h3>
          {rows.map(({ p, total, done }) => (
            <a key={p.id} href={"#/monthly?p=" + p.id} className="row" style={{ color: "inherit", textDecoration: "none", gap: 12 }}>
              <span style={{ minWidth: 120 }}>{p.name}</span>
              <div className="progress" style={{ flex: 1, margin: 0 }}><div style={{ width: pct(done, total) + "%" }} /></div>
              <span className="small muted" style={{ minWidth: 90, textAlign: "right" }}>{done}/{total} · {pct(done, total)}%</span>
            </a>))}
          {!rows.length && <div className="muted small">Нет проектов</div>}
        </div>

        <div className="card wide2">
          <h3>⚠ Просроченные сроки</h3>
          {lateDl.map((x) => <div key={x.key} className="row small"><span><span className="tagc">{x.project}</span> {x.title}</span><span className="error">{Number(x.date.slice(8))}.{x.date.slice(5, 7)}</span></div>)}
          {onceLate.map((a) => <div key={a.id} className="row small"><span>📋 {a.title}</span><span className="error">{a.date.slice(8)}.{a.date.slice(5, 7)}</span></div>)}
          {!lateDl.length && !onceLate.length && <div className="muted small">Нет просрочек 🎉</div>}
        </div>

        <div className="card wide2">
          <h3>💬 Ждём ответ</h3>
          {waiting.map(({ p, id, m }) => (
            <div key={p.id + id} className="small" style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="tagc">{p.name}</span> {titleOf(id)}
              <div className="muted">«{m.comment}» — {m.commentBy}, {m.commentAt}</div>
            </div>))}
          {!waiting.length && <div className="muted small">Ничего не висит</div>}
        </div>

        <div className="card wide2">
          <h3>🔁 Регулярные задания</h3>
          {rec.map(({ a, occ, done }) => (
            <div key={a.id} className="row small"><span>{a.title}</span><span className={done < occ ? "" : "muted"}>{done} из {occ} дней · {pct(done, occ)}%</span></div>))}
          {!rec.length && <div className="muted small">Нет регулярных заданий в этом месяце</div>}
        </div>

        <div className="card wide2">
          <h3>👤 Кто отмечал задачи чек-листов</h3>
          {Object.entries(who).sort((a, b) => b[1] - a[1]).map(([e, n]) => <div key={e} className="row small"><span>{e}</span><b>{n}</b></div>)}
          {!Object.keys(who).length && <div className="muted small">Пока никто</div>}
        </div>
      </div>
    </>
  );
}
