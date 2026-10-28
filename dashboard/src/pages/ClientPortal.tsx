// Кабинет клиента: ход работы, ОПиУ из таблицы, дашборд показателей, план.
// Клиент видит только свой проект. Владелец открывает предпросмотр: #/client?p=<id>
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { useMarks } from "../lib/clients";
import { ClientProject, monthKey } from "../lib/catalog";
import { rub } from "../lib/money";
import { loadPnl, Pnl } from "../lib/sheetPnl";
import Checklist from "../components/Checklist";
import { LinkButtons } from "../components/ProjectLinks";

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const pct = (a?: number | null, b?: number | null) => (a != null && b ? Math.round(a / b * 1000) / 10 : null);
const delta = (cur?: number | null, prev?: number | null) => (cur != null && prev ? Math.round((cur - prev) / Math.abs(prev) * 100) : null);

function Delta({ v, inverse = false }: { v: number | null; inverse?: boolean }) {
  if (v == null) return null;
  const good = inverse ? v <= 0 : v >= 0;
  return <span className={`small ${good ? "ok" : "error"}`}> {v >= 0 ? "▲" : "▼"} {Math.abs(v)}%</span>;
}

export default function ClientPortal() {
  const { wsId, clientOf, isOwner } = useWorkspace();
  const cid = isOwner ? new URLSearchParams(location.hash.split("?")[1]).get("p") : clientOf;
  const [p, setP] = useState<ClientProject | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"work" | "pnl" | "dds" | "dash" | "plan">("dash");
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [pnlErr, setPnlErr] = useState("");
  const [mi, setMi] = useState<number | null>(null);
  const [detail, setDetail] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const mk = monthKey(month);
  const { marks } = useMarks(cid ? [cid] : [], mk);

  useEffect(() => wsId && cid ? onSnapshot(doc(db, "workspaces", wsId, "clients", cid),
    (s) => setP(s.exists() ? ({ id: s.id, ...s.data() } as ClientProject) : null),
    (e) => setErr(e.code === "permission-denied" ? "Доступ к кабинету закрыт" : e.message)) : undefined, [wsId, cid]);
  useEffect(() => {
    if (!p?.pnlUrl) return;
    setPnlErr(""); loadPnl(p.pnlUrl, p.closedMonths || []).then(setPnl).catch((e) => setPnlErr(e.message));
  }, [p?.pnlUrl, (p?.closedMonths || []).join()]);

  // последний сданный месяц и предыдущий
  const filled = useMemo(() => pnl ? pnl.months.map((m, i) => ({ m, i })).filter(({ i }) => pnl.revenue[i] != null) : [], [pnl]);
  const closed = filled.filter(({ m }) => m.closed);
  const cur = mi ?? (closed.length ? closed[closed.length - 1].i : filled.length ? filled[filled.length - 1].i : null);
  const prevIdx = cur != null ? filled.filter(({ i }) => i < cur).slice(-1)[0]?.i : undefined;

  if (err) return <><h1>Кабинет клиента</h1><div className="card">🔒 {err}</div></>;
  if (!p) return <div className="muted">Загрузка…</div>;

  const v = (arr: (number | null)[], i?: number) => (i == null ? null : arr[i]);
  const rev = v(pnl?.revenue || [], cur ?? undefined), prof = v(pnl?.profit || [], cur ?? undefined);
  const exp = rev != null && prof != null ? rev - prof : null;
  const prevRev = v(pnl?.revenue || [], prevIdx), prevProf = v(pnl?.profit || [], prevIdx);
  const series = filled.map(({ m, i }) => ({ label: m.label.slice(0, 3), rev: pnl!.revenue[i] || 0, prof: pnl!.profit[i] || 0, closed: m.closed }));
  const max = Math.max(1, ...series.map((s) => s.rev));
  const ddsM = cur != null && pnl?.dds ? pnl.dds.months.find((m) => m.label === pnl.months[cur].label && m.year === pnl.months[cur].year) : undefined;
  const waiting = Object.entries(marks[p.id] || {}).filter(([, m]) => m.comment && !m.done).length;

  return (
    <>
      {isOwner && <div className="card small" style={{ marginBottom: 10, background: "var(--bg)" }}>👁 Предпросмотр: так кабинет видит клиент. <a href={"#/projects?p=" + p.id}>← к проекту</a></div>}
      <h1>{p.name}</h1>
      <div className="muted" style={{ marginTop: -12, marginBottom: 12 }}>Кабинет клиента ОПОРЫ</div>
      <LinkButtons links={p.links} />
      <div className="chips" style={{ marginTop: 12 }}>
        {([["dash", "📊 Показатели"], ["pnl", "📑 Отчёт ОПиУ"], ["dds", "💸 Отчёт ДДС"], ["work", "🛠 Ход работы"], ["plan", "🎯 План"]] as const).map(([k, l]) =>
          <button key={k} className={`chipbtn ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}{k === "work" && waiting ? ` · ⏳${waiting}` : ""}</button>)}
      </div>

      {(tab === "dash" || tab === "pnl" || tab === "dds") && !p.pnlUrl && <div className="card muted">Отчётность скоро появится здесь.</div>}
      {(tab === "dash" || tab === "pnl" || tab === "dds") && pnlErr && <div className="card error">Не удалось загрузить отчёт: {pnlErr}</div>}
      {(tab === "dash" || tab === "pnl" || tab === "dds") && p.pnlUrl && !pnl && !pnlErr && <div className="muted">Загружаю отчёт из таблицы…</div>}

      {(tab === "dash" || tab === "pnl" || tab === "dds") && pnl && cur != null && <div className="row small" style={{ maxWidth: 520, marginTop: 10 }}>
        <span>Месяц: <select value={cur} onChange={(e) => setMi(Number(e.target.value))}>
          {filled.map(({ m, i }) => <option key={i} value={i}>{m.label} {m.year}{m.closed ? " ✓" : ""}</option>)}</select></span>
        <span className={pnl.months[cur].closed ? "ok" : "muted"}>{pnl.months[cur].closed ? "✓ " + pnl.months[cur].status : "предварительно"}</span>
      </div>}

      {tab === "dash" && pnl && cur != null && <>
        <div className="bento" style={{ marginTop: 10 }}>
          <div className="card stat"><div className="muted">Выручка</div><b>{rev != null ? rub(rev) : "—"}</b><Delta v={delta(rev, prevRev)} /></div>
          <div className="card stat"><div className="muted">Расходы</div><b>{exp != null ? rub(exp) : "—"}</b></div>
          <div className="card stat"><div className="muted">Чистая прибыль</div><b className={prof != null && prof < 0 ? "error" : "ok"}>{prof != null ? rub(prof) : "—"}</b><Delta v={delta(prof, prevProf)} /></div>
          <div className="card stat"><div className="muted">Рентабельность</div><b>{pct(prof, rev) != null ? pct(prof, rev) + "%" : "—"}</b></div>

          <div className="card wide">
            <h3>Выручка и прибыль по месяцам</h3>
            <div className="chart">{series.map((s, k) => (
              <div key={k} className="chart-col" title={`Выручка ${rub(s.rev)} · Прибыль ${rub(s.prof)}`}>
                <div className="chart-bars"><div className="bar-i" style={{ height: s.rev / max * 100 + "%", opacity: s.closed ? 1 : .5 }} /><div className="bar-e" style={{ height: Math.max(0, s.prof) / max * 100 + "%", background: "var(--accent)" }} /></div>
                <div className="small muted">{s.label}</div>
                <div className="small">{pct(s.prof, s.rev) != null ? pct(s.prof, s.rev) + "%" : ""}</div>
              </div>))}</div>
            <div className="small muted"><span className="dot i" /> выручка <span className="dot" style={{ background: "var(--accent)" }} /> прибыль · внизу рентабельность · бледные — не сданы</div>
          </div>

          {pnl.depts.length > 0 && <div className="card wide">
            <h3>Структура расходов · {pnl.months[cur].label}</h3>
            {pnl.depts.map((d) => {
              const val = Math.abs(d.values[cur] || 0); const share = rev ? val / rev * 100 : 0;
              return <div key={d.name} style={{ margin: "6px 0" }}>
                <div className="row small"><span>{d.name.replace(/^\d+\.\s*/, "")}</span><span>{rub(val)} <span className="muted">· {share.toFixed(1)}% выручки</span></span></div>
                <div className="progress" style={{ margin: 0 }}><div style={{ width: Math.min(100, share) + "%", background: "#e8873a" }} /></div></div>;
            })}
          </div>}
        </div>
      </>}

      {tab === "pnl" && pnl && cur != null && <div className="card" style={{ overflowX: "auto" }}>
        <div className="row"><h3 style={{ margin: 0 }}>Отчёт о прибылях и убытках</h3>
          <label className="small"><input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} /> по статьям</label></div>
        <table className="pnl-table">
          <thead><tr><th />{<th>{pnl.months[cur].label} {pnl.months[cur].year}</th>}<th className="small muted">% выручки</th></tr></thead>
          <tbody>{pnl.rows.filter((r) => (!r.section || /доход|расход/i.test(r.name)) && (detail || r.total || r.section || (pnl.db ? !r.sub : /выручк|прибыль|переменн|постоянн|фондир/i.test(r.name)))).map((r, k) => (
            <tr key={k} className={r.total || (pnl.db ? !r.sub && !r.section : /выручк|прибыль|переменн|постоянн/i.test(r.name)) ? "pnl-key" : r.section ? "pnl-sec" : ""}>
              <td style={{ paddingLeft: r.sub && !r.total && r.sub !== "Процесс" ? 24 : undefined }}>{r.total || r.sub === "Процесс" ? r.name : r.sub || r.name}</td>
              <td className={(r.values[cur] || 0) < 0 ? "error" : ""}>{r.values[cur] != null ? rub(r.values[cur]!) : ""}</td>
              <td className="small muted">{r.values[cur] != null && rev ? (Math.abs(r.values[cur]!) / rev * 100).toFixed(1) + "%" : ""}</td>
            </tr>))}</tbody>
        </table>
        {pnl.at && <div className="muted small" style={{ marginTop: 6 }}>Данные из таблицы на {new Date(pnl.at).toLocaleString("ru-RU")}</div>}
      </div>}

      {tab === "dds" && pnl && cur != null && (pnl.dds ? <div className="card" style={{ overflowX: "auto" }}>
        <div className="row"><h3 style={{ margin: 0 }}>Движение денежных средств</h3>
          <label className="small"><input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} /> по статьям</label></div>
        <div className="muted small" style={{ margin: "4px 0 8px" }}>По дате операции: сколько денег реально пришло и ушло. Переводы между своими счетами не учитываются.</div>
        {!ddsM && <div className="muted">За {pnl.months[cur].label} {pnl.months[cur].year} движений по счетам нет.</div>}
        {ddsM && <table className="pnl-table">
          <thead><tr><th /><th>{ddsM.label} {ddsM.year}</th></tr></thead>
          <tbody>{pnl.dds.rows.filter((r) => detail || r.section || !r.sub || r.sub === "Процесс").map((r, k) => (
            <tr key={k} className={!r.sub && !r.section ? "pnl-key" : r.section ? "pnl-sec" : ""}>
              <td style={{ paddingLeft: r.sub && r.sub !== "Процесс" ? 24 : undefined }}>{r.name}</td>
              <td className={(r.values[ddsM.col] || 0) < 0 ? "error" : ""}>{r.values[ddsM.col] != null ? rub(r.values[ddsM.col]!) : ""}</td>
            </tr>))}</tbody>
        </table>}
      </div> : <div className="card muted">Отчёт ДДС появится после обновления скрипта в таблице.</div>)}

      {tab === "work" && <div className="card" style={{ maxWidth: 860 }}>
        <div className="row">
          <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
          <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
        <Checklist p={p} mk={mk} marks={marks[p.id] || {}} setMark={async () => {}} readOnly />
      </div>}

      {tab === "plan" && <div className="card" style={{ maxWidth: 640 }}>
        {p.clientPlan ? <>
          <h3>План на {(() => { const [y, m] = p.clientPlan!.mk.split("-").map(Number); return `${MONTHS[m - 1].toLowerCase()} ${y}`; })()}</h3>
          {p.clientPlan.revenue != null && <div className="row"><span>Выручка</span><b>{rub(p.clientPlan.revenue)}</b></div>}
          {p.clientPlan.expenses != null && <div className="row"><span>Расходы</span><b>{rub(p.clientPlan.expenses)}</b></div>}
          {p.clientPlan.profit != null && <div className="row"><span>Чистая прибыль</span><b className="ok">{rub(p.clientPlan.profit)}</b></div>}
          {p.clientPlan.note && <div style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{p.clientPlan.note}</div>}
        </> : <div className="muted">План на следующий месяц появится здесь.</div>}
      </div>}
    </>
  );
}
