import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { DAY, TRIAL_DURATION, trialRef, type TrialInvite, type TrialKind } from "../lib/trial";
import { TrialDataProvider } from "../lib/trialData";
import { useWorkspace } from "../lib/workspace";
import CabinetTour from "../components/CabinetTour";
import Layout from "../components/Layout";
import NeylaLoading from "../components/NeylaLoading";
import ClientPortal from "./ClientPortal";

const telegram = "https://t.me/samitovva";

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
    <div className="inline">
      <a className="work-btn" href={telegram} target="_blank" rel="noreferrer">Написать в Telegram</a>
      <button className="ghost" onClick={() => location.reload()}>Обновить доступы</button>
      <button className="ghost" onClick={() => selectAccess?.(null)}>Сменить кабинет</button>
      <button className="ghost" onClick={() => signOut(auth)}>Выйти</button>
    </div>
  </div></main>;
  const uid = auth.currentUser?.uid ?? email;
  const editUntil = issuedAt + 2 * DAY;
  const stage = now >= editUntil ? 3 : now >= issuedAt + DAY ? 2 : 1;
  const projectId = "preview-" + kind + "-" + uid;
  const key = "opora-client-demo:" + uid + "/" + invite.owner + "/" + issuedAt + "/" + kind;
  return <TrialDataProvider key={key} storageKey={key} projectId={projectId}
    kind={kind} editUntil={editUntil} locked={stage === 3}>
    <Layout>
      {stage === 3 && <p className="muted">Демо · режим просмотра</p>}
      <ClientPortal />
    </Layout>
    {kind === "goods" && <CabinetTour storageKey={"opora-tour-" + projectId} role="goods" />}
    <TrialMessage key={issuedAt + "/" + stage} stage={stage} now={now} issuedAt={issuedAt} uid={uid} offers={invite.offers} />
  </TrialDataProvider>;
}

function TrialMessage({ stage, now, issuedAt, uid, offers }: {
  stage: number; now: number; issuedAt: number; uid: string; offers: string[];
}) {
  const key = "opora-trial-message:" + uid + "/" + issuedAt + "/" + stage;
  const [muted, setMuted] = useState(() => {
    try { return Number(localStorage.getItem(key) || 0); } catch { return 0; }
  });
  if (now < muted) return null;
  return <aside className="feedback-reminder trial-offer">
    <img src="neyla.jpg" alt="" />
    <div role="status">
      <b>Нейла</b>
      <div>{stage === 3 ? "Сегодня последний день демо. Кабинет открыт для просмотра. Чтобы вносить свои данные и продолжить работу, выберите тариф."
        : stage === 1 ? "Привет! Я Нейла. Начните с обучения, чтобы познакомиться с кабинетом."
        : "Сегодня второй день демо. Попробуйте внести тестовые данные и посмотрите доступные тарифы."}</div>
      {stage > 1 && offers.length > 0 && <ul>{offers.map((offer, index) => <li key={index}>{offer}</li>)}</ul>}
      <a href={telegram} target="_blank" rel="noreferrer">{stage === 3 ? "Обсудить тариф с @samitovva" : "Задать вопрос @samitovva"}</a>
    </div>
    <button type="button" aria-label="Закрыть сообщение" onClick={() => {
      const until = Date.now() + (stage === 3 ? 20 * 60_000 : DAY);
      setMuted(until);
      try { localStorage.setItem(key, String(until)); } catch { /* */ }
    }}>×</button>
  </aside>;
}
