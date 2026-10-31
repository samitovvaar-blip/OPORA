// Админка: слева сотрудники, справа клиенты; служебное — внизу списком
import { modules } from "../lib/modules";
import { useAuth } from "../lib/auth";
import AccessCard from "../components/AccessCard";
import ClientsAccessCard from "../components/ClientsAccessCard";

export default function Admin() {
  const { user } = useAuth();
  return (
    <>
      <h1>Админка</h1>
      <div className="home-2col adm-cols">
        <AccessCard />
        <ClientsAccessCard />
      </div>
      <div className="adm-service small muted">
        <div><b>Контуры данных:</b> личное — Firebase ✓ · заявки — Yandex Cloud (отдельный вход)</div>
        <div><b>Аккаунт:</b> {user?.email}</div>
        <div><b>Модули:</b> {modules.length ? modules.map((m) => `${m.icon} ${m.title}`).join(" · ") : "нет"}</div>
      </div>
    </>
  );
}
