// Проекты-клиенты: при создании выбираются данные клиента, и под них
// собирается список ежемесячных задач (каталог в lib/catalog.ts).
import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { useClientProjects, useMarks } from "../lib/clients";
import { Flag, FLAG_LABEL, monthKey, shown, STAGES } from "../lib/catalog";
import { visibleItems } from "../components/Checklist";
import FlagPicker from "../components/FlagPicker";
import Monthly from "./Monthly";
import Payments from "../components/Payments";
import { Links, LinkButtons, LinkEditor } from "../components/ProjectLinks";
import { useCollection } from "../lib/store";
import { Client, Project } from "../lib/types";

export default function Projects() {
  const { wsId } = useWorkspace();
  const { list, error } = useClientProjects();
  const mk = monthKey(new Date());
  const { marks } = useMarks(list.map((p) => p.id), mk);
  const qs = new URLSearchParams(location.hash.split("?")[1]);
  const fromClient = qs.get("client");
  const [creating, setCreating] = useState(!!qs.get("new"));
  const [name, setName] = useState(qs.get("new") || "");
  const [flags, setFlags] = useState<Partial<Record<Flag, boolean>>>({});
  const [links, setLinks] = useState<Links>({});
  const old = useCollection<Project>("projects");
  const clients = useCollection<Client>("clients");
  const src = fromClient ? clients.items.find((c) => c.id === fromClient) : undefined;
  useEffect(() => { if (src?.links && !Object.keys(links).length) setLinks(src.links); }, [src?.id]);

  const col = wsId ? collection(db, "workspaces", wsId, "clients") : null;
  async function create(e: FormEvent) {
    e.preventDefault(); if (!col || !name.trim()) return;
    const r = await addDoc(col, { name: name.trim(), flags, links, monthlyOpen: false, calendarOpen: false, createdAt: serverTimestamp() });
    // создан из карточки клиента — связываем и переводим клиента «В работу»
    if (fromClient) await clients.update(fromClient, { projectId: r.id, status: "work" });
    setName(""); setFlags({}); setLinks({}); setCreating(false);
    location.hash = "#/projects?p=" + r.id;
  }
  const preview = STAGES.map((s) => ({ s, n: s.items.filter((it) => shown(it, flags)).length })).filter((x) => x.n);
  const total = preview.reduce((a, x) => a + x.n, 0);
  const withDue = STAGES.flatMap((s) => s.items).filter((it) => shown(it, flags) && it.due != null).length;

  return (
    <>
      <h1>Проекты</h1>
      {error && <div className="error">{error}</div>}
      {!creating ? <button onClick={() => setCreating(true)}>+ Новый проект</button> : (
        <form className="card" onSubmit={create} style={{ maxWidth: 860 }}>
          <h3>Новый проект{fromClient ? " из клиента" : ""}</h3>
          <input placeholder="Клиент / название проекта" value={name} onChange={(e) => setName(e.target.value)} autoFocus style={{ width: "100%" }} />
          <div style={{ marginTop: 10 }}><b>Что есть у клиента?</b> <span className="muted small">Нажми — список задач подстроится</span></div>
          <FlagPicker flags={flags} onChange={setFlags} />
          <div style={{ marginTop: 10 }}><b>Ссылки</b> <span className="muted small">по желанию, можно добавить позже</span></div>
          <LinkEditor key={Object.values(links).join("|")} links={links} onChange={setLinks} />
          <div className="card" style={{ background: "var(--bg)", marginTop: 8 }}>
            <b>Ежемесячные задачи: {total}</b> <span className="muted small">· {withDue} со сроком попадут в календарь</span>
            {preview.map(({ s, n }) => (
              <details key={s.id} className="small" style={{ marginTop: 6 }}>
                <summary><span className="tagc">{s.when}</span> {s.title} — {n}</summary>
                <ul>{s.items.filter((it) => shown(it, flags)).map((it) => <li key={it.id}>{it.title}</li>)}</ul>
              </details>
            ))}
          </div>
          <div className="inline" style={{ marginTop: 10 }}>
            <button>Создать проект</button>
            <button type="button" className="ghost" onClick={() => setCreating(false)}>Отмена</button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 16 }}><Monthly embedded /></div>

      {old.items.length > 0 && <details style={{ marginTop: 24 }}><summary className="muted">Личные проекты (старые) — {old.items.length}</summary>
        <div className="bento" style={{ marginTop: 8 }}>{old.items.map((p) => (
          <div key={p.id} className="card"><div className="row"><b>{p.name}</b><button className="ghost" onClick={() => old.remove(p.id)}>✕</button></div>
            <div className="muted small">{p.progress}%{p.deadline ? ` · до ${p.deadline}` : ""}</div></div>))}</div></details>}
    </>
  );
}
