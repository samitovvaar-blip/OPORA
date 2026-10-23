// Отчёт клиенту за месяц: что сделано, чего ждём от клиента, ближайшие сроки.
// Фирменная карточка — копируется текстом или скачивается картинкой.
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { ClientProject, dueDate, Mark, shown, STAGES } from "../lib/catalog";
import { today } from "../lib/store";

const MONTHS = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const CONTACT = "Telegram @samitovva · oporasamitovva.ru";
const fmt = (s: string) => `${Number(s.slice(8))}.${s.slice(5, 7)}`;

export default function ClientReport({ p, mk, marks, onClose }: { p: ClientProject; mk: string; marks: Record<string, Mark>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState("");
  const [y, m] = mk.split("-").map(Number);
  const period = `${MONTHS[m - 1]} ${y}`;

  // Финансистские этапы клиенту не показываем — только работа по учёту
  const stages = STAGES.filter((s) => !s.fin).map((s) => ({ s, items: s.items.filter((it) => shown(it, p.flags || {})) })).filter((x) => x.items.length);
  const all = stages.flatMap((x) => x.items);
  const done = all.filter((it) => marks[it.id]?.done);
  const pct = all.length ? Math.round(done.length / all.length * 100) : 0;
  const waiting = all.filter((it) => !marks[it.id]?.done && marks[it.id]?.comment);
  const next = all.filter((it) => !marks[it.id]?.done && it.due != null)
    .map((it) => ({ it, date: dueDate(mk, it.due!) })).filter((x) => x.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const doneByStage = stages.map(({ s, items }) => ({ s, items: items.filter((it) => marks[it.id]?.done) })).filter((x) => x.items.length);

  const text = [
    `📊 Отчёт по учёту · ${p.name}`, `Период: ${period}`, `Выполнено: ${done.length} из ${all.length} (${pct}%)`,
    ...doneByStage.map(({ s, items }) => `\n✅ ${s.title}:\n` + items.map((it) => `• ${it.title}`).join("\n")),
    waiting.length ? "\n⏳ Ждём от вас:\n" + waiting.map((it) => `• ${it.title}${marks[it.id]?.comment ? ` — ${marks[it.id]!.comment}` : ""}`).join("\n") : null,
    next.length ? "\n📅 Ближайшие сроки:\n" + next.map((x) => `• ${fmt(x.date)} — ${x.it.title}`).join("\n") : null,
    `\nОПОРА · бухгалтерия и управленческий учёт\n${CONTACT}`,
  ].filter(Boolean).join("\n");

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };
  async function copy() { try { await navigator.clipboard.writeText(text); flash("Текст скопирован — вставь в чат клиента"); } catch { flash("Не удалось скопировать"); } }
  async function image(share: boolean) {
    if (!ref.current) return;
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const name = `OPORA-отчёт-${p.name.replace(/[^\wА-Яа-яЁё-]+/g, "_")}-${mk}.png`;
      if (share && navigator.canShare) {
        const file = new File([await (await fetch(url)).blob()], name, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: p.name }); return; }
      }
      const a = document.createElement("a"); a.href = url; a.download = name; a.click(); flash("Картинка скачана");
    } catch { flash("Не удалось сделать картинку"); }
  }

  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Отчёт клиенту" style={{ width: "min(560px,100vw)" }}>
        <div className="row"><h2 style={{ margin: 0 }}>Отчёт клиенту</h2><button className="ghost" onClick={onClose}>✕</button></div>
        <div className="inline" style={{ margin: "8px 0" }}>
          <button onClick={copy}>📋 Текст</button>
          <button onClick={() => image(false)}>🖼 Скачать</button>
          <button className="ghost" onClick={() => image(true)}>↗ Отправить</button>
        </div>
        <div ref={ref}>
          <div className="bcard">
            <div className="bc-top"><span className="bc-logo">◎ ОПОРА</span><span className="bc-sub">отчёт по учёту</span></div>
            <div className="bc-title">{p.name}</div>
            <div className="bc-short">Период: {period}</div>
            <div className="bc-price">{pct}%<span className="bc-per"> выполнено · {done.length} из {all.length}</span></div>
            <div className="rp-track"><div style={{ width: pct + "%" }} /></div>
            {doneByStage.map(({ s, items }) => (
              <div key={s.id} className="bc-sec"><div className="bc-st">✓ {s.title}</div>
                <ul>{items.map((it) => <li key={it.id}>{it.title}</li>)}</ul></div>))}
            {!doneByStage.length && <div className="bc-note">Работа по месяцу только начинается.</div>}
            {waiting.length > 0 && <div className="bc-sec wait"><div className="bc-st">⏳ Ждём от вас</div>
              <ul>{waiting.map((it) => <li key={it.id}>{it.title}{marks[it.id]?.comment ? <span className="rp-c"> — {marks[it.id]!.comment}</span> : null}</li>)}</ul></div>}
            {next.length > 0 && <div className="bc-sec"><div className="bc-st">📅 Ближайшие сроки</div>
              <ul className="rp-dates">{next.map((x) => <li key={x.it.id}><b>{fmt(x.date)}</b> {x.it.title}</li>)}</ul></div>}
            <div className="bc-foot">{CONTACT}</div>
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>В отчёт попадают отмеченные пункты учёта, комментарии «ждём» и ближайшие сроки. Задачи финансиста и внутренние пометки не показываются.</div>
        {msg && <div className="toast">{msg}</div>}
      </aside>
    </>
  );
}
