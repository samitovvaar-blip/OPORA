// Подключение отчётности у действующего клиента: ключ (создаётся один раз и сохраняется),
// строка для скрипта, ссылка /exec + направление → готовая ссылка на P&L и проверка.
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ClientProject } from "../lib/catalog";

export const TEMPLATE_ID = "1FR7LnQUPY8TDpzTfhU-zwudGutPraDPUv2PABAtVEBM";
export const genKey = () => "opora-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const parse = (u?: string) => {
  const m = (u || "").match(/^([^?]+)\?(.*)$/); const q = new URLSearchParams(m?.[2] || "");
  return { base: m?.[1] || "", key: q.get("key") || "", dir: q.get("dir") || "" };
};

export default function ReportConnect({ p, wsId }: { p: ClientProject; wsId: string }) {
  const cur = parse(p.pnlUrl);
  const key = cur.key || p.scriptKey || "";
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
      setMsg(j.error ? ["❌ " + j.error, /ключ/i.test(j.error) ? "→ вставь в скрипт строку: " + line : ""].filter(Boolean)
        : [`✅ Подключено: «${j.title}», операций по «${dir}»: ${j.matched ?? 0}, месяцев: ${(j.months || []).length}`]);
    } catch { setMsg(["❌ Скрипт не ответил. Проверь: «Веб-приложение», доступ «Все», ссылка /exec"]); }
    setBusy(false);
  }

  return <div className="card" style={{ background: "var(--bg)", margin: "6px 0" }}>
    <b>📑 Отчётность (Google-таблица)</b>
    {!key ? <div style={{ marginTop: 6 }}><button onClick={() => updateDoc(ref, { scriptKey: genKey() })}>🔑 Создать ключ клиента</button>
      <span className="muted small"> — один раз, потом его не меняем</span></div> : <>
      <div className="small" style={{ marginTop: 6 }}>1. Таблица клиента: <a href={`https://docs.google.com/spreadsheets/d/${TEMPLATE_ID}/copy`} target="_blank" rel="noopener noreferrer">создать копию шаблона</a> (если ещё нет)</div>
      <div className="small" style={{ marginTop: 4 }}>2. В таблице: Расширения → Apps Script → замени строку <code>var KEY</code> на:</div>
      <div className="inline" style={{ margin: "4px 0" }}><code className="key-line">{line}</code>
        <button className="ghost small" onClick={() => navigator.clipboard?.writeText(line)}>📋 Скопировать</button></div>
      <div className="small">3. Развёртывание → «Веб-приложение», доступ «Все» → вставь ссылку /exec:</div>
      <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" style={{ width: "100%", marginTop: 4 }} />
      <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="Направление, как в колонке «Направление» (например: Кубики)" style={{ width: "100%", marginTop: 4 }} />
      <div className="inline" style={{ marginTop: 6 }}><button disabled={busy} onClick={saveCheck}>{busy ? "Проверяю…" : "💾 Сохранить и проверить"}</button></div>
      {msg && <div className="small" style={{ marginTop: 4 }}>{msg.map((m, k) => <div key={k}>{m}</div>)}</div>}
      {p.pnlUrl && <div className="small muted" style={{ marginTop: 4, wordBreak: "break-all" }}>Ссылка на P&L: {p.pnlUrl}</div>}
    </>}
  </div>;
}
