// Кабинет клиента: ход работы, ОПиУ из таблицы, дашборд показателей, план.
// Клиент видит только свой проект. Владелец открывает предпросмотр: #/client?p=<id>
import { Fragment, useEffect, useMemo, useState } from "react";
import { deleteField, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { useMarks } from "../lib/clients";
import { ClientProject, monthKey, stamp } from "../lib/catalog";
import { rub } from "../lib/money";
import { applySales, buildDds, loadPnl, Pnl } from "../lib/sheetPnl";
import { visibleItems } from "../components/Checklist";
import { useAuth } from "../lib/auth";
import { LinkButtons } from "../components/ProjectLinks";
import PayCalendar, { monthSum } from "../components/PayCalendar";

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const pct = (a?: number | null, b?: number | null) => (a != null && b ? Math.round(a / b * 1000) / 10 : null);
const delta = (cur?: number | null, prev?: number | null) => (cur != null && prev ? Math.round((cur - prev) / Math.abs(prev) * 100) : null);

function Delta({ v, inverse = false }: { v: number | null; inverse?: boolean }) {
  if (v == null) return null;
  const good = inverse ? v <= 0 : v >= 0;
  return <span className={`small ${good ? "ok" : "error"}`}> {v >= 0 ? "▲" : "▼"} {Math.abs(v)}%</span>;
}

const DEPT_NAMES = ["1. Производственный отдел", "2. Отдел продаж", "3. Отдел маркетинга", "4. Админ-хоз отдел и Руководство", "5. Финансовый отдел"];

export default function ClientPortal() {
  const { wsId, clientOf, isOwner } = useWorkspace();
  const { user } = useAuth();
  const cid = isOwner ? new URLSearchParams(location.hash.split("?")[1]).get("p") : clientOf;
  const [p, setP] = useState<ClientProject | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"work" | "pnl" | "dds" | "dash" | "plan" | "op">("dash");
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [pnlErr, setPnlErr] = useState("");
  const [mi, setMi] = useState<number | null>(null);
  const [detail, setDetail] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [showArch, setShowArch] = useState(false);
  const [planMonth, setPlanMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1); });
  const [accSel, setAccSel] = useState<string[] | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const mk = monthKey(month);
  const { marks } = useMarks(cid ? [cid] : [], mk);

  useEffect(() => wsId && cid ? onSnapshot(doc(db, "workspaces", wsId, "clients", cid),
    (s) => setP(s.exists() ? ({ id: s.id, ...s.data() } as ClientProject) : null),
    (e) => setErr(e.code === "permission-denied" ? "Доступ к кабинету закрыт" : e.message)) : undefined, [wsId, cid]);
  useEffect(() => {
    if (!p?.pnlUrl) return;
    setPnlErr(""); loadPnl(p.pnlUrl, p.closedMonths || []).then((x) => setPnl(applySales(x, p.sales, p.prepay))).catch((e) => setPnlErr(e.message));
  }, [p?.pnlUrl, (p?.closedMonths || []).join(), JSON.stringify([p?.sales, p?.prepay])]);

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
  const waiting = Object.entries(marks[p.id] || {}).filter(([, m]) => m.comment && !m.done).length;

  return (
    <>
      {isOwner && <div className="card small" style={{ marginBottom: 10, background: "var(--bg)" }}>👁 Предпросмотр: так кабинет видит клиент. <a href={"#/projects?p=" + p.id}>← к проекту</a></div>}
      <h1>{p.name}</h1>
      <div className="muted" style={{ marginTop: -12, marginBottom: 12 }}>Кабинет клиента ОПОРЫ</div>
      <LinkButtons links={p.links} />
      <div className="chips" style={{ marginTop: 12 }}>
        {([["dash", "📊 Показатели"], ["pnl", "📑 Отчёт ОПиУ"], ["dds", "💸 Отчёт ДДС"], ["work", "🛠 Ход работы"], ["plan", "🎯 План"], ...(isOwner ? [["op", "📥 Данные от ОП"]] as const : [])] as const).map(([k, l]) =>
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

          <div className="wide" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
          {pnl.depts.length > 0 && <div className="card">
            <h3 style={{ marginTop: 0 }}>Структура расходов · {pnl.months[cur].label}</h3>
            {pnl.depts.map((d) => {
              const val = Math.abs(d.values[cur] || 0); const share = rev ? val / rev * 100 : 0;
              return <div key={d.name} style={{ margin: "3px 0" }}>
                <div className="row small"><span>{d.name.replace(/^\d+\.\s*/, "")}</span><span>{rub(val)} <span className="muted">· {share.toFixed(1)}% выручки</span></span></div>
                <div className="progress" style={{ margin: 0, height: 4 }}><div style={{ width: Math.min(100, share) + "%", background: "#e8873a" }} /></div></div>;
            })}
          </div>}

          {pnl.metrics && (() => {
            const M = pnl.metrics, at = (k: string) => M[k]?.[cur] ?? null;
            const sh = (k: string) => { const x = at(k); return x != null && rev ? (x / rev * 100).toFixed(2) + "%" : "—"; };
            const mk = pnl.months[cur].mk || "", kp = p.kpi?.[mk] || {};
            const cost = Math.abs(at("d1") || 0), mkt = Math.abs(at("d3") || 0);
            const per = (a: number, b?: number) => b ? rub(Math.round(a / b)) : "—";
            const Row = ({ l, v, c }: { l: string; v: string; c?: string }) => <div className="row small" style={{ margin: "1px 0", padding: "2px 0" }}><span style={{ color: c }}>{l}</span><b>{v}</b></div>;
            const Num = ({ f, l }: { f: "units" | "newClients" | "orders"; l: string }) => <div className="row small" style={{ margin: "1px 0", padding: "2px 0" }}><span>{l}</span>
              <b>{kp[f] ?? "—"}</b></div>;
            return <><div className="card">
              <h3 style={{ marginTop: 0 }}>Ключевые метрики бизнеса · {pnl.months[cur].label}</h3>
              <div className="muted small" style={{ marginBottom: 4 }}>1. Доля от выручки</div>
              <Row l="Дивиденды" v={sh("dividends")} c="#b02a2a" />
              <Row l="Налоги" v={sh("taxes")} c="#8a3ab9" />
              <Row l="Производство аутсорс" v={sh("outsource")} c="#2a5bd7" />
              <Row l="Возвраты клиентам" v={sh("refunds")} c="#e8873a" />
              <Row l="Зарплаты" v={sh("salary")} c="#3a9a5b" />
              <Row l="ФОТ общая" v={at("salary") != null ? rub(at("salary")!) : "—"} />
              <div style={{ height: 6 }} />
              {(["d1", "d2", "d3", "d4", "d5"] as const).map((k, n) => <Row key={k} l={DEPT_NAMES[n]} v={sh(k)} />)}
            </div>
            <div className="card" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", columnGap: 24 }}>
              <h3 style={{ gridColumn: "1 / -1", margin: "0 0 4px" }}>Себестоимость и клиенты · {pnl.months[cur].label}</h3>
              <Row l="Себестоимость продаж" v={cost ? rub(cost) : "—"} />
              <Num f="units" l="Количество проданных кубиков" />
              <Row l="Себестоимость на единицу" v={per(cost, kp.units)} />
              <Num f="newClients" l="Новых клиентов (доставлено)" />
              <Num f="orders" l="Заказов всего (доставлено)" />
              <Row l="Средний чек" v={per(rev || 0, kp.orders)} />
              <Row l="Цена привлечения клиента (CAC)" v={per(mkt, kp.newClients)} />
              {isOwner && <div className="muted small">Количества и выручка ОП — во вкладке «📥 Данные от ОП».</div>}
            </div></>;
          })()}
          </div>
          <div className="card wide" style={{ gridColumn: "1 / -1" }}>
            <h3>Выручка и прибыль по месяцам</h3>
            <div className="chart">{series.map((s, k) => (
              <div key={k} className="chart-col" title={`Выручка ${rub(s.rev)} · Прибыль ${rub(s.prof)}`}>
                <div className="chart-bars"><div className="bar-i" style={{ height: s.rev / max * 100 + "%", opacity: s.closed ? 1 : .5 }} /><div className="bar-e" style={{ height: Math.max(0, s.prof) / max * 100 + "%", background: "var(--accent)" }} /></div>
                <div className="small muted">{s.label}</div>
                <div className="small">{pct(s.prof, s.rev) != null ? pct(s.prof, s.rev) + "%" : ""}</div>
              </div>))}</div>
            <div className="small muted"><span className="dot i" /> выручка <span className="dot" style={{ background: "var(--accent)" }} /> прибыль · внизу рентабельность · бледные — не сданы</div>
          </div>

        </div>
      </>}

      {tab === "pnl" && pnl && cur != null && <div className="card" style={{ overflowX: "auto", maxWidth: 820 }}>
        <h3 style={{ marginTop: 0 }}>Отчёт о прибылях и убытках · {pnl.months[cur].label} {pnl.months[cur].year}</h3>
        <div className="muted small" style={{ marginBottom: 8 }}>По дате для отчёта. Нажми на отдел или процесс, чтобы раскрыть.</div>
        {(() => {
          // дерево: итоговые строки → процессы → статьи
          let l0 = "", l1 = "";
          const tree = pnl.rows.filter((r) => !r.section).map((r) => {
            const lvl = r.sub === "Процесс" ? 1 : r.sub && !r.total ? 2 : 0;
            if (lvl === 0) { l0 = r.name; l1 = ""; } else if (lvl === 1) l1 = l0 + "/" + r.name;
            return { r, lvl, k0: "p:" + l0, k1: "p:" + l1, key: lvl === 0 ? "p:" + r.name : "p:" + l0 + "/" + r.name };
          });
          const hasKids = (i: number) => tree[i + 1] && tree[i + 1].lvl > tree[i].lvl;
          const big = (n: string) => /выручк|прибыль|переменн|постоянн/i.test(n) && !/\d\./.test(n);
          return <table className="pnl-table">
            <thead><tr><th /><th>Сумма</th><th className="small muted">% выручки</th></tr></thead>
            <tbody>{tree.map((t, i) => {
              if (t.lvl >= 1 && !open[t.k0]) return null;
              if (t.lvl === 2 && !open[t.k1]) return null;
              const v = t.r.values[cur], kids = hasKids(i);
              return <tr key={i} className={t.lvl === 0 && big(t.r.name) ? "pnl-key" : t.lvl === 0 ? "pnl-sec" : t.lvl === 2 ? "small" : ""}
                style={{ cursor: kids ? "pointer" : undefined }} onClick={() => kids && setOpen((o) => ({ ...o, [t.key]: !o[t.key] }))}>
                <td style={{ paddingLeft: [8, 24, 44][t.lvl] }}>{kids ? (open[t.key] ? "▾ " : "▸ ") : ""}{t.lvl === 2 ? t.r.sub : t.r.name}</td>
                <td className={/^Проверка/.test(t.r.name) ? (Math.abs(v || 0) < 1 ? "ok" : "error") : (v || 0) < 0 ? "error" : ""}>{v != null ? (/^Проверка/.test(t.r.name) && Math.abs(v) < 1 ? "✓ " : "") + rub(v) : "—"}</td>
                <td className="small muted">{v != null && rev ? (Math.abs(v) / rev * 100).toFixed(1) + "%" : ""}</td>
              </tr>;
            })}</tbody>
          </table>;
        })()}
        {pnl.at && <div className="muted small" style={{ marginTop: 6 }}>Данные из таблицы на {new Date(pnl.at).toLocaleString("ru-RU")}</div>}
      </div>}

      {tab === "dds" && pnl && cur != null && (pnl.dds ? (() => {
        const B = pnl.balances, mk = pnl.months[cur].mk || "", st = p.ddsStart;
        const accs = B?.accounts || [], sel = accSel ?? accs.filter((a) => /^1\./.test(a.group)).map((a) => a.account);
        const D = B && pnl.ddsRaw ? buildDds(pnl.ddsRaw, sel) : pnl.dds;
        const ddsM = D.months.find((m) => m.label === pnl.months[cur].label && m.year === pnl.months[cur].year);
        const netOf = (m: { col: number }) => D.net[m.col] || 0;
        // остаток на начало: остатки из «БАЛАНСЫ СЕЙЧАС» на дату ввода + все движения после неё до выбранного месяца
        const bm = B?.start.match(/(\d+)\.(\d+)\.(\d{4})/), bMk = bm ? `${bm[3]}-${bm[2].padStart(2, "0")}` : "";
        const startBal = B && bMk ? D.months.filter((m) => m.mk! > bMk && m.mk! < mk).reduce((x, m) => x + netOf(m), accs.filter((a) => sel.includes(a.account)).reduce((x, a) => x + a.start, 0))
          : st && st.mk <= mk ? D.months.filter((m) => m.mk! >= st.mk && m.mk! < mk).reduce((x, m) => x + netOf(m), st.amount) : null;
        const c = ddsM?.col, inflow = c != null ? D.inflow[c] || 0 : 0, outflow = c != null ? D.outflow[c] || 0 : 0, other = c != null ? D.other?.[c] || 0 : 0;
        const endBal = startBal != null ? startBal + inflow + outflow + other : null;
        // приходы/расходы: процесс → статьи
        const groups: Record<string, { name: string; v: number; arts: { name: string; v: number }[] }[]> = { in: [], out: [], other: [] };
        let sec = "in";
        D.rows.forEach((r) => {
          if (r.section) { sec = /выплат/i.test(r.name) ? "out" : /проч/i.test(r.name) ? "other" : "in"; return; }
          const v = c != null ? r.values[c] || 0 : 0;
          if (r.sub === "Процесс") groups[sec].push({ name: r.name, v, arts: [] });
          else if (r.sub && groups[sec].length && v) groups[sec][groups[sec].length - 1].arts.push({ name: r.name, v });
        });
        const tog = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
        const Money = ({ v }: { v: number | null }) => <td className={(v || 0) < 0 ? "error" : ""}>{v != null ? rub(v) : "—"}</td>;
        const Block = ({ k, title, total }: { k: "in" | "out" | "other"; title: string; total: number }) => <>
          <tr className="pnl-key" style={{ cursor: "pointer" }} onClick={() => tog(k)}><td>{open[k] ? "▾" : "▸"} {title}</td><Money v={total} /></tr>
          {open[k] && groups[k].filter((g) => g.v).map((g) => <Fragment key={g.name}>
            <tr style={{ cursor: "pointer" }} onClick={() => tog(k + g.name)}><td style={{ paddingLeft: 20 }}>{open[k + g.name] ? "▾" : "▸"} {g.name}</td><Money v={g.v} /></tr>
            {open[k + g.name] && g.arts.map((x) => <tr key={x.name} className="small"><td style={{ paddingLeft: 44 }}>{x.name}</td><Money v={x.v} /></tr>)}
          </Fragment>)}
        </>;
        return <div className="card" style={{ overflowX: "auto", maxWidth: 720 }}>
          <h3 style={{ marginTop: 0 }}>Движение денежных средств · {pnl.months[cur].label} {pnl.months[cur].year}</h3>
          <div className="muted small" style={{ marginBottom: 8 }}>По дате операции. Переводы между своими счетами не учитываются. Нажми на строку, чтобы раскрыть.</div>
          {accs.length > 0 && <div className="chips" style={{ marginBottom: 8 }}>{accs.map((a) => { const on = sel.includes(a.account);
            return <button key={a.account} className={`chipbtn ${on ? "on" : ""}`} title={a.group}
              onClick={() => setAccSel(on ? sel.filter((x) => x !== a.account) : [...sel, a.account])}>{a.account.replace(/\s*\d{20}\s*/, " ").slice(0, 34)}</button>; })}</div>}
          <table className="pnl-table"><tbody>
            <tr className="pnl-sec"><td>Остаток на начало месяца</td><Money v={startBal} /></tr>
            <Block k="in" title="ФАКТ ПРИХОД" total={inflow} />
            <Block k="out" title="ФАКТ РАСХОД" total={outflow} />
            {other !== 0 && <tr className="small muted"><td>Прочие движения (таблица ниже)</td><Money v={other} /></tr>}
            <tr className="pnl-sec"><td>Остаток на конец месяца</td><Money v={endBal} /></tr>
          </tbody></table>
          {groups.other.some((g) => g.v) && <>
            <h3 style={{ marginTop: 18 }}>Прочие движения</h3>
            <div className="muted small" style={{ marginBottom: 6 }}>Фонды, «Для ДДС», «Не выяснено», переводы между счетами — не приход и не расход бизнеса.</div>
            <table className="pnl-table"><tbody><Block k="other" title="ПРОЧЕЕ ИТОГО" total={other} /></tbody></table>
          </>}
          {(() => {
            // Фонды: каждый фонд — отдельный счёт, минуса быть не может
            const funds = accs.filter((a) => /фонд/i.test(a.group));
            if (!funds.length || !pnl.ddsRaw) return null;
            const flows = (acc: string, f: (m: string) => boolean, sign: number) => pnl.ddsRaw!.rows.filter((r) => r.account === acc)
              .reduce((x, r) => x + Object.entries(r.values).filter(([m, v]) => f(m) && (sign === 0 || Math.sign(v) === sign)).reduce((y, [, v]) => y + v, 0), 0);
            const list = funds.map((a) => {
              const start = a.start + flows(a.account, (m) => m > bMk && m < mk, 0);
              const inc = flows(a.account, (m) => m === mk, 1), out = flows(a.account, (m) => m === mk, -1);
              return { a, start, inc, out, end: start + inc + out };
            });
            return <>
              <h3 style={{ marginTop: 18 }}>🏦 Фонды · {pnl.months[cur].label}</h3>
              <div className="muted small" style={{ marginBottom: 6 }}>Пополнение — переводы с основного счёта. Потрачено — расходы из фонда (они уже в ОПиУ по своим статьям).</div>
              <table className="pnl-table">
                <thead><tr><th>Фонд</th><th className="small">На начало</th><th className="small">Пополнено</th><th className="small">Потрачено</th><th className="small">На конец</th></tr></thead>
                <tbody>{list.map(({ a, start, inc, out, end }) => <tr key={a.account}>
                  <td>{a.account.replace(/\s*\d{20}.*$/, "")}</td><Money v={start} /><td className="ok">{inc ? "+" + rub(inc) : "—"}</td><Money v={out || null} />
                  <td className={end < -0.5 ? "error" : ""}><b>{rub(end)}</b>{end < -0.5 && <div className="small">⚠️ минус — ошибка в базе</div>}</td>
                </tr>)}
                <tr className="pnl-key"><td>Итого в фондах</td>{(["start", "inc", "out", "end"] as const).map((k) => <Money key={k} v={list.reduce((x, f) => x + f[k], 0)} />)}</tr>
                </tbody>
              </table>
            </>;
          })()}
          {accs.length > 0 && <>
            <h3 style={{ marginTop: 18 }}>Остатки на счетах · сверка с выпиской</h3>
            <table className="pnl-table"><tbody>{accs.map((a, k) => <Fragment key={a.account}>
              {(k === 0 || accs[k - 1].group !== a.group) && <tr className="pnl-sec"><td colSpan={3}>{a.group}</td></tr>}
              <tr><td>{a.account}</td><Money v={a.balance} />
                <td className={`small ${a.checked ? "ok" : "muted"}`}>{a.checked ? "✓ сверено" : "не сверено"}{a.checkedAt ? " " + a.checkedAt.slice(0, 10) : ""}</td></tr>
            </Fragment>)}</tbody></table>
          </>}
          {isOwner && !B && <div className="row small" style={{ marginTop: 10 }}>
            <span>Стартовый остаток на начало <select defaultValue={st?.mk || D.months[0]?.mk} id="dds-st-mk">{D.months.map((m) => <option key={m.mk} value={m.mk}>{m.label} {m.year}</option>)}</select></span>
            <input type="number" step="0.01" style={{ width: 140 }} defaultValue={st?.amount ?? ""} key={"st" + (st?.amount ?? "")}
              onBlur={(e) => e.target.value !== "" && updateDoc(doc(db, "workspaces", wsId!, "clients", p.id), { ddsStart: { mk: (document.getElementById("dds-st-mk") as HTMLSelectElement).value, amount: Number(e.target.value) } })} />
          </div>}
          {isOwner && !B && startBal == null && <div className="muted small">Впиши остаток на начало первого месяца (как в твоём ДДС) — дальше остатки посчитаются сами.</div>}
        </div>;
      })() : <div className="card muted">Отчёт ДДС появится после обновления скрипта в таблице.</div>)}

      {tab === "op" && isOwner && (() => {
        const ref = doc(db, "workspaces", wsId!, "clients", p.id);
        const mks = [...new Set([...(pnl?.months.map((m) => m.mk!).filter(Boolean) || []), ...[1, 0, -1, -2].map((k) => monthKey(new Date(new Date().getFullYear(), new Date().getMonth() + k, 1)))])].sort().reverse();
        const cols: [string, string, (mk: string) => number | undefined][] = [
          ["sales", "Выручка (факт продаж ОП), ₽", (mk) => p.sales?.[mk]], ["prepay", "Факт предоплат, ₽", (mk) => p.prepay?.[mk]],
          ["kpi.units", "Продано кубиков", (mk) => p.kpi?.[mk]?.units], ["kpi.newClients", "Новых клиентов (доставлено)", (mk) => p.kpi?.[mk]?.newClients],
          ["kpi.orders", "Заказов всего (доставлено)", (mk) => p.kpi?.[mk]?.orders]];
        const save = (path: string, mk: string, v: string) => {
          const field = path.startsWith("kpi.") ? `kpi.${mk}.${path.slice(4)}` : `${path}.${mk}`;
          updateDoc(ref, { [field]: v === "" ? deleteField() : Number(v) });
        };
        return <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>📥 Данные от отдела продаж</h3>
          <div className="muted small" style={{ marginBottom: 8 }}>Вписываешь цифры от ОП по месяцам — из них считаются выручка в ОПиУ, проверка предоплат, средний чек, CAC и себестоимость на единицу. Клиент эту вкладку не видит.</div>
          <table className="pnl-table">
            <thead><tr><th>Месяц</th>{cols.map(([k, l]) => <th key={k} className="small">{l}</th>)}</tr></thead>
            <tbody>{mks.map((mk) => { const [y, m] = mk.split("-").map(Number);
              return <tr key={mk}><td>{MONTHS[m - 1]} {y}</td>{cols.map(([k, , get]) => <td key={k}>
                <input type="number" step="any" style={{ width: 130 }} key={k + mk + (get(mk) ?? "")} defaultValue={get(mk) ?? ""}
                  onBlur={(e) => e.target.value !== String(get(mk) ?? "") && save(k, mk, e.target.value)} /></td>)}</tr>; })}</tbody>
          </table>

          {([["planSales", "🎯 План / факт отдела продаж", "Факт продаж ОП", "sales"]] as const).map(([pk, title, fl, fk]) => <Fragment key={pk}>
          <h3 style={{ marginTop: 22 }}>{title}</h3>
          <div className="muted small" style={{ marginBottom: 8 }}>Вносишь только план. Факт берётся из таблицы выше.</div>
          <table className="pnl-table">
            <thead><tr><th>Месяц</th><th className="small">План, ₽</th><th className="small">{fl}, ₽</th><th className="small">Отклонение</th><th className="small">Выполнение</th></tr></thead>
            <tbody>{mks.map((mk) => { const [y, m] = mk.split("-").map(Number);
              const pl = p[pk]?.[mk], fa = p[fk]?.[mk], pc = pl && fa != null ? Math.round(fa / pl * 100) : null;
              return <tr key={mk}><td>{MONTHS[m - 1]} {y}</td>
                <td><input type="number" step="any" style={{ width: 130 }} key={pk + mk + (pl ?? "")} defaultValue={pl ?? ""}
                  onBlur={(e) => e.target.value !== String(pl ?? "") && save(pk, mk, e.target.value)} /></td>
                <td>{fa != null ? rub(fa) : "—"}</td>
                <td className={pc == null ? "muted" : fa! >= pl! ? "ok" : "error"}>{pc == null ? "—" : (fa! - pl! >= 0 ? "+" : "") + rub(fa! - pl!)}</td>
                <td className={pc == null ? "muted" : pc >= 100 ? "ok" : "error"}>{pc == null ? "—" : pc + "%"}</td>
              </tr>; })}</tbody>
          </table></Fragment>)}
        </div>;
      })()}

      {tab === "work" && <div className="card" style={{ maxWidth: 860 }}>
        <div className="row">
          <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
          <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
        {(() => {
          const ms = marks[p.id] || {}, all = visibleItems(p), done = all.filter((it) => ms[it.id]?.done).length;
          const ws = p.workStatus?.[mk] || {}, ref = doc(db, "workspaces", wsId!, "clients", p.id), calls = p.calls || [];
          const save = (patch: object) => updateDoc(doc(db, "workspaces", wsId!, "clients", p.id), { [`workStatus.${mk}`]: { ...ws, ...patch } });
          // за какой месяц сдана отчётность / оплачены налоги (по умолчанию — прошлый)
          const opts = [-1, -2, -3, 0].map((k) => { const d = new Date(month.getFullYear(), month.getMonth() + k, 1); return monthKey(d); });
          const mName = (k?: string) => { if (!k) return ""; const [y, m] = k.split("-").map(Number); return `${MONTHS[m - 1].toLowerCase()} ${y}`; };
          const Flag = ({ f, l }: { f: "reportsDone" | "taxesPaid"; l: string }) => { const fk = (f + "For") as "reportsDoneFor" | "taxesPaidFor", per = ws[fk] || opts[0];
            return <div className="row" style={{ margin: "8px 0" }}><span>{l} за {isOwner
              ? <select value={per} onChange={(e) => save({ [fk]: e.target.value })}>{opts.map((o) => <option key={o} value={o}>{mName(o)}</option>)}</select> : mName(per)}</span>
            {isOwner ? <button className={`chipbtn ${ws[f] ? "on" : ""}`} onClick={() => save({ [f]: !ws[f], [fk]: per })}>{ws[f] ? "✓ да" : "нет"}</button>
              : <b className={ws[f] ? "ok" : "muted"}>{ws[f] ? "✓ да" : "ещё нет"}</b>}</div>; };
          return <>
            <div className="progress" style={{ marginTop: 10 }}><div style={{ width: (all.length ? done / all.length * 100 : 0) + "%" }} /></div>
            <div className="muted small">Работа за месяц выполнена на {all.length ? Math.round(done / all.length * 100) : 0}%</div>
            <div className="row" style={{ margin: "14px 0 8px" }}><span>📥 Данные в таблицу загружены до</span>
              {isOwner ? <input type="date" value={ws.loadedTo || ""} onChange={(e) => save({ loadedTo: e.target.value })} />
                : <b>{ws.loadedTo ? new Date(ws.loadedTo).toLocaleDateString("ru-RU") : "—"}</b>}</div>
            <Flag f="reportsDone" l="📑 Отчётность сдана" />
            <Flag f="taxesPaid" l="🧾 Налоги оплачены" />
            <h3 style={{ marginBottom: 6 }}>📞 Итоги созвонов</h3>
            {isOwner && <div style={{ marginBottom: 10 }}>
              <textarea rows={4} placeholder="Что обсудили, какие вопросы открыты, что ждём от клиента" value={note} onChange={(e) => setNote(e.target.value)} />
              <button disabled={!note.trim()} onClick={() => { updateDoc(ref, { calls: [{ id: String(Date.now()), at: new Date().toISOString(), text: note.trim() }, ...calls] }); setNote(""); }}>💾 Сохранить итог</button>
            </div>}
            {calls.filter((c) => !c.archived).length === 0 && <div className="muted small">Пока нет записей</div>}
            {calls.filter((c) => showArch || !c.archived).filter((c) => isOwner || !c.archived).map((c) => (
              <div key={c.id} className="comment" style={{ whiteSpace: "pre-wrap", marginBottom: 8, opacity: c.archived ? .55 : 1 }}>
                <div className="row small muted"><span>🗓 {new Date(c.at).toLocaleDateString("ru-RU")}{c.archived ? " · в архиве" : ""}</span>
                  {isOwner && <span>
                    <button className="ghost" title={c.archived ? "Вернуть" : "В архив"} onClick={() => updateDoc(ref, { calls: calls.map((x) => x.id === c.id ? { ...x, archived: !x.archived } : x) })}>{c.archived ? "↩" : "🗄"}</button>
                    <button className="ghost" title="Удалить" onClick={() => confirm("Удалить запись?") && updateDoc(ref, { calls: calls.filter((x) => x.id !== c.id) })}>🗑</button>
                  </span>}</div>
                {c.text}
              </div>))}
            {isOwner && calls.some((c) => c.archived) && <button className="ghost small" onClick={() => setShowArch(!showArch)}>{showArch ? "Скрыть архив" : `🗄 Архив (${calls.filter((c) => c.archived).length})`}</button>}
          </>;
        })()}
      </div>}

      {tab === "plan" && (() => {
        const pmk = monthKey(planMonth), pl = p.plans?.[pmk] || {}, ref = doc(db, "workspaces", wsId!, "clients", p.id);
        const i = pnl?.months.findIndex((m) => m.mk === pmk) ?? -1;
        const fRev = i >= 0 ? pnl!.revenue[i] : null, fProf = i >= 0 ? pnl!.profit[i] : null;
        const fExp = fRev != null && fProf != null ? Math.abs(fRev - fProf) : null;
        const DK = ["d1", "d2", "d3", "d4", "d5"] as const;
        const fDept = (k: string) => (i >= 0 && pnl!.metrics?.[k]?.[i] != null ? Math.abs(pnl!.metrics![k][i]!) : null);
        // план отдела: введён вручную или собран из платёжного календаря
        const calItems = (p.payCal?.[pmk]?.items || []).filter((it) => !it.income);
        const calDept = (n: number) => { const l = calItems.filter((it) => it.dept === String(n + 1)); return l.length ? l.reduce((a, it) => a + monthSum(it, pmk), 0) : null; };
        const pDepts = DK.map((_, n) => calDept(n)), anyP = pDepts.some((x) => x != null);
        const pRev = p.planSales?.[pmk] ?? null, pExp = anyP ? pDepts.reduce((a: number, x) => a + (x || 0), 0) : null;
        const pProf = pRev != null && pExp != null ? pRev - pExp : null;
        const save = (k: string, v: string) => updateDoc(ref, { [`plans.${pmk}.${k}`]: v === "" ? deleteField() : k === "note" ? v : Number(v) });
        // строка таблицы план/факт; inverse — для расходов (хорошо, когда факт не больше плана)
        const Line = ({ l, plan, fact, k, inverse, sub, bold }: { l: string; plan: number | null; fact: number | null; k?: string; inverse?: boolean; sub?: boolean; bold?: boolean }) => {
          const pc = plan && fact != null ? Math.round(fact / plan * 100) : null, good = pc != null && (inverse ? pc <= 100 : pc >= 100);
          return <tr className={bold ? "pnl-key" : sub ? "small" : ""}>
            <td style={{ paddingLeft: sub ? 22 : undefined }}>{l}</td>
            <td>{isOwner && k ? <input type="number" style={{ width: 120 }} key={k + pmk + (plan ?? "")} defaultValue={plan ?? ""} onBlur={(e) => e.target.value !== String(plan ?? "") && save(k, e.target.value)} /> : plan != null ? rub(plan) : "—"}</td>
            <td>{fact != null ? rub(fact) : "—"}</td>
            <td className={pc == null ? "muted" : good ? "ok" : "error"}>{pc != null ? pc + "%" : "—"}</td>
          </tr>;
        };
        return <><div className="card" style={{ maxWidth: 640 }}>
          <div className="row">
            <button className="ghost" onClick={() => setPlanMonth(new Date(planMonth.getFullYear(), planMonth.getMonth() - 1, 1))}>‹</button>
            <b>🎯 План на {MONTHS[planMonth.getMonth()].toLowerCase()} {planMonth.getFullYear()}</b>
            <button className="ghost" onClick={() => setPlanMonth(new Date(planMonth.getFullYear(), planMonth.getMonth() + 1, 1))}>›</button>
          </div>
          <table className="pnl-table" style={{ marginTop: 10 }}>
            <thead><tr><th /><th className="small">План</th><th className="small">Факт</th><th className="small">%</th></tr></thead>
            <tbody>
              <Line l="Доходы" plan={pRev} fact={fRev} bold />
              <Line l="Расходы" plan={pExp} fact={fExp} inverse bold />
              <Line l="Чистая прибыль" plan={pProf} fact={fProf} bold />
              <tr><td>Рентабельность</td><td>{pct(pProf, pRev) != null ? pct(pProf, pRev) + "%" : "—"}</td><td>{pct(fProf, fRev) != null ? pct(fProf, fRev) + "%" : "—"}</td><td /></tr>
            </tbody>
          </table>
          {isOwner && <div className="muted small">План доходов — из «📥 Данные от ОП». План расходов — сумма платежей в платёжном календаре ниже.</div>}
          <h3 style={{ marginBottom: 6 }}>📝 Фокус месяца</h3>
          {isOwner ? <textarea rows={4} placeholder="Цели и задачи на месяц: что делаем, на что обратить внимание" key={"n" + pmk} defaultValue={pl.note || ""} onBlur={(e) => e.target.value !== (pl.note || "") && save("note", e.target.value)} />
            : <div className="comment" style={{ whiteSpace: "pre-wrap" }}>{pl.note || "—"}</div>}
        </div>
        <div style={{ maxWidth: 900 }}><PayCalendar p={p} wsId={wsId!} mk={pmk} planRevenue={pRev} isOwner={isOwner}
          startBalance={pnl?.balances ? pnl.balances.accounts.filter((a) => /^1\./.test(a.group)).reduce((x, a) => x + a.balance, 0) : null} /></div></>;
      })()}
    </>
  );
}
