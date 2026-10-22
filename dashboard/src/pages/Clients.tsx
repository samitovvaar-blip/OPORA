import { FormEvent, useState } from "react";
import { useCollection } from "../lib/store";
import { Client, ClientStatus, clientStatuses } from "../lib/types";
import Funnel from "../components/Funnel";
import { LINK_FIELDS, LinkButtons, LinkEditor, Links, normUrl } from "../components/ProjectLinks";

const empty: Client = { name: "", contact: "", source: "", service: "", status: "new", note: "" };

export default function Clients() {
  const { items, error, add, update, remove } = useCollection<Client>("clients");
  const [form, setForm] = useState<Client>(empty);
  const [links, setLinks] = useState<Links>({});
  const [q, setQ] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [open, setOpen] = useState<string | null>(null);

  const shown = items.filter((c) => (c.name + c.contact + c.service).toLowerCase().includes(q.toLowerCase()));

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!form.name.trim()) return;
    const clean: Links = {};
    for (const [k] of LINK_FIELDS) {
      const raw = links[k] || ""; const v = normUrl(raw);
      if (raw.trim() && !v) return alert("Ссылка должна начинаться с https:// (или @ник для Telegram)");
      if (v) clean[k] = v;
    }
    await add({ ...form, links: clean }); setForm(empty); setLinks({});
  }

  const Card = ({ c }: { c: Client & { id: string } }) => (
    <div className="card lead">
      <div className="row"><b onClick={() => setOpen(open === c.id ? null : c.id)} style={{ cursor: "pointer" }}>{c.name}</b>
        <select value={c.status} onChange={(e) => update(c.id, { status: e.target.value as ClientStatus })}>
          {clientStatuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select></div>
      <div className="muted small">{[c.contact, c.service, c.source].filter(Boolean).join(" · ")}</div>
      <LinkButtons links={c.links} />
      {c.projectId
        ? <a className="small" href={"#/monthly?p=" + c.projectId}>◆ Проект: ежемесячные задачи →</a>
        : <a className="small" href={`#/projects?new=${encodeURIComponent(c.name)}&client=${c.id}`}>+ Сделать проектом</a>}
      {open === c.id && <>
        <textarea placeholder="Заметки о клиенте" defaultValue={c.note} onBlur={(e) => update(c.id, { note: e.target.value })} />
        <LinkEditor links={c.links} onChange={(l) => update(c.id, { links: l })} />
        <button className="ghost" onClick={() => confirm(`Удалить ${c.name}?`) && remove(c.id)}>Удалить</button>
      </>}
    </div>
  );

  return (
    <>
      <h1>Клиенты <span className="badge">{items.length}</span></h1>
      {error && <div className="error">Firestore: {error}</div>}
      <Funnel />
      <form className="card" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <div className="inline" style={{ margin: 0 }}>
        <input placeholder="Имя *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Телефон / Telegram" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        <input placeholder="Услуга" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
        <input placeholder="Откуда пришёл" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        </div>
        <div className="inline" style={{ margin: 0 }}>
          {LINK_FIELDS.map(([k, label, ph]) => (
            <input key={k} placeholder={`${label}: ${ph.toLowerCase()}`} value={links[k] || ""}
              onChange={(e) => setLinks({ ...links, [k]: e.target.value })} style={{ flex: 1, minWidth: 200 }} />))}
        </div>
        <button style={{ alignSelf: "flex-start" }}>Добавить клиента</button>
      </form>
      <div className="inline">
        <input placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={view === "board" ? "" : "ghost"} onClick={() => setView("board")}>Доска</button>
        <button className={view === "list" ? "" : "ghost"} onClick={() => setView("list")}>Список</button>
      </div>
      {view === "board" ? (
        <div className="kanban">
          {clientStatuses.map((s) => (
            <div key={s.id} className="col">
              <div className="col-head">{s.label} <span className="muted">{shown.filter((c) => c.status === s.id).length}</span></div>
              {shown.filter((c) => c.status === s.id).map((c) => <Card key={c.id} c={c} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="list">{shown.map((c) => <Card key={c.id} c={c} />)}</div>
      )}
      {!items.length && <div className="muted">Пока нет клиентов — добавь первого сверху</div>}
    </>
  );
}
