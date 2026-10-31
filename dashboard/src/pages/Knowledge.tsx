// База знаний: обучение для сотрудников. Ведёт владелец, сотрудник смотрит.
// workspaces/{ws}/kb/{id}
import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { normUrl } from "../components/ProjectLinks";

interface Lesson { id: string; title: string; url: string; description?: string; section?: string; course?: string; order: number; }

// Курсы: владелец выбирает курс у каждого урока, сотруднику открывает курс целиком (Админка)
export const COURSES = [{ id: "buh", name: "Курс «Бухгалтерия»", icon: "📒" }, { id: "fin", name: "Курс «Финансы»", icon: "📈" }];

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
  const [f, setF] = useState({ title: "", url: "", description: "", section: "", course: "buh" });
  const col = wsId ? collection(db, "workspaces", wsId, "kb") : null;

  const me = (auth.currentUser?.email || "").toLowerCase();
  const [myCourses, setMyCourses] = useState<string[] | null>(isOwner ? COURSES.map((c) => c.id) : null);
  const [course, setCourse] = useState<string | null>(null);
  // сотрудник: какие курсы ему открыты (карточка staff/{email})
  useEffect(() => wsId && !isOwner && me ? onSnapshot(doc(db, "workspaces", wsId, "staff", me),
    (s) => setMyCourses((s.data()?.courses as string[]) || []), () => setMyCourses([])) : undefined, [wsId, isOwner, me]);
  useEffect(() => {
    if (!col || !myCourses) return;
    const err = (e: any) => setErr(e.code === "permission-denied" ? (isOwner ? "Firebase не пускает: опубликуй свежие правила Firestore" : "Доступ закрыт владельцем") : e.message);
    const parts: Record<string, Lesson[]> = {};
    const put = (k: string) => (s: any) => { parts[k] = s.docs.map((d: any) => ({ id: d.id, ...d.data() })); setList(Object.values(parts).flat().sort((a, b) => a.order - b.order)); };
    const subs = isOwner ? [onSnapshot(col, put("all"), err)] : myCourses.map((c) => onSnapshot(query(col, where("course", "==", c)), put(c), err));
    if (!subs.length) setList([]);
    return () => subs.forEach((u) => u());
  }, [wsId, isOwner, (myCourses || []).join()]);

  if (!isOwner && ws && !ws.open) return <><h1>База знаний</h1><div className="card">🔒 Доступ сейчас закрыт.</div></>;

  async function submit(e: FormEvent) {
    e.preventDefault(); const url = normUrl(f.url);
    if (!f.title.trim() || !url) return alert("Нужны название и ссылка (https://…)");
    try {
      await addDoc(col!, { title: f.title.trim(), url, description: f.description.trim(), section: f.section.trim(), course: f.course, order: Date.now(), createdAt: serverTimestamp() });
      setF({ ...f, title: "", url: "", description: "" }); setErr("");
    } catch (x: any) {
      setErr(x?.code === "permission-denied"
        ? "Firebase не разрешает сохранить урок: обнови правила Firestore (блок «База знаний»)."
        : "Не удалось сохранить: " + (x?.message || x));
    }
  }
  const avail = COURSES.filter((c) => (myCourses || []).includes(c.id));
  const cur = course && avail.some((c) => c.id === course) ? course : null;
  const shown = list.filter((l) => cur ? l.course === cur : isOwner && !l.course);
  const sections = [...new Set(shown.map((l) => l.section || "Общее"))];

  return (
    <>
      <h1>База знаний</h1>
      {err && <div className="error">{err}</div>}
      <div className="course-btns">
        {avail.map((c) => <button key={c.id} className={`course-btn ${cur === c.id ? "on" : ""}`} onClick={() => setCourse(cur === c.id ? null : c.id)}>
          <span>{c.icon}</span><b>{c.name}</b><small>{list.filter((l) => l.course === c.id).length} уроков</small></button>)}
      </div>
      {!isOwner && myCourses && !avail.length && <div className="card muted">Курсы пока не открыты. Попроси Арину открыть доступ 🙂</div>}
      {cur && !shown.length && <div className="card muted">{isOwner ? "В этом курсе пока нет уроков — добавь ниже 👇" : "Уроки скоро появятся 🙂"}</div>}
      {isOwner && !cur && shown.length > 0 && <h3>Без курса (сотрудники не видят)</h3>}
      {(cur || isOwner) && sections.map((sec) => (
        <div key={sec} style={{ marginBottom: 18 }}>
          <h3>{sec}</h3>
          <div className="kb-grid">
            {shown.filter((l) => (l.section || "Общее") === sec).map((l, i, arr) => {
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
          <div className="inline" style={{ margin: 0 }}>{COURSES.map((c) =>
            <button type="button" key={c.id} className={f.course === c.id ? "" : "ghost"} onClick={() => setF({ ...f, course: c.id })}>{c.icon} {c.name}</button>)}</div>
          <input placeholder="Название урока" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input placeholder="Ссылка на видео (YouTube, RuTube, VK, Loom, Яндекс Диск…)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          <input list="kbsec" placeholder="Раздел, например «1С» или «Первая неделя»" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} />
          <datalist id="kbsec">{sections.map((s) => <option key={s} value={s} />)}</datalist>
          <textarea placeholder="Что в уроке (необязательно)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <button style={{ alignSelf: "flex-start" }}>Добавить урок</button>
          <div className="muted small">Сотрудник видит курс, который ты открыла ему в Админке (кнопки «Курс» у сотрудника).</div>
        </form>
      )}
    </>
  );
}
