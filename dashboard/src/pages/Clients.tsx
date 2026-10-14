import { useEffect, useState } from "react";
import { Client, getClients } from "../lib/crm";

export default function Clients() {
  const [list, setList] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => { getClients().then(setList); }, []);
  const shown = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1>Клиенты</h1>
      <input placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card">
        <table>
          <thead><tr><th>Клиент</th><th>Телефон</th><th>Заявок</th></tr></thead>
          <tbody>{shown.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td>{c.leads}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
