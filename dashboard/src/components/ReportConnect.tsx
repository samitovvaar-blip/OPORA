// Подключение отчётности у действующего клиента: ключ (создаётся один раз и сохраняется),
// строка для скрипта, ссылка /exec + направление → готовая ссылка на P&L и проверка.
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ClientProject } from "../lib/catalog";

export const TEMPLATE_ID = "1FR7LnQUPY8TDpzTfhU-zwudGutPraDPUv2PABAtVEBM";
// ключ = ID таблицы клиента (из ссылки …/spreadsheets/d/ID/edit) — код скрипта один для всех
export const sheetId = (u?: string) => (u || "").match(/\/spreadsheets\/d\/([\w-]{20,})/)?.[1] || "";
export const genKey = () => "opora-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const parse = (u?: string) => {
  const m = (u || "").match(/^([^?]+)\?(.*)$/); const q = new URLSearchParams(m?.[2] || "");
  return { base: m?.[1] || "", key: q.get("key") || "", dir: q.get("dir") || "" };
};

export default function ReportConnect({ p, wsId }: { p: ClientProject; wsId: string }) {
  const cur = parse(p.pnlUrl);
  const [sheet, setSheet] = useState(p.links?.sheet || "");
  // ключ = ID таблицы (единый скрипт); старый ключ — только если ссылки на таблицу нет
  const key = sheetId(sheet) || cur.key || p.scriptKey || "";
  const [base, setBase] = useState(cur.base);
  const [dir, setDir] = useState(cur.dir);
  const [msg, setMsg] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = doc(db, "workspaces", wsId, "clients", p.id);
  const url = base && key && dir ? `${base.trim().replace(/\?.*$/, "")}?key=${encodeURIComponent(key)}&dir=${encodeURIComponent(dir.trim())}` : "";
  const line = `var KEY = '${key}';`;

  async function saveCheck() {
    if (!url) return setMsg(["❌ Нужны ссылка /exec и направление"]);
    setBusy(true); await updateDoc(ref, { pnlUrl: url });
    try {
      const j = await (await fetch(url + "&fresh=1")).json();
      setMsg(j.error ? ["❌ " + j.error, /ключ/i.test(j.error) ? "→ проверь, что ссылка на таблицу — именно та, где стоит скрипт, и скрипт обновлён с GitHub" : ""].filter(Boolean)
        : [`✅ Подключено: «${j.title}», операций по «${dir}»: ${j.matched ?? 0}, месяцев: ${(j.months || []).length}`]);
    } catch { setMsg(["❌ Скрипт не ответил. Проверь: «Веб-приложение», доступ «Все», ссылка /exec"]); }
    setBusy(false);
  }

  return <div className="card" style={{ background: "var(--bg)", margin: "6px 0" }}>
    <b>📑 Отчётность (Google-таблица)</b>
    <div className="small" style={{ marginTop: 6 }}>1. Ссылка на таблицу клиента (из неё берётся ключ):</div>
    <input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/edit" style={{ width: "100%", marginTop: 4 }} />
    {!sheet && <div className="small muted">Нет таблицы? <a href={`https://docs.google.com/spreadsheets/d/${TEMPLATE_ID}/copy`} target="_blank" rel="noopener noreferrer">Создать копию шаблона</a></div>}
    {key && <div className="small muted">🔑 ключ: <code>{key}</code></div>}
    <div className="small" style={{ marginTop: 6 }}>2. Скрипт в таблице — общий для всех клиентов (код с GitHub, ничего не менять).</div>
    {key && <>
      <div className="small">3. Развёртывание → «Веб-приложение», доступ «Все» → вставь ссылку /exec:</div>
      <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" style={{ width: "100%", marginTop: 4 }} />
      <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="Направление, как в колонке «Направление» (например: Кубики)" style={{ width: "100%", marginTop: 4 }} />
      <div className="inline" style={{ marginTop: 6 }}><button disabled={busy} onClick={saveCheck}>{busy ? "Проверяю…" : "💾 Сохранить и проверить"}</button></div>
      {msg && <div className="small" style={{ marginTop: 4 }}>{msg.map((m, k) => <div key={k}>{m}</div>)}</div>}
      {p.pnlUrl && <div className="small muted" style={{ marginTop: 4, wordBreak: "break-all" }}>Ссылка на P&L: {p.pnlUrl}</div>}
    </>}
  </div>;
}
