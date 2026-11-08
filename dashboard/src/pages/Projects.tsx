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
import NewClientWizard from "../components/NewClientWizard";
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
  // демо-кабинеты для показа клиентам: товарный (отчёт без таблицы) и «Услуги» (с данными мини-CRM)
  const [demoBusy, setDemoBusy] = useState(false);
  async function createDemo() {
    if (!col || !confirm("Создать два демо-кабинета: «ДЕМО · Товары» и «ДЕМО · Услуги»?")) return;
    setDemoBusy(true);
    try {
      const { demoServices } = await import("../lib/demo");
      const mk = monthKey(new Date());
      await addDoc(col, { name: "ДЕМО · Товары", flags: { org_ip: true, usn: true, mp: true, sklad: true }, links: {}, monthlyOpen: false, calendarOpen: false, createdAt: serverTimestamp(),
        bizType: "goods", pnlUrl: "demo:goods", clientEmails: [], clientOpen: false, staffEmails: [],
        kpi: { [mk]: { units: 420, orders: 380, newClients: 160 } }, planSales: { [mk]: 1200000 } });
      const r = await addDoc(col, { name: "ДЕМО · Услуги", flags: { org_ip: true, usn: true }, links: {}, monthlyOpen: false, calendarOpen: false, createdAt: serverTimestamp(),
        bizType: "services", clientEmails: [], clientOpen: false, staffEmails: [] });
      const crm = collection(db, "workspaces", wsId!, "clients", r.id, "crm"), d = demoServices(), ids: Record<string, string> = {};
      const put = async (ref: string | undefined, data: object) => { const x = await addDoc(crm, data); if (ref) ids[ref] = x.id; };
      for (const x of d.products) await put(x.ref, { kind: "product", name: x.name, price: x.price, descr: x.descr });
      for (const x of d.clients) await put(x.ref, { kind: "client", name: x.name, company: x.company, phone: x.phone, source: x.source, status: x.status, created: d.start });
      for (const x of d.projects) await put(x.ref, { kind: "project", name: x.name, clientId: ids[x.clientRef], productIds: x.productRefs.map((k) => ids[k]), price: x.price, status: "work", start: d.start, monthly: true, payDay: x.payDay });
      for (const x of d.regulars) await put(x.ref, { kind: "regular", name: x.name, amount: x.amount, day: x.day, category: x.category, account: x.account });
      for (const x of d.staff) await put(undefined, { kind: "employee", name: x.name, contact: x.contact, projectIds: x.projectRefs.map((k) => ids[k]), payType: x.payType, amount: x.amount, day: x.day });
      for (const m of d.moves as Record<string, unknown>[]) { const { projectRef, regularRef, ...rest } = m as { projectRef?: string; regularRef?: string };
        await put(undefined, { ...rest, ...(projectRef ? { projectId: ids[projectRef] } : {}), ...(regularRef ? { regularId: ids[regularRef] } : {}) }); }
      alert("Готово! Демо-кабинеты появились в списке клиентов. Открой «👁 Как видит клиент».");
    } catch (e) { alert("Не получилось: " + (e instanceof Error ? e.message : e)); }
    setDemoBusy(false);
  }
  const preview = STAGES.map((s) => ({ s, n: s.items.filter((it) => shown(it, flags)).length })).filter((x) => x.n);
  const total = preview.reduce((a, x) => a + x.n, 0);
  const withDue = STAGES.flatMap((s) => s.items).filter((it) => shown(it, flags) && it.due != null).length;

  return (
    <>
      <h1>Проекты</h1>
      {error && <div className="error">{error}</div>}
      {!creating ? <span><button onClick={() => setCreating(true)}>+ Новый клиент</button> <button className="ghost" disabled={demoBusy} onClick={createDemo}>{demoBusy ? "Создаю…" : "🎭 Демо-кабинеты"}</button></span>
        : fromClient ? <form className="card" onSubmit={create} style={{ maxWidth: 860 }}>
            <h3>Новый проект из клиента</h3>
            <input placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
            <FlagPicker flags={flags} onChange={setFlags} />
            <div className="inline" style={{ marginTop: 10 }}><button>Создать</button><button type="button" className="ghost" onClick={() => setCreating(false)}>Отмена</button></div>
          </form>
        : <NewClientWizard defaultName={name} onClose={() => setCreating(false)} />}

      <div style={{ marginTop: 16 }}><Monthly embedded /></div>

      {old.items.length > 0 && <details style={{ marginTop: 24 }}><summary className="muted">Личные проекты (старые) — {old.items.length}</summary>
        <div className="bento" style={{ marginTop: 8 }}>{old.items.map((p) => (
          <div key={p.id} className="card"><div className="row"><b>{p.name}</b><button className="ghost" onClick={() => old.remove(p.id)}>✕</button></div>
            <div className="muted small">{p.progress}%{p.deadline ? ` · до ${p.deadline}` : ""}</div></div>))}</div></details>}
    </>
  );
}
