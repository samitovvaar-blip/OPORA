import { FormEvent, useEffect, useState } from "react";
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../lib/auth";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import NeylaLoading from "../components/NeylaLoading";
import { FeedbackRole as Role, feedbackPeriod, feedbackResponses, useFeedbackPeriod } from "../lib/feedback";
import { SUPPORT_URL } from "../components/ServiceCrm";

const prompts: Record<Role, string[]> = {
  staff: [
    "Насколько тебя устраивает оплата за текущую работу?",
    "Как ты оцениваешь объём работы за неделю?",
    "В каком направлении тебе хотелось бы развиваться?",
    "Что в рабочих процессах стоит добавить, изменить или убрать?",
    "Что помогло бы тебе удобнее работать в ОПОРЕ?",
  ],
  student: [
    "Насколько тебе понятны уроки этой недели?",
    "Как тебе объём домашних заданий?",
    "Какую тему ты хочешь изучить глубже?",
    "Что стоит добавить, изменить или убрать в обучении?",
    "Что помогло бы тебе удобнее учиться в ОПОРЕ?",
  ],
};
const ratings = {
  staff: ["Совсем не устраивает", "Скорее не устраивает", "Нейтрально", "Скорее устраивает", "Полностью устраивает"],
  student: ["Совсем непонятны", "Скорее непонятны", "Частично понятны", "В основном понятны", "Всё понятно"],
};
const workloads = ["Мало", "В самый раз", "Много"];
const blank = ["", "", "", "", ""];
function offsetWeek(date: string, weeks: number) {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + weeks * 7);
  return value.toISOString().slice(0, 10);
}

function weekLabel(date: string) {
  const format = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("ru-RU", {
    timeZone: "UTC", day: "numeric", month: "long", year: "numeric",
  });
  const end = new Date(date + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  return format(date) + " — " + format(end.toISOString().slice(0, 10));
}

export default function NeilaFeedback() {
  const { wsId, isOwner, student, ws } = useWorkspace();
  const { user } = useAuth();
  const { week } = useFeedbackPeriod();
  if (!wsId || !user?.email) return null;
  if (!isOwner && !student && ws?.open !== true) return <div className="card">Доступ закрыт владельцем.</div>;
  const role = student ? "student" : "staff";
  return (
    <>
      <h1><img className="neila-feedback-avatar" src="neyla.jpg" alt="" />Нейла</h1>
      {!isOwner && <p><a className="neila-telegram" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">Задать вопрос</a></p>}
      {isOwner
        ? <FeedbackResults key={wsId} wsId={wsId} current={week} />
        : <WeeklySurvey key={wsId + "/" + role + "/" + week} wsId={wsId} role={role}
            week={week} email={user.email.toLowerCase()} />}
    </>
  );
}

function WeeklySurvey({ wsId, role, week, email }: { wsId: string; role: Role; week: string; email: string }) {
  const [answers, setAnswers] = useState(blank);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => onSnapshot(doc(feedbackResponses(wsId, week, role), email), (snapshot) => {
    setSent(snapshot.exists());
    setLoading(false);
    setReadError("");
  }, (error) => {
    setReadError(error.code === "permission-denied"
      ? "Отправка пока недоступна. Попроси владельца проверить правила Firestore для «Нейлы»."
      : "Не удалось проверить отправку опроса. Проверь подключение и попробуй ещё раз.");
    setLoading(false);
  }), [wsId, week, role, email, retry]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const values = answers.map((answer) => answer.trim());
    if (loading || readError || saving || sent || values.some((answer) => !answer)) return;
    if (week !== feedbackPeriod().week) {
      setSaveError("Уже началась новая неделя. Обнови страницу, чтобы открыть новый опрос.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const ref = doc(feedbackResponses(wsId, week, role), email);
      await runTransaction(db, async (transaction) => {
        if ((await transaction.get(ref)).exists()) return;
        transaction.set(ref, { answers: values, submittedAt: serverTimestamp() });
      });
      setSent(true);
    } catch {
      setSaveError("Не удалось отправить ответы. Попробуй ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="card neila-feedback">
    <h2>Опрос недели</h2>
    <p className="muted">{weekLabel(week)}</p>
    {loading && <p className="muted" role="status">Проверяю, отправлялся ли опрос…</p>}
    {readError && <div role="alert">
      <p>{readError}</p>
      <button type="button" className="ghost" onClick={() => { setLoading(true); setReadError(""); setRetry((attempt) => attempt + 1); }}>Проверить ещё раз</button>
    </div>}
    {sent ? <>
        <p role="status">Спасибо! Ответы за эту неделю отправлены. Новый опрос откроется в понедельник.</p>
        <SurveyQuestions role={role} />
      </> : <form className="neila-feedback-form" onSubmit={submit}>
        <p>Ответы видит владелец рабочего пространства.</p>
        {prompts[role].map((prompt, index) => (
          <label key={prompt}>
            <span>{prompt}</span>
            {index < 2
              ? <select required disabled={saving} value={answers[index]} onChange={(event) => {
                  const value = event.target.value;
                  setAnswers((previous) => previous.map((answer, i) => i === index ? value : answer));
                }}>
                  <option value="">Выбери ответ</option>
                  {(index === 0 ? ratings[role] : workloads).map((answer) => <option key={answer}>{answer}</option>)}
                </select>
              : <textarea rows={3} required maxLength={1000} disabled={saving} value={answers[index]}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAnswers((previous) => previous.map((answer, i) => i === index ? value : answer));
                  }} />}
          </label>
        ))}
        {saveError && <p className="error" role="alert">{saveError}</p>}
        <button disabled={loading || !!readError || saving || answers.some((answer) => !answer.trim())}>{saving ? "Отправляю…" : "Отправить ответы"}</button>
      </form>}
  </section>;
}

function SurveyQuestions({ role }: { role: Role }) {
  return <div>
    <h3>Вопросы опроса</h3>
    <ol>{prompts[role].map((prompt) => <li key={prompt}>{prompt}</li>)}</ol>
  </div>;
}

function FeedbackResults({ wsId, current }: { wsId: string; current: string }) {
  const [role, setRole] = useState<Role>("staff");
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const week = selectedWeek ?? current;
  return <section className="card neila-feedback">
    <h2>Ответы за неделю</h2>
    <div className="inline neila-feedback-controls">
      <label>Кабинет <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
        <option value="staff">Сотрудники</option>
        <option value="student">Ученики</option>
      </select></label>
      <button className="ghost" aria-label="Предыдущая неделя" onClick={() => setSelectedWeek(offsetWeek(week, -1))}>←</button>
      <span>{weekLabel(week)}</span>
      <button className="ghost" aria-label="Следующая неделя" disabled={week >= current}
        onClick={() => { const next = offsetWeek(week, 1); setSelectedWeek(next >= current ? null : next); }}>→</button>
    </div>
    <SurveyQuestions role={role} />
    <ResponseList key={week + "/" + role} wsId={wsId} week={week} role={role} />
  </section>;
}

function ResponseList({ wsId, week, role }: { wsId: string; week: string; role: Role }) {
  const [rows, setRows] = useState<{ email: string; answers: string[] }[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => onSnapshot(feedbackResponses(wsId, week, role), (snapshot) => {
    setRows(snapshot.docs.map((item) => ({ email: item.id, answers: item.data().answers as string[] })));
    setError(false);
  }, () => setError(true)), [wsId, week, role]);
  if (error) return <p role="alert">Ответы недоступны. Проверь, опубликованы ли правила Firestore для вкладки «Нейла».</p>;
  if (!rows) return <NeylaLoading text="Загружаю ответы" />;
  if (!rows.length) return <p className="muted">За эту неделю ответов пока нет.</p>;
  return <div className="neila-feedback-results">
    <p className="muted">Ответов: {rows.length}</p>
    {rows.map(({ email, answers }) => (
      <details key={email}>
        <summary>{email}</summary>
        <dl>{prompts[role].map((prompt, index) => <div key={prompt}><dt>{prompt}</dt><dd>{answers[index]}</dd></div>)}</dl>
      </details>
    ))}
  </div>;
}
