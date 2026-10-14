// Модуль «Заявки» — перенос админки antonioavanzato/opora. Данные: только Yandex Cloud.
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  api, AuthError, contactLink, enablePush, exportCsv, fmtDate, Lead, periodFrom, plural,
  recommend, session, shortPain, Status, statusLabel, STATUSES,
} from "./api";
import "./leads.css";

function useToast() {
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 2200); return () => clearTimeout(t); }, [msg]);
  return [msg, setMsg] as const;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api.login(email.trim(), pw); onDone(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="center" style={{ minHeight: "60vh" }}>
      <form className="card login" onSubmit={submit}>
        <h3>Заявки · Yandex Cloud</h3>
        <div className="muted small">Отдельный вход в CRM (не Firebase). Почта и пароль админки заявок.</div>
        <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        <input type="password" placeholder="Пароль" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        {err && <div className="error">{err}</div>}
        <button disabled={busy}>{busy ? "Входим…" : "Войти"}</button>
      </form>
    </div>
  );
}

function Bars({ entries, total }: { entries: [string, number][]; total: number }) {
  return <div className="bars">{entries.map(([k, v]) => (
    <div key={k}><div className="row small"><span>{k}</span><b>{v}</b></div>
      <div className="bar-track"><div className="bar-fill" style={{ width: (total ? Math.round(v / total * 100) : 0) + "%" }} /></div></div>
  ))}</div>;
}
const countBy = (list: Lead[], fn: (l: Lead) => string): [string, number][] => {
  const m = new Map<string, number>(); list.forEach((l) => { const k = fn(l); m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

function Stats({ leads }: { leads: Lead[] }) {
  const [p, setP] = useState("30");
  const from = periodFrom(p);
  const list = leads.filter((l) => !from || new Date(l.createdAt).getTime() >= from);
  const n = list.length;
  const clients = list.filter((l) => l.status === "client").length;
  const funnel: [string, number][] = [["Пришло заявок", n],
    ["Связалась", list.filter((l) => ["contacted", "call", "client"].includes(l.status)).length],
    ["Созвон", list.filter((l) => ["call", "client"].includes(l.status)).length], ["Клиент", clients]];
  return (
    <>
      <div className="chips">{[["7", "7 дней"], ["30", "30 дней"], ["90", "90 дней"], ["all", "Всё"]].map(([v, t]) =>
        <button key={v} className={`chipbtn ${p === v ? "on" : ""}`} onClick={() => setP(v)}>{t}</button>)}</div>
      <div className="bento">
        <div className="card stat"><div className="muted">Заявок</div><b>{n}</b></div>
        <div className="card stat"><div className="muted">Новых, без ответа</div><b>{list.filter((l) => l.status === "new").length}</b></div>
        <div className="card stat"><div className="muted">В работе</div><b>{list.filter((l) => ["contacted", "call"].includes(l.status)).length}</b></div>
        <div className="card stat"><div className="muted">Стали клиентами</div><b>{clients}</b><div className="muted small">{n ? Math.round(clients / n * 100) + "% конверсия" : "—"}</div></div>
        {n ? <>
          <div className="card"><h3>Воронка</h3><Bars entries={funnel} total={n} /></div>
          <div className="card"><h3>С чем приходят</h3><Bars entries={countBy(list, (l) => shortPain(l.pain))} total={n} /></div>
          <div className="card"><h3>Какой пакет подходит</h3><Bars entries={countBy(list, recommend)} total={n} /></div>
          <div className="card"><h3>Сферы</h3><Bars entries={countBy(list, (l) => l.sphere)} total={n} /></div>
          <div className="card"><h3>Форма бизнеса</h3><Bars entries={countBy(list, (l) => l.form)} total={n} /></div>
          <div className="card"><h3>Размер команды</h3><Bars entries={countBy(list, (l) => l.team)} total={n} /></div>
          <div className="card"><h3>Знают свой остаток денег</h3><Bars entries={countBy(list, (l) => l.cash || "Не ответили")} total={n} /></div>
        </> : <div className="muted">За этот период заявок нет.</div>}
      </div>
    </>
  );
}

function Drawer({ lead, onClose, onChange, onDelete, toast }: {
  lead: Lead; onClose: () => void; onChange: (l: Lead) => void; onDelete: (id: string) => void; toast: (s: string) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, []);
  async function setStatus(s: Status) {
    try { onChange(await api.updateLead(lead.id, { status: s })); toast("Статус: " + statusLabel(s)); } catch (e: any) { toast(e.message); }
  }
  async function addNote(e: FormEvent) {
    e.preventDefault(); const t = note.trim(); if (!t) return;
    try { onChange(await api.addNote(lead.id, t)); setNote(""); toast("Заметка добавлена"); } catch (x: any) { toast(x.message); }
  }
  async function del() {
    if (!confirm(`Удалить заявку «${lead.name}»? Это нельзя отменить.`)) return;
    try { await api.deleteLead(lead.id); onDelete(lead.id); toast("Заявка удалена"); } catch (e: any) { toast(e.message); }
  }
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Заявка">
        <div className="row"><div><h2 style={{ margin: 0 }}>{lead.name}</h2><div className="muted small">Заявка · {fmtDate(lead.createdAt)}</div></div>
          <button className="ghost" onClick={onClose} aria-label="Закрыть">✕</button></div>
        <div className="inline" style={{ marginTop: 12 }}>
          <a className="btnlink" href={contactLink(lead)} target="_blank" rel="noopener">{lead.contactType === "Телефон" ? "Позвонить" : "Написать в Telegram"}</a>
          <button className="ghost" onClick={() => navigator.clipboard?.writeText(lead.contact).then(() => toast("Контакт скопирован"), () => toast(lead.contact))}>Скопировать контакт</button>
        </div>
        <h3>Статус</h3>
        <div className="chips">{STATUSES.map((s) =>
          <button key={s.id} className={`chipbtn ${lead.status === s.id ? "on" : ""}`} onClick={() => setStatus(s.id)}>{s.label}</button>)}</div>
        <h3>Ответы квиза</h3>
        <dl className="kv">
          <dt>{lead.contactType}</dt><dd>{lead.contact}</dd>
          <dt>Запрос</dt><dd>{lead.pain}</dd>
          <dt>Форма</dt><dd>{lead.form}</dd>
          <dt>Сфера</dt><dd>{lead.sphere}</dd>
          <dt>Сотрудников</dt><dd>{lead.team}</dd>
          {lead.cash && <><dt>Знает остаток</dt><dd>{lead.cash}</dd></>}
          <dt>Подходит</dt><dd><span className="pkg">{recommend(lead)}</span></dd>
        </dl>
        <h3>Заметки</h3>
        <form onSubmit={addNote} className="inline">
          <textarea placeholder="Например: созвон в четверг в 15:00" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <button>Добавить заметку</button>
        </form>
        {(lead.notes || []).slice().reverse().map((n, i) => <div key={i} className="note"><div className="muted small">{fmtDate(n.at)}</div>{n.text}</div>)}
        {!lead.notes?.length && <div className="muted small">Заметок пока нет.</div>}
        <button className="danger" style={{ marginTop: 24, width: "100%" }} onClick={del}>Удалить заявку</button>
        <div className="muted small">Заявка удалится из админки и с сервера без возможности восстановления.</div>
      </aside>
    </>
  );
}

export default function Leads() {
  const [authed, setAuthed] = useState(!!session());
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"list" | "stats">("list");
  const [q, setQ] = useState(""); const [status, setStatus] = useState("all");
  const [pain, setPain] = useState("all"); const [period, setPeriod] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selMode, setSelMode] = useState(false); const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, toast] = useToast();

  const load = useCallback(async (silent = true) => {
    try {
      const list = (await api.listLeads()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setLeads((prev) => {
        const fresh = prev ? list.filter((l) => !prev.some((p) => p.id === l.id)).length : 0;
        if (!silent || fresh) toast(fresh ? "Новых заявок: " + fresh : "Обновлено");
        return list;
      });
      setErr("");
    } catch (e: any) {
      if (e instanceof AuthError) setAuthed(false); else setErr(e.message);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    load();
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    const t = setInterval(vis, 60000);
    return () => { document.removeEventListener("visibilitychange", vis); clearInterval(t); };
  }, [authed]);

  const list = useMemo(() => {
    if (!leads) return [];
    const s = q.trim().toLowerCase(); const from = periodFrom(period);
    return leads.filter((l) => (status === "all" || l.status === status) && (pain === "all" || l.pain === pain) &&
      (!from || new Date(l.createdAt).getTime() >= from) &&
      (!s || [l.name, l.contact, l.sphere, l.pain].join(" ").toLowerCase().includes(s)));
  }, [leads, q, status, pain, period]);

  if (!authed) return <><h1>Заявки</h1><Login onDone={() => setAuthed(true)} /></>;
  if (!leads) return <><h1>Заявки</h1>{err ? <div className="card"><div className="error">{err}</div>
    <button style={{ marginTop: 10 }} onClick={() => load(false)}>↻ Повторить</button></div> : <div className="muted">Загружаем заявки…</div>}</>;

  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, leads.filter((l) => l.status === s.id).length]));
  const pains = [...new Set(leads.map((l) => l.pain))];
  const open = leads.find((l) => l.id === openId);
  const upd = (l: Lead) => setLeads(leads.map((x) => (x.id === l.id ? l : x)));
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const click = (id: string) => (selMode ? toggle(id) : setOpenId(id));

  async function bulk(action: "status" | "delete", st?: Status) {
    const n = sel.size;
    if (action === "delete" && !confirm(`Удалить ${n} ${plural(n, "заявку", "заявки", "заявок")}? Это нельзя отменить.`)) return;
    try {
      const res = await api.bulkLeads([...sel], action, st); const done = new Set(res.done || []);
      setLeads(action === "delete" ? leads!.filter((l) => !done.has(l.id)) : leads!.map((l) => (done.has(l.id) ? { ...l, status: st! } : l)));
      toast(action === "delete" ? `Удалено: ${done.size}` : `${done.size} → ${statusLabel(st!)}`);
      setSelMode(false); setSel(new Set());
    } catch (e: any) { toast(e.message); }
  }

  return (
    <>
      <h1>Заявки <span className="badge">{leads.length} всего{counts.new ? ` · ${counts.new} новых` : ""}</span></h1>
      <div className="inline">
        <button className={tab === "list" ? "" : "ghost"} onClick={() => setTab("list")}>Список</button>
        <button className={tab === "stats" ? "" : "ghost"} onClick={() => setTab("stats")}>Сводка</button>
        <span style={{ flex: 1 }} />
        <button className="ghost" onClick={() => load(false)}>↻ Обновить</button>
        <button className="ghost" onClick={async () => toast(await enablePush().catch((e) => e.message))}>🔔 Уведомления</button>
        <button className="ghost" onClick={() => { api.logout(); setAuthed(false); setLeads(null); }}>Выйти из CRM</button>
      </div>
      {err && <div className="error">{err}</div>}

      {tab === "stats" ? <Stats leads={leads} /> : <>
        <div className="inline">
          <input type="search" placeholder="Поиск: имя, контакт, сфера" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={pain} onChange={(e) => setPain(e.target.value)}>
            <option value="all">Все запросы</option>{pains.map((p) => <option key={p} value={p}>{shortPain(p)}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {[["all", "За всё время"], ["7", "7 дней"], ["30", "30 дней"], ["90", "90 дней"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <button className="ghost" onClick={() => { setSelMode(!selMode); setSel(new Set()); }}>{selMode ? "Отмена" : "Выбрать"}</button>
          <button className="ghost" onClick={() => exportCsv(list)}>Выгрузить CSV</button>
        </div>
        <div className="chips">
          <button className={`chipbtn ${status === "all" ? "on" : ""}`} onClick={() => setStatus("all")}>Все <b>{leads.length}</b></button>
          {STATUSES.map((s) => <button key={s.id} className={`chipbtn ${status === s.id ? "on" : ""}`} onClick={() => setStatus(s.id)}>{s.label} <b>{counts[s.id] || 0}</b></button>)}
        </div>

        {list.length ? <>
          <div className="card lead-table">
            <table><thead><tr>{selMode && <th />}<th>Клиент</th><th>Запрос и бизнес</th><th>Пакет</th><th>Статус</th><th>Пришла</th></tr></thead>
              <tbody>{list.map((l) => (
                <tr key={l.id} onClick={() => click(l.id)} className={sel.has(l.id) ? "sel" : ""} style={{ cursor: "pointer" }}>
                  {selMode && <td><input type="checkbox" readOnly checked={sel.has(l.id)} /></td>}
                  <td><b>{l.name}</b><div className="muted small">{l.contactType}: {l.contact}</div></td>
                  <td>{shortPain(l.pain)}<div className="muted small">{l.form} · {l.sphere} · {l.team}</div></td>
                  <td><span className="pkg">{recommend(l)}</span></td>
                  <td><span className={`lst lst-${l.status}`}>{statusLabel(l.status)}</span></td>
                  <td className="muted small">{fmtDate(l.createdAt)}</td>
                </tr>))}</tbody></table>
          </div>
          <div className="lead-cards">{list.map((l) => (
            <div key={l.id} className={`card lead ${sel.has(l.id) ? "sel" : ""}`} onClick={() => click(l.id)}>
              <div className="row">{selMode && <input type="checkbox" readOnly checked={sel.has(l.id)} />}
                <div style={{ flex: 1 }}><b>{l.name}</b><div className="muted small">{fmtDate(l.createdAt)}</div></div>
                <span className={`lst lst-${l.status}`}>{statusLabel(l.status)}</span></div>
              <div>{shortPain(l.pain)}</div>
              <div className="row"><span className="muted small">{l.form} · {l.sphere} · {l.team}</span><span className="pkg">{recommend(l)}</span></div>
            </div>))}</div>
        </> : <div className="muted">{leads.length ? "По фильтрам ничего не найдено." : "Заявок пока нет. Как только кто-то пройдёт квиз на сайте, заявка появится здесь."}</div>}

        {selMode && <div className="selbar card">
          <b>Выбрано: {sel.size}</b>
          <button className="ghost" onClick={() => setSel(list.every((l) => sel.has(l.id)) ? new Set() : new Set(list.map((l) => l.id)))}>
            {list.every((l) => sel.has(l.id)) ? "Снять все" : `Выбрать все (${list.length})`}</button>
          <select disabled={!sel.size} value="" onChange={(e) => e.target.value && bulk("status", e.target.value as Status)}>
            <option value="">Статус…</option>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <button className="danger" disabled={!sel.size} onClick={() => bulk("delete")}>Удалить</button>
        </div>}
      </>}

      {open && <Drawer lead={open} onClose={() => setOpenId(null)} onChange={upd}
        onDelete={(id) => { setLeads(leads.filter((l) => l.id !== id)); setOpenId(null); }} toast={toast} />}
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
