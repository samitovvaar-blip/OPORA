import { useRef, useState } from "react";
import { parseProjectHistory, parseSpokenHistory, validHistoryDate, type HistoryMove } from "../lib/projectHistory";

type SpeechRecognitionEventLike = { results: ArrayLike<{ 0: { transcript: string } }> };
type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  start: () => void; stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
};

export default function ProjectHistoryImport({ today, disabled, save }: {
  today: string;
  disabled?: boolean;
  save: (rows: HistoryMove[]) => Promise<number>;
}) {
  const [month, setMonth] = useState("");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<HistoryMove[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const invalid = rows.some((row) => !validHistoryDate(row.date) || row.date > today
    || !Number.isFinite(row.amount) || row.amount <= 0 || !row.account.trim());
  function parse() {
    const result = parseProjectHistory(text, month);
    setRows(result.rows.slice(0, 50));
    setRejected([...result.rejected, ...result.rows.slice(50).map((row) => row.note)]);
    setMessage(result.rows.length ? "" : "Операции не распознаны. Проверь дату, сумму и знак + или − перед ней.");
  }
  function listen() {
    if (listening) { recognition.current?.stop(); return; }
    const Speech = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Speech) { setMessage("На этом устройстве голосовой ввод не поддерживается. Можно ввести операцию текстом."); return; }
    const instance = new Speech();
    recognition.current = instance; instance.lang = "ru-RU"; instance.interimResults = false; instance.continuous = false;
    instance.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ");
      setText(transcript);
      const result = parseSpokenHistory(transcript, today);
      setRows(result.rows.slice(0, 50)); setRejected(result.rejected); setMessage(result.rows.length ? "" : "Не поняла операцию. Назови действие и сумму, например: «Мне оплатили 15 тысяч».");
    };
    instance.onerror = () => setMessage("Не удалось распознать голос. Проверь доступ к микрофону или введи операцию текстом.");
    instance.onend = () => { setListening(false); recognition.current = null; };
    setRows([]); setRejected([]); setMessage(""); setListening(true); instance.start();
  }
  async function confirm() {
    if (disabled || busy || invalid || !rows.length) return;
    setBusy(true); setMessage("");
    try {
      const count = await save(rows);
      setRows([]);
      setMessage(`Добавлено операций: ${count}.` + (count < rows.length ? " Повторы пропущены." : ""));
    } catch {
      setMessage("Не удалось сохранить операции. Попробуй ещё раз.");
    } finally { setBusy(false); }
  }
  const update = (index: number, patch: Partial<HistoryMove>) =>
    setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));

  return <section className="card" style={{ margin: "10px 0 0" }}>
    <h4 style={{ margin: "0 0 8px" }}>Доходы и расходы по проекту</h4>
    <p className="muted small">Продиктуй операцию обычными словами или введи её текстом. Перед сохранением ОПОРА обязательно покажет, что распознала.</p>
    <button type="button" className={listening ? "" : "ghost"} disabled={busy || disabled} onClick={listen}
      style={listening ? { background: "#e8873a", color: "#fff" } : undefined}>{listening ? "● Слушаю… Нажми, чтобы остановить" : "🎙 Продиктовать операцию"}</button>
    <div className="neila-feedback-form" style={{ marginTop: 12 }}>
      <label>Месяц для строк без даты <input type="month" value={month} max={today.slice(0, 7)} disabled={busy || disabled}
        onChange={(e) => { setMonth(e.target.value); setRows([]); setRejected([]); setMessage(""); }} /></label>
      <label>Текст операции <textarea rows={3} value={text} maxLength={10000} disabled={busy || disabled}
        placeholder={"Сегодня мне оплатили 15 тысяч\nЯ потратила 3 тысячи на рекламу"}
        onChange={(e) => { setText(e.target.value); setRows([]); setRejected([]); setMessage(""); }} /></label>
      <button type="button" disabled={busy || disabled || !text.trim()} onClick={parse}>Распознать операции</button>
    </div>
    {rejected.length > 0 && <div className="error small" role="status">Не удалось распознать:
      <ul>{rejected.map((line, i) => <li key={i}>{line}</li>)}</ul>
    </div>}
    {rows.length > 0 && <>
      <p className="small muted">Проверь суммы, даты и счета. Операции сохранятся только после твоего подтверждения.</p>
      {rows.map((row, i) => <div className="inline" key={i} style={{ flexWrap: "wrap", margin: "6px 0" }}>
        <select aria-label="Тип операции" value={row.type} disabled={busy || disabled} onChange={(e) => update(i, { type: e.target.value as HistoryMove["type"] })}>
          <option value="in">+ Доход</option><option value="out">− Расход</option>
        </select>
        <input aria-label="Дата операции" type="date" value={row.date} max={today} disabled={busy || disabled} onChange={(e) => update(i, { date: e.target.value })} />
        <input aria-label="Сумма" type="number" value={row.amount || ""} min="0.01" step="0.01" style={{ maxWidth: 130 }}
          disabled={busy || disabled} onChange={(e) => update(i, { amount: Number(e.target.value) })} />
        <input aria-label="Счёт" value={row.account} disabled={busy || disabled} onChange={(e) => update(i, { account: e.target.value })} />
        <button type="button" className="ghost" aria-label="Убрать строку" disabled={busy || disabled}
          onClick={() => setRows((current) => current.filter((_, index) => index !== i))}>×</button>
      </div>)}
      {invalid && <p className="error small">Проверь даты, суммы и счета. Даты должны быть сегодняшними или прошедшими.</p>}
      <button type="button" disabled={busy || invalid || disabled} onClick={confirm}>{busy ? "Сохраняю…" : "Внести в проект"}</button>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
