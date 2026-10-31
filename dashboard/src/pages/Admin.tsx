// Админка: слева сотрудники, справа клиенты; служебное — внизу списком
import { modules } from "../lib/modules";
import { useAuth } from "../lib/auth";
import AccessCard from "../components/AccessCard";
import ClientsAccessCard from "../components/ClientsAccessCard";
import StudentsCard from "../components/StudentsCard";
import NewClientWizard from "../components/NewClientWizard";
import { useState } from "react";

// вкладки Админки: Сотрудники (и ученики) · Клиенты · Отчётность (main.tsx)
export function AdminStaff() { return <><AccessCard /><StudentsCard /><Service /></>; }
export function AdminClients() {
  const [wiz, setWiz] = useState(false);
  return <>{wiz ? <NewClientWizard onClose={() => setWiz(false)} /> : <button style={{ marginBottom: 12 }} onClick={() => setWiz(true)}>+ Новый клиент</button>}
    <ClientsAccessCard /><Service /></>;
}

function Service() {
  const { user } = useAuth();
  return (
    <>
      <div className="adm-service small muted">
        <div><b>Контуры данных:</b> личное — Firebase ✓ · заявки — Yandex Cloud (отдельный вход)</div>
        <div><b>Аккаунт:</b> {user?.email}</div>
        <div><b>Модули:</b> {modules.length ? modules.map((m) => `${m.icon} ${m.title}`).join(" · ") : "нет"}</div>
      </div>
    </>
  );
}

export default AdminStaff;
