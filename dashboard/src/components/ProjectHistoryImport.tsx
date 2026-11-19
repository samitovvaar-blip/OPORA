import { useState } from "react";
import { parseProjectHistory, validHistoryDate, type HistoryMove } from "../lib/projectHistory";

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
  const [message, setMessage] = useState("");
  const invalid = rows.some((row) => !validHistoryDate(row.date) || row.date > today
    || !Number.isFinite(row.amount) || row.amount <= 0 || !row.account.trim());
  function parse() {
    const result = parseProjectHistory(text, month);
    setRows(result.rows.slice(0, 50));
    setRejected([...result.rejected, ...result.rows.slice(50).map((row) => row.note)]);
    setMessage(result.rows.length ? "" : "Операции не распознаны. Проверь дату, сумму и знак + или − перед ней.");
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
    <h4 style={{ margin: "0 0 8px" }}>Доходы и расходы за прошлые месяцы</h4>
    <p className="muted small">Одна операция на строку. Поставь + перед доходом и − перед расходом. Можно указать дату в комментарии или выбрать месяц ниже. Для суммы за весь месяц ОПОРА предложит его последний день.</p>
    <div className="neila-feedback-form">
      <label>Месяц для строк без даты <input type="month" value={month} max={today.slice(0, 7)} disabled={busy || disabled}
        onChange={(e) => { setMonth(e.target.value); setRows([]); setRejected([]); setMessage(""); }} /></label>
      <label>Комментарий <textarea rows={3} value={text} maxLength={10000} disabled={busy || disabled}
        placeholder={"Январь 2026: +130 тысяч на Яндекс\n15.02.2026 -18 500 — подрядчик"}
        onChange={(e) => { setText(e.target.value); setRows([]); setRejected([]); setMessage(""); }} /></label>
      <button type="button" disabled={busy || disabled || !text.trim()} onClick={parse}>Распознать операции</button>
    </div>
    {rejected.length > 0 && <div className="error small" role="status">Пропущенные строки:
      <ul>{rejected.map((line, i) => <li key={i}>{line}</li>)}</ul>
    </div>}
    {rows.length > 0 && <>
      <p className="small muted">Проверь суммы, даты и счета. В запись попадут только строки ниже.</p>
      {rows.map((row, i) => <div className="inline" key={i} style={{ flexWrap: "wrap", margin: "6px 0" }}>
        <select aria-label="Тип операции" value={row.type} disabled={busy || disabled} onChange={(e) => update(i, { type: e.target.value as HistoryMove["type"] })}>
          <option value="in">Приход</option><option value="out">Расход</option>
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
