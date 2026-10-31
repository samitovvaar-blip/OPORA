// Раздел с вкладками: один пункт меню — несколько страниц (Клиенты | Проекты, P&L | Отчёт)
import { Link, useLocation } from "react-router-dom";

export default function Hub({ tabs }: { tabs: { to: string; label: string; el: JSX.Element }[] }) {
  const { pathname } = useLocation();
  const cur = tabs.find((t) => pathname.startsWith(t.to)) || tabs[0];
  return <>
    <div className="chips hub-tabs">{tabs.map((t) => <Link key={t.to} to={t.to} className={`chipbtn ${t === cur ? "on" : ""}`} style={{ textDecoration: "none" }}>{t.label}</Link>)}</div>
    {cur.el}
  </>;
}
