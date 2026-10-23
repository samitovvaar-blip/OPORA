// Чек-лист месяца по одному проекту: этапы карточками, галочки, комментарии
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { ClientProject, dueDate, Mark, shown, STAGES, stamp, FLAG_LABEL } from "../lib/catalog";
import { today } from "../lib/store";

export function visibleItems(p: ClientProject) {
  return STAGES.flatMap((s) => s.items.filter((it) => shown(it, p.flags || {})));
}

export default function Checklist({ p, mk, marks, setMark, readOnly = false }: {
  p: ClientProject; mk: string; marks: Record<string, Mark>; setMark: (itemId: string, m: Mark) => Promise<void>; readOnly?: boolean;
}) {
  const { user } = useAuth();
  const [openC, setOpenC] = useState<string | null>(null);
  const all = visibleItems(p);
  const done = all.filter((it) => marks[it.id]?.done).length;
  let finShown = false;

  const toggle = (id: string) => marks[id]?.done
    ? setMark(id, { done: false, doneBy: "", doneAt: "" })
    : setMark(id, { done: true, doneBy: user!.email || "", doneAt: stamp() });

  return (
    <>
      <div className="progress"><div style={{ width: (all.length ? done / all.length * 100 : 0) + "%" }} /></div>
      <div className="muted small">Выполнено {done} из {all.length} задач по клиенту</div>
      {STAGES.map((st) => {
        const items = st.items.filter((it) => shown(it, p.flags || {}));
        if (!items.length || (readOnly && st.fin)) return null;
        const head = st.fin && !finShown ? (finShown = true) : false;
        return (
          <div key={st.id}>
            {head && <h3 style={{ marginTop: 24 }}>Задачи финансиста: управленческий учёт</h3>}
            <div className={`stage ${st.fin ? "fin" : ""}`}>
              <div className="stage-h">
                <span className="when">{st.when}</span><b>{st.title}</b>
                <span className="small">{items.filter((it) => marks[it.id]?.done).length} из {items.length}</span>
              </div>
              {items.map((it) => {
                const m = marks[it.id] || {};
                const due = it.due != null ? dueDate(mk, it.due) : null;
                const late = !m.done && due && due < today();
                return (
                  <div key={it.id} className="mrow">
                    <div className="row" style={{ alignItems: "flex-start" }}>
                      <label className={`task ${m.done ? "done" : ""}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!m.done} disabled={readOnly} onChange={() => toggle(it.id)} style={{ marginTop: 3 }} />
                        <span><b style={{ fontWeight: 600 }}>{it.title}</b>
                          <div className="muted small">{it.hint}</div>
                          <div className="tags">
                            {it.only.map((f) => <span key={f} className="tagc">{FLAG_LABEL[f]}</span>)}
                            {it.check && <span className="tagc warn">сверить</span>}
                            {due && <span className={`tagc ${late ? "late" : ""}`}>до {Number(due.slice(8))}.{due.slice(5, 7)}{late ? " ⚠" : ""}</span>}
                          </div></span>
                      </label>
                      {!readOnly && <button className="ghost" title="Комментарий" onClick={() => setOpenC(openC === it.id ? null : it.id)}>💬{m.comment ? "•" : ""}</button>}
                    </div>
                    {m.done && <div className="muted small" style={{ paddingLeft: 28 }}>✓ {m.doneAt}{readOnly ? "" : " · " + m.doneBy}</div>}
                    {m.comment && openC !== it.id && <div className="comment small" onClick={() => !readOnly && setOpenC(it.id)}>💬 {m.comment} {!readOnly && <span className="muted">— {m.commentBy}, {m.commentAt}</span>}</div>}
                    {openC === it.id && <textarea autoFocus placeholder="Например: отправила клиенту, ждём ответ" defaultValue={m.comment || ""}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (m.comment || "")) setMark(it.id, { comment: v, commentBy: user!.email || "", commentAt: stamp() }); setOpenC(null); }} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
