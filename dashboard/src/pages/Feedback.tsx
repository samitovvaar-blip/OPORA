// Обратная связь: сотрудник пишет предложение / проблему / вопрос, владелец читает и отвечает.
// workspaces/{ws}/feedback/{id}
import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";

type Kind = "idea" | "problem" | "question" | "thanks";
const KINDS: [Kind, string][] = [["idea", "💡 Предложение"], ["problem", "⚠ Проблема"], ["question", "❓ Вопрос"], ["thanks", "💛 Спасибо"]];
const STATUS: Record<string, string> = { new: "Новое", seen: "Прочитано", done: "Решено" };
interface Item { id: string; kind: Kind; text: string; from: string; status: string; reply?: string; at?: any; }
const when = (t: any) => (t?.toDate ? t.toDate().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function Feedback() {
  const { user } = useAuth();
  const { wsId, isOwner, ws } = useWorkspace();
  const email = (user?.email || "").toLowerCase();
  const [list, setList] = useState<Item[]>([]);
  const [kind, setKind] = useState<Kind>("idea");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("all");
  const col = wsId ? collection(db, "workspaces", wsId, "feedback") : null;

  useEffect(() => col ? onSnapshot(isOwner ? col : query(col, where("from", "==", email)),
    (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, "id">) }))
      .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0))), () => {}) : undefined, [wsId, isOwner]);

  if (!isOwner && ws && !ws.open) return <><h1>Обратная связь</h1><div className="card">🔒 Доступ сейчас закрыт.</div></>;

  async function send(e: FormEvent) {
    e.preventDefault(); if (!text.trim()) return;
    try {
      await addDoc(col!, { kind, text: text.trim().slice(0, 3000), from: email, status: "new", at: serverTimestamp() });
      setText(""); setMsg("Отправлено, спасибо! 🙌");
    } catch { setMsg("Не удалось отправить. Попробуй позже."); }
    setTimeout(() => setMsg(""), 3000);
  }
  const shown = list.filter((x) => filter === "all" || x.status === filter);
  const label = (k: Kind) => KINDS.find(([x]) => x === k)?.[1] || k;

  return (
    <>
      <h1>Обратная связь {isOwner && list.some((x) => x.status === "new") && <span className="badge b-new">{list.filter((x) => x.status === "new").length} новых</span>}</h1>

      {!isOwner && (
        <form className="card" onSubmit={send} style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <div className="muted small">Идеи, что улучшить, что мешает работать, вопросы — пиши как есть. Это видит только руководитель.</div>
          <div className="chips" style={{ margin: 0 }}>{KINDS.map(([k, l]) =>
            <button key={k} type="button" className={`chipbtn ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{l}</button>)}</div>
          <textarea placeholder="Напиши здесь…" value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} style={{ minHeight: 120 }} />
          <button style={{ alignSelf: "flex-start" }}>Отправить</button>
          {msg && <div className="small">{msg}</div>}
        </form>
      )}

      {isOwner && <div className="chips">{[["all", "Все"], ["new", "Новые"], ["seen", "Прочитано"], ["done", "Решено"]].map(([k, l]) =>
        <button key={k} className={`chipbtn ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}</div>}
      {!isOwner && list.length > 0 && <h3>Мои сообщения</h3>}

      <div className="list" style={{ maxWidth: 720 }}>
        {shown.map((x) => (
          <div key={x.id} className="card" style={{ borderLeft: x.status === "new" ? "4px solid var(--accent)" : undefined }}>
            <div className="row"><b>{label(x.kind)}</b><span className="muted small">{when(x.at)} · {STATUS[x.status] || x.status}</span></div>
            {isOwner && <div className="muted small">{x.from}</div>}
            <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{x.text}</div>
            {x.reply && !isOwner && <div className="comment small" style={{ marginTop: 8 }}>💬 Ответ: {x.reply}</div>}
            {isOwner && <>
              <textarea placeholder="Ответ сотруднику (увидит у себя)" defaultValue={x.reply || ""} style={{ marginTop: 8, minHeight: 50 }}
                onBlur={(e) => e.target.value.trim() !== (x.reply || "") && updateDoc(doc(col!, x.id), { reply: e.target.value.trim(), status: x.status === "new" ? "seen" : x.status })} />
              <div className="inline" style={{ margin: "6px 0 0" }}>
                {Object.entries(STATUS).map(([k, l]) => <button key={k} className={x.status === k ? "" : "ghost"} onClick={() => updateDoc(doc(col!, x.id), { status: k })}>{l}</button>)}
                <button className="ghost" onClick={() => confirm("Удалить сообщение?") && deleteDoc(doc(col!, x.id))}>✕</button>
              </div>
            </>}
          </div>))}
        {!shown.length && <div className="muted small">{isOwner ? "Сообщений нет" : "Ты пока ничего не отправлял(а)"}</div>}
      </div>
    </>
  );
}
