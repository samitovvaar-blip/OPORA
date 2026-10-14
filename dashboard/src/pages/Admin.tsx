import { modules } from "../lib/modules";
import { useAuth } from "../lib/auth";

export default function Admin() {
  const { user } = useAuth();
  return (
    <>
      <h1>Админка</h1>
      <div className="bento">
        <div className="card">
          <h3>Контуры данных</h3>
          <div className="row"><span>Личное · Firebase</span><span className="badge b-won">подключено</span></div>
          <div className="row"><span>Бизнес · Yandex CRM</span><span className="badge">позже</span></div>
        </div>
        <div className="card">
          <h3>Аккаунт</h3>
          <div className="muted small">{user?.email}</div>
          <div className="muted small">UID: {user?.uid}</div>
        </div>
        <div className="card wide">
          <h3>Модули из других репозиториев</h3>
          {modules.length ? modules.map((m) => <div key={m.id} className="row"><span>{m.icon} {m.title}</span><code>/{m.path}</code></div>)
            : <div className="muted">Модулей пока нет. Добавь пакет <code>@opora/module-*</code> в <code>src/lib/modules.ts</code>.</div>}
        </div>
      </div>
    </>
  );
}
