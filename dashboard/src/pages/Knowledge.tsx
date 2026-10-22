// База знаний: обучение для сотрудников. Ведёт владелец, сотрудник смотрит.
// workspaces/{ws}/kb/{id}
import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { normUrl } from "../components/ProjectLinks";

interface Lesson { id: string; title: string; url: string; description?: string; section?: string; order: number; }

// YouTube / RuTube / VK Видео / Loom — встраиваем плеер; остальное — ссылкой
function embedUrl(u: string) {
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/rutube\.ru\/video\/([\w]+)/); if (m) return `https://rutube.ru/play/embed/${m[1]}`;
  m = u.match(/loom\.com\/share\/([\w]+)/); if (m) return `https://www.loom.com/embed/${m[1]}`;
  m = u.match(/vk(?:video)?\.(?:com|ru)\/video(-?\d+)_(\d+)/); if (m) return `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}`;
  return null;
}

export default function Knowledge() {
  const { wsId, isOwner, ws } = useWorkspace();
  const [list, setList] = useState<Lesson[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState({ title: "", url: "", description: "", section: "" });
  const col = wsId ? collection(db, "workspaces", wsId, "kb") : null;

  useEffect(() => col ? onSnapshot(col, (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lesson, "id">) })).sort((a, b) => a.order - b.order)),
    (e) => setErr(e.code === "permission-denied" ? "Доступ закрыт владельцем" : e.message)) : undefined, [wsId]);

  if (!isOwner && ws && !ws.open) return <><h1>База знаний</h1><div className="card">🔒 Доступ сейчас закрыт.</div></>;

  async function submit(e: FormEvent) {
    e.preventDefault(); const url = normUrl(f.url);
    if (!f.title.trim() || !url) return alert("Нужны название и ссылка (https://…)");
    await addDoc(col!, { title: f.title.trim(), url, description: f.description.trim(), section: f.section.trim(), order: Date.now(), createdAt: serverTimestamp() });
    setF({ ...f, title: "", url: "", description: "" });
  }
  const sections = [...new Set(list.map((l) => l.section || "Общее"))];

  return (
    <>
      <h1>База знаний</h1>
      {err && <div className="error">{err}</div>}
      {!list.length && <div className="card muted">{isOwner ? "Добавь первый урок ниже 👇" : "Уроки скоро появятся 🙂"}</div>}
      {sections.map((sec) => (
        <div key={sec} style={{ marginBottom: 18 }}>
          <h3>{sec}</h3>
          <div className="kb-grid">
            {list.filter((l) => (l.section || "Общее") === sec).map((l, i, arr) => {
              const emb = embedUrl(l.url);
              return (
                <div key={l.id} className="card kb">
                  <div className="row"><b>▶ {l.title}</b>
                    {isOwner && <span>
                      <button className="ghost" disabled={!i} onClick={() => { const p = arr[i - 1]; updateDoc(doc(col!, l.id), { order: p.order }); updateDoc(doc(col!, p.id), { order: l.order }); }}>↑</button>
                      <button className="ghost" onClick={() => confirm(`Удалить «${l.title}»?`) && deleteDoc(doc(col!, l.id))}>✕</button></span>}
                  </div>
                  {l.description && <div className="muted small">{l.description}</div>}
                  {open === l.id && emb
                    ? <div className="kb-video"><iframe src={emb} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={l.title} /></div>
                    : <div className="inline" style={{ marginTop: 8 }}>
                        {emb && <button onClick={() => setOpen(l.id)}>▶ Смотреть здесь</button>}
                        <a className="linkbtn" href={l.url} target="_blank" rel="noopener noreferrer">Открыть ссылку ↗</a>
                      </div>}
                </div>);
            })}
          </div>
        </div>
      ))}

      {isOwner && (
        <form className="card" onSubmit={submit} style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 8 }}>
          <h3>+ Новый урок</h3>
          <input placeholder="Название урока" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input placeholder="Ссылка на видео (YouTube, RuTube, VK, Loom, Яндекс Диск…)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          <input list="kbsec" placeholder="Раздел, например «1С» или «Первая неделя»" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} />
          <datalist id="kbsec">{sections.map((s) => <option key={s} value={s} />)}</datalist>
          <textarea placeholder="Что в уроке (необязательно)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <button style={{ alignSelf: "flex-start" }}>Добавить урок</button>
          <div className="muted small">Сотрудник видит базу знаний, когда в Админке открыт доступ.</div>
        </form>
      )}
    </>
  );
}
