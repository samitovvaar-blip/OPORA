import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TourCard } from "./ServiceCrm";

type Step = { to: string; title: string; text: string; sel?: string };
const intro: Step = {
  to: "/", title: "Привет! Я Нейла 👋",
  text: "Покажу, где что находится в кабинете. Нажимай «Далее», чтобы перейти к следующему разделу.",
};
const staffSteps: Step[] = [
  intro,
  { to: "/", sel: "staff-today", title: "Главная", text: "Здесь видны задания на сегодня, ближайшие сроки, твои клиенты, новые уроки и информация об оплате." },
  { to: "/tasks", sel: "staff-tasks", title: "Задания", text: "Выбирай дату в календаре, открывай задания и отмечай выполнение. У повторяющихся заданий отметка ставится за выбранный день." },
  { to: "/monthly", sel: "staff-clients", title: "Мои клиенты", text: "Здесь проекты, к которым тебе дали доступ. Открой клиента, чтобы посмотреть сроки и отметить работу по чек-листу." },
  { to: "/kb", sel: "cabinet-courses", title: "База знаний", text: "Выбирай доступный курс и отмечай просмотренные уроки. ОПОРА запомнит твой прогресс." },
  { to: "/neila", sel: "neyla-panel", title: "Нейла", text: "Здесь можно заполнить опрос недели, задать вопрос в Telegram или снова пройти обучение." },
];
const studentSteps: Step[] = [
  intro,
  { to: "/", sel: "student-homework", title: "Домашние задания", text: "Здесь задания, сроки и ссылки на таблицы. Когда закончишь работу, поставь галочку напротив задания." },
  { to: "/kb", sel: "cabinet-courses", title: "Курсы", text: "Выбери открытый курс, открой урок и отметь его просмотренным, чтобы видеть прогресс." },
  { to: "/neila", sel: "neyla-panel", title: "Нейла", text: "Здесь можно заполнить опрос об обучении, задать вопрос в Telegram или снова пройти этот обзор." },
];

export default function CabinetTour({ storageKey, student }: { storageKey: string; student: boolean }) {
  const { search } = useLocation();
  const navigate = useNavigate();
  const steps = student ? studentSteps : staffSteps;
  const [step, setStep] = useState<number | null>(() => {
    try { return localStorage.getItem(storageKey) ? null : 0; } catch { return 0; }
  });

  useEffect(() => {
    if (new URLSearchParams(search).get("tour") !== "1") return;
    setStep(0);
    navigate("/", { replace: true });
  }, [search, navigate]);

  useEffect(() => {
    if (step !== null) navigate(steps[step].to, { replace: true });
  }, [step, steps, navigate]);

  if (step === null) return null;

  function go(next: number | null) {
    setStep(next);
    if (next !== null) return;
    try { localStorage.setItem(storageKey, "1"); } catch { /* */ }
  }

  return <TourCard n={step} steps={steps} go={go} />;
}
