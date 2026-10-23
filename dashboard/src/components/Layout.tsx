import { NavLink, Outlet, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { modules } from "../lib/modules";
import { useEffect, useState } from "react";
import { useWorkspace } from "../lib/workspace";
import PullToRefresh from "./PullToRefresh";

interface Item { to: string; label: string; icon: string; staff?: boolean; staffOnly?: boolean; }
interface Group { id: string; title: string; items: Item[]; }

// Меню по группам. staff — пункт виден сотруднику
const groups = (): Group[] => [
  { id: "mgmt", title: "Управление", items: [
    { to: "/", label: "Главная", icon: "◧", staff: true },
    { to: "/pnl", label: "P&L", icon: "₽" },
    { to: "/report", label: "Отчёт", icon: "📊" },
    { to: "/wallet", label: "Личные деньги", icon: "👛" },
  ] },
  { id: "mkt", title: "Маркетинг", items: [
    ...modules.map((m) => ({ to: "/" + m.path, label: m.title, icon: m.icon })),
    { to: "/clients", label: "Клиенты", icon: "◉" },
  ] },
  { id: "ops", title: "Операционка", items: [
    { to: "/projects", label: "Проекты", icon: "◆" },
    { to: "/tasks", label: "Задания", icon: "▦", staff: true },
    { to: "/monthly", label: "Ежемесячные", icon: "↻", staff: true, staffOnly: true },
  ] },
  { id: "ref", title: "Справочник", items: [
    { to: "/products", label: "Продукты", icon: "★" },
    { to: "/kb", label: "База знаний", icon: "🎓", staff: true },
    { to: "/feedback", label: "Обратная связь", icon: "💬", staff: true },
    { to: "/admin", label: "Админка", icon: "⚙" },
  ] },
];
// Нижняя панель на телефоне
const MOBILE = ["/", "/clients", "/tasks", "/projects"];


export default function Layout() {
  const { user } = useAuth();
  const { isOwner } = useWorkspace();
  const loc = useLocation();
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("theme") || "light"; } catch { return "light"; } });
  const [more, setMore] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);
  useEffect(() => setMore(false), [loc.pathname]);

  const visible = groups().map((g) => ({ ...g, items: g.items.filter((i) => isOwner ? !i.staffOnly : i.staff) })).filter((g) => g.items.length);
  const flat = visible.flatMap((g) => g.items);
  const mobile = isOwner ? flat.filter((i) => MOBILE.includes(i.to)) : flat;
  const link = (n: Item) => (
    <NavLink key={n.to} to={n.to} end={n.to === "/"} className="navlink"><span className="ni">{n.icon}</span>{n.label}</NavLink>
  );
  const foot = (
    <div className="side-foot">
      <button className="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀ Светлая" : "☾ Тёмная"}</button>
      <div className="muted small">{user?.email}</div>
      <button className="ghost" onClick={() => signOut(auth)}>Выйти</button>
      <div className="muted small">версия {__BUILD__}</div>
    </div>
  );
  // Всегда раскрытый список, группы — просто подписи
  const menu = visible.map((g) => (
    <div key={g.id} className="ngroup">
      {(isOwner || g.id !== "mgmt") && <div className="ghead">{g.title}</div>}
      {g.items.map(link)}
    </div>));

  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">OPORA</div>
        {menu}
        {foot}
      </aside>
      <nav className="mnav">
        {mobile.map(link)}
        {isOwner && <button className={`navlink ${more ? "active" : ""}`} onClick={() => setMore(!more)}><span className="ni">☰</span>Ещё</button>}
      </nav>
      {more && <div className="msheet-back" onClick={() => setMore(false)}>
        <div className="msheet" onClick={(e) => e.stopPropagation()}>{menu}{foot}</div></div>}
      <main className="main"><PullToRefresh /><Outlet /></main>
    </div>
  );
}
