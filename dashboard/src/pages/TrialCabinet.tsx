import { FormEvent, useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { demoGoodsJson, demoServices } from "../lib/demo";
import { DAY, TRIAL_DURATION, trialNames, trialRef, type TrialInvite, type TrialKind } from "../lib/trial";
import { useWorkspace } from "../lib/workspace";
import NeylaLoading from "../components/NeylaLoading";
import NeylaHeader from "../components/NeylaHeader";

const telegram = "https://t.me/samitovva";
const money = (value: number) => value.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const help = {
  goods: ["Открой «Главная», чтобы увидеть выручку и прибыль.", "В отчёте можно посмотреть статьи доходов и расходов.", "В «Плане» попробуй ввести свой план продаж."],
  services: ["На главной видна стоимость проектов.", "Во вкладке «Клиенты» можно добавить пробную запись.", "Открой «Финансы», чтобы посмотреть примеры услуг и их стоимости."],
  staff: ["В «Заданиях» можно отметить выполнение.", "В «Клиентах» видны примеры назначенных проектов.", "Во вкладке «База знаний» есть пример инструкции для сотрудника."],
};
const tabs = {
  goods: ["Главная", "Отчёт", "План"],
  services: ["Главная", "Клиенты", "Финансы"],
  staff: ["Задания", "Клиенты", "База знаний"],
};

function readLocal<T>(key: string, initial: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? initial; } catch { return initial; }
}
function saveLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be disabled. */ }
}

export default function TrialCabinet({ kind, email }: { kind: TrialKind; email: string }) {
  const { selectAccess } = useWorkspace();
  const [invite, setInvite] = useState<TrialInvite | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now);
  useEffect(() => onSnapshot(trialRef(email), { includeMetadataChanges: true }, (snap) => {
    if (!snap.metadata.fromCache) setInvite(snap.data() as TrialInvite | undefined ?? null);
  }, () => setInvite(null)), [email]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  if (invite === undefined) return <NeylaLoading text="Открываю демо-кабинет" />;
  const issuedAt = invite?.issuedAt.toMillis() ?? 0;
  if (!invite || now >= issuedAt + TRIAL_DURATION) return <main className="entry-picker"><div className="card">
    <h1>Пробный доступ завершён</h1>
    <p>Напишите @samitovva, чтобы подобрать тариф и открыть рабочий кабинет.</p>
    <a className="work-btn" href={telegram} target="_blank" rel="noreferrer">Написать в Telegram</a>
    {" "}<button className="ghost" onClick={() => location.reload()}>Обновить доступы</button>
    {" "}<button className="ghost" onClick={() => selectAccess?.(null)}>Сменить кабинет</button>
    {" "}<button className="ghost" onClick={() => signOut(auth)}>Выйти</button>
  </div></main>;
  return <main className="trial-main">
    <div className="row trial-top">
      <h1>{trialNames[kind]}</h1>
      <span className="inline">
        <button className="ghost" onClick={() => selectAccess?.(null)}>Сменить кабинет</button>
        <button className="ghost" onClick={() => signOut(auth)}>Выйти</button>
      </span>
    </div>
    <TrialContent key={issuedAt + "/" + kind} kind={kind} issuedAt={issuedAt} now={now}
      uid={auth.currentUser?.uid ?? email} offers={invite.offers} />
  </main>;
}

function TrialContent({ kind, issuedAt, now, uid, offers }: { kind: TrialKind; issuedAt: number; now: number; uid: string; offers: string[] }) {
  const tourKey = "opora-trial:" + uid + "/" + kind + "/tour";
  const key = "opora-trial:" + uid + "/" + issuedAt + "/" + kind;
  const stage = now >= issuedAt + 2 * DAY ? 3 : now >= issuedAt + DAY ? 2 : 1;
  const locked = stage === 3;
  const noticeKey = "opora-trial-message:" + uid + "/" + issuedAt + "/" + stage;
  const [tab, setTab] = useState(0);
  const [tour, setTour] = useState<number | null>(() => readLocal(tourKey, false) ? null : 0);
  const [plan, setPlan] = useState(() => readLocal<number>(key + "/plan", 1200000));
  const [clients, setClients] = useState(() => readLocal<string[]>(key + "/clients", []));
  const [done, setDone] = useState(() => readLocal<string[]>(key + "/tasks", []));
  const [newClient, setNewClient] = useState("");
  const [muted, setMuted] = useState<{ stage: number; until: number } | null>(null);
  const [goods] = useState(demoGoodsJson);
  const [services] = useState(demoServices);
  const month = goods.months[goods.months.length - 1];
  const revenue = goods.rows.filter((row) => row.process === "Выручка").reduce((sum, row) => sum + row.values[month], 0);
  const profit = goods.rows.reduce((sum, row) => sum + row.values[month], 0);
  const canEdit = () => Date.now() < issuedAt + 2 * DAY;
  const projects = ["Магазин одежды «Хлопок»", "Студия «Линия»"];
  const work = ["Сверить операции по выписке", "Подготовить данные для отчёта", "Проверить сроки по проектам"];

  function go(step: number | null) {
    setTour(step);
    if (step === null) saveLocal(tourKey, true);
    else setTab(step);
  }
  function addClient(event: FormEvent) {
    event.preventDefault();
    if (!canEdit() || !newClient.trim()) return;
    const next = [...clients, newClient.trim()];
    setClients(next);
    saveLocal(key + "/clients", next);
    setNewClient("");
  }
  return <>
    <NeylaHeader description={locked ? "Демо в режиме просмотра" : "Пробный кабинет с вымышленными данными"}
      action={<button className="ghost" onClick={() => go(0)}>Пройти обучение</button>} />
    {tour !== null && <section className="card trial-tour">
      <b>Нейла · Знакомство с кабинетом · {tour + 1} из 3</b>
      <p>{help[kind][tour]}</p>
      <div className="inline">
        <button className="ghost" onClick={() => go(null)}>Пропустить</button>
        {tour > 0 && <button className="ghost" onClick={() => go(tour - 1)}>Назад</button>}
        <button onClick={() => go(tour === 2 ? null : tour + 1)}>{tour === 2 ? "Готово" : "Далее"}</button>
      </div>
    </section>}
    <nav className="chips trial-tabs" aria-label="Разделы демо-кабинета">
      {tabs[kind].map((label, index) => <button key={label} className={`chipbtn ${tab === index ? "on" : ""}`}
        aria-pressed={tab === index} onClick={() => setTab(index)}>{label}</button>)}
    </nav>
    <section className="card">
      <h2>{tabs[kind][tab]}</h2>
      {kind === "goods" && (tab === 0 ? <dl><dt>Выручка</dt><dd>{money(revenue)}</dd><dt>Прибыль</dt><dd>{money(profit)}</dd></dl>
        : tab === 1 ? <div className="trial-report">{goods.rows.map((row) => <div className="row" key={row.article}>
          <span>{row.article}</span><b>{money(row.values[month])}</b>
        </div>)}</div>
        : <label>План продаж, ₽ <input type="number" min="0" value={plan} disabled={locked} onChange={(event) => {
          if (!canEdit()) return;
          const next = Math.max(0, Number(event.target.value));
          setPlan(next); saveLocal(key + "/plan", next);
        }} /></label>)}
      {kind === "services" && (tab === 0 ? <ul>{services.projects.map((item) => <li key={item.ref}>{item.name} · {money(item.price)}</li>)}</ul>
        : tab === 1 ? <>
          <ul>{services.clients.map((item) => <li key={item.ref}>{item.company} · {item.status}</li>)}
            {clients.map((name, index) => <li key={index}>{name} · Новый клиент</li>)}</ul>
          <form className="inline" onSubmit={addClient}>
            <input aria-label="Название клиента" placeholder="Название клиента" value={newClient}
              onChange={(event) => setNewClient(event.target.value)} maxLength={100} disabled={locked} required />
            <button disabled={locked}>Добавить клиента</button>
          </form>
        </> : <ul>{services.products.map((item) => <li key={item.ref}>{item.name} · {money(item.price)}</li>)}</ul>)}
      {kind === "staff" && (tab === 0 ? <ul>{work.map((task) => <li key={task}><label>
          <input type="checkbox" checked={done.includes(task)} disabled={locked} onChange={() => {
            if (!canEdit()) return;
            const next = done.includes(task) ? done.filter((value) => value !== task) : [...done, task];
            setDone(next); saveLocal(key + "/tasks", next);
          }} /> {task}
        </label></li>)}</ul>
        : tab === 1 ? <ul>{projects.map((project) => <li key={project}>{project}</li>)}</ul>
        : <details><summary>Как закрыть месяц по клиенту</summary><p>Сверь операции, проверь документы и отметь готовые пункты чек-листа.</p></details>)}
    </section>
    {(muted?.stage !== stage || now >= muted.until) && (locked || !readLocal(noticeKey, false)) && <aside className="feedback-reminder trial-offer">
      <img src="neyla.jpg" alt="" />
      <div role="status">
        <b>Нейла</b>
        <div>{locked ? "Сегодня последний день демо. Кабинеты открыты для просмотра. Чтобы вводить свои данные и продолжить работу, выберите тариф."
          : stage === 1 ? "Привет! Я Нейла. Начните с обучения, чтобы увидеть, как устроен кабинет."
          : "Сегодня второй день демо. Попробуйте внести пробные данные и посмотрите доступные тарифы."}</div>
        {stage > 1 && offers.length > 0 && <ul>{offers.map((offer, index) => <li key={index}>{offer}</li>)}</ul>}
        <a href={telegram} target="_blank" rel="noreferrer">{locked ? "Обсудить тариф с @samitovva" : "Задать вопрос @samitovva"}</a>
      </div>
      <button type="button" aria-label="Закрыть сообщение" onClick={() => {
        if (!locked) saveLocal(noticeKey, true);
        setMuted({ stage, until: Date.now() + (locked ? 20 * 60_000 : DAY) });
      }}>×</button>
    </aside>}
  </>;
}
