// Чек-лист месяца по одному проекту: этапы карточками, галочки, комментарии
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { ClientProject, dueDate, Item, Mark, shown, Stage, STAGES, stamp, FLAG_LABEL } from "../lib/catalog";
import { today } from "../lib/store";

// Задачи этапа: из каталога (по данным клиента) + свои задачи владельца; архивные — только по запросу
export function stageItems(p: ClientProject, st: Stage, withArchived = false): Item[] {
  const hid = p.hiddenItems || [];
  const own: Item[] = (p.customItems || []).filter((c) => c.stage === st.id)
    .map((c) => ({ id: c.id, title: c.title, hint: c.hint || "", check: false, only: [], due: c.due ?? null }));
  return [...st.items.filter((it) => shown(it, p.flags || {})), ...own].filter((it) => withArchived || !hid.includes(it.id));
}
export function visibleItems(p: ClientProject) {
  return STAGES.flatMap((s) => stageItems(p, s));
}

export default function Checklist({ p, mk, marks, setMark, readOnly = false, onEdit }: {
  p: ClientProject; mk: string; marks: Record<string, Mark>; setMark: (itemId: string, m: Mark) => Promise<void>; readOnly?: boolean;
  onEdit?: (patch: Partial<ClientProject>) => void;   // владелец: архив и свои задачи
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const hid = p.hiddenItems || [];
  const archive = (id: string) => onEdit?.({ hiddenItems: hid.includes(id) ? hid.filter((x) => x !== id) : [...hid, id] });
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
        const items = stageItems(p, st, !!onEdit);
        if ((!items.length && !onEdit) || (readOnly && st.fin)) return null;
        const head = st.fin && !finShown ? (finShown = true) : false;
        return (
          <div key={st.id}>
            {head && <h3 style={{ marginTop: 24 }}>Задачи финансиста: управленческий учёт</h3>}
            <div className={`stage ${st.fin ? "fin" : ""}`}>
              <div className="stage-h">
                <span className="when">{st.when}</span><b>{st.title}</b>
                <span className="small">{items.filter((it) => !hid.includes(it.id) && marks[it.id]?.done).length} из {items.filter((it) => !hid.includes(it.id)).length}</span>
              </div>
              {items.map((it) => {
                const m = marks[it.id] || {};
                const due = it.due != null ? dueDate(mk, it.due) : null;
                const late = !m.done && due && due < today();
                return (
                  <div key={it.id} className={`mrow ${hid.includes(it.id) ? "archived" : ""}`}>
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
                      {onEdit && <button className="ghost" title={hid.includes(it.id) ? "Вернуть из архива" : "В архив — сотрудник и клиент не увидят"} onClick={() => archive(it.id)}>{hid.includes(it.id) ? "↩" : "🗄"}</button>}
                      {onEdit && (p.customItems || []).some((c) => c.id === it.id) && <button className="ghost" title="Удалить свою задачу"
                        onClick={() => confirm(`Удалить задачу «${it.title}»?`) && onEdit({ customItems: (p.customItems || []).filter((c) => c.id !== it.id) })}>✕</button>}
                    </div>
                    {m.done && <div className="muted small" style={{ paddingLeft: 28 }}>✓ {m.doneAt}{readOnly ? "" : " · " + m.doneBy}</div>}
                    {m.comment && openC !== it.id && <div className="comment small" onClick={() => !readOnly && setOpenC(it.id)}>💬 {m.comment} {!readOnly && <span className="muted">— {m.commentBy}, {m.commentAt}</span>}</div>}
                    {m.reply && <div className="comment small" style={{ borderLeftColor: "var(--accent)" }}>↩ {readOnly ? "Ваш ответ" : "Ответ клиента"}: {m.reply} <span className="muted">· {m.replyAt}</span></div>}
                    {openC === it.id && <textarea autoFocus placeholder="Например: отправила клиенту, ждём ответ" defaultValue={m.comment || ""}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (m.comment || "")) setMark(it.id, { comment: v, commentBy: user!.email || "", commentAt: stamp() }); setOpenC(null); }} />}
                  </div>
                );
              })}
              {onEdit && (adding === st.id
                ? <form className="inline" style={{ padding: "8px 12px", margin: 0 }} onSubmit={(e) => { e.preventDefault();
                    const f = new FormData(e.currentTarget); const title = String(f.get("t") || "").trim(); if (!title) return;
                    const day = Number(f.get("d")) || null;
                    onEdit({ customItems: [...(p.customItems || []), { id: "u" + Date.now().toString(36), stage: st.id, title, hint: String(f.get("h") || "").trim(), due: day }] }); setAdding(null); }}>
                    <input name="t" placeholder="Новая задача" autoFocus style={{ flex: 1, minWidth: 180 }} />
                    <input name="h" placeholder="Подсказка (необязательно)" style={{ flex: 1, minWidth: 160 }} />
                    <input name="d" type="number" min={1} max={31} placeholder="срок, число" style={{ width: 110 }} />
                    <button>Добавить</button><button type="button" className="ghost" onClick={() => setAdding(null)}>Отмена</button></form>
                : <button className="ghost small" style={{ margin: "6px 12px" }} onClick={() => setAdding(st.id)}>+ задача в этот этап</button>)}
            </div>
          </div>
        );
      })}
    </>
  );
}
