import { Ic, ICONS } from "./ServiceCrm";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { modules } from "../lib/modules";
import { useEffect, useState } from "react";
import { useWorkspace } from "../lib/workspace";
import PullToRefresh from "./PullToRefresh";
import { startPresence } from "../lib/presence";
import InstallHint from "./InstallHint";

interface Item { to: string; label: string; icon: string; staff?: boolean; staffOnly?: boolean; }
interface Group { id: string; title: string; items: Item[]; }

// Меню по группам. staff — пункт виден сотруднику
const groups = (): Group[] => [
  { id: "mgmt", title: "Управление", items: [
    { to: "/", label: "Главная", icon: "home", staff: true },
    { to: "/pnl", label: "Финансы", icon: "money" },
  ] },
  { id: "mkt", title: "Маркетинг", items: [
    ...modules.map((m) => ({ to: "/" + m.path, label: m.title, icon: m.icon })),
  ] },
  { id: "ops", title: "Операционка", items: [
    { to: "/projects", label: "Клиенты", icon: "users" },
    { to: "/tasks", label: "Задания", icon: "tasks", staff: true },
    { to: "/monthly", label: "Мои клиенты", icon: "users", staff: true, staffOnly: true },
  ] },
  { id: "ref", title: "Справочник", items: [
    { to: "/products", label: "Продукты", icon: "box" },
    { to: "/kb", label: "База знаний", icon: "cap", staff: true },
    { to: "/admin", label: "Админка", icon: "gear" },
  ] },
];
// Нижняя панель на телефоне
const MOBILE = ["/", "/projects", "/tasks", "/pnl"];


export default function Layout() {
  const { user } = useAuth();
  const { isOwner, clientOf, student } = useWorkspace();
  const loc = useLocation();
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("theme") || "light"; } catch { return "light"; } });
  const [more, setMore] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);
  useEffect(() => setMore(false), [loc.pathname]);
  // сотрудник: отмечаем онлайн и рабочее время
  const { wsId } = useWorkspace();
  // вид кабинета клиента (товары / услуги) — сообщает кабинет, чтобы меню показывало нужные разделы
  const [biz, setBiz] = useState<string>(() => { try { return localStorage.getItem("opora-biz") || ""; } catch { return ""; } });
  useEffect(() => { const f = (e: Event) => setBiz((e as CustomEvent).detail || ""); addEventListener("opora-biz", f); return () => removeEventListener("opora-biz", f); }, []);
  useEffect(() => !isOwner && !student && wsId && user?.email ? startPresence(wsId, user.email) : undefined, [isOwner, clientOf, wsId, user?.email]);   // сотрудник и клиент

  const visible = student ? [{ id: "st", title: "", items: [{ to: "/", label: "Домашние задания", icon: "book" }, { to: "/kb", label: "Курсы", icon: "cap" }] }] : clientOf ? [{ id: "client", title: "", items: biz === "services"
    ? [{ to: "/?t=chome", label: "Мой кабинет", icon: "spiral" }, { to: "/?t=cfin", label: "Финансы", icon: "money" }, { to: "/?t=ccli", label: "Клиенты", icon: "users" },
      { to: "/?t=cstaff", label: "Сотрудники", icon: "case" }, { to: "/?t=cprod", label: "Продукты", icon: "box" }, { to: "/?t=ctips", label: "Нейла", icon: "neyla" }]
    : [{ to: "/?t=dash", label: "Мой кабинет", icon: "spiral" }, { to: "/?t=rep", label: "Отчётность", icon: "book" },
    { to: "/?t=work", label: "Ход работы", icon: "case" }, { to: "/?t=plan", label: "Планирование", icon: "plan" }] }] : groups().map((g) => ({ ...g, items: g.items.filter((i) => isOwner ? !i.staffOnly : i.staff) })).filter((g) => g.items.length);
  const flat = visible.flatMap((g) => g.items);
  const mobile = isOwner ? flat.filter((i) => MOBILE.includes(i.to)) : flat;
  const link = (n: Item) => (
    <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => {
      // разделы кабинета клиента — по ?t=…; без параметра активен «Мой кабинет»
      const alias: Record<string, string[]> = { "/projects": ["/clients"], "/pnl": ["/wallet"], "/admin": ["/team-clients", "/report"] };   // вкладки одного раздела
      const on = n.to.includes("?t=") ? (loc.search || "?t=dash") === n.to.slice(n.to.indexOf("?")) : isActive || (alias[n.to] || []).some((a) => loc.pathname.startsWith(a));
      return "navlink" + (on ? " active" : "");
    }}><span className="ni">{n.icon === "spiral" ? <img src="spiral-orange.png" alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />
      : n.icon === "neyla" ? <img src="neyla.jpg" alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }} />
      : ICONS[n.icon] ? <Ic n={n.icon} c="currentColor" s={20} /> : n.icon}</span>{n.label}</NavLink>
  );
  // ↻: кабинет клиента перезагружает отчёт сам (слушает событие), остальные разделы — перезагрузкой страницы
  const refresh = () => { if (window.dispatchEvent(new Event("opora-refresh", { cancelable: true }))) location.reload(); };
  const foot = (
    <div className="side-foot">
      <button className="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀ Светлая" : "☾ Тёмная"}</button>
      {clientOf && <div id="side-name" className="side-client" />}
      <div className="muted small">{user?.email}</div>
      <button className="ghost" onClick={() => signOut(auth)}>Выйти</button>
      <div className="muted small">версия {__BUILD__}</div>
    </div>
  );
  // Всегда раскрытый список, группы — просто подписи
  const menu = visible.map((g) => (
    <div key={g.id} className="ngroup">
      {g.title && (isOwner || g.id !== "mgmt") && <div className="ghead">{g.title}</div>}
      {g.items.map(link)}
    </div>));

  return (
    <div className="shell">
      <aside className="side">
        <div className="logo" onClick={refresh} title="Обновить данные" style={{ cursor: "pointer" }}><img src="logo.png" alt="" />ОПОРА</div>
        {clientOf && <div id="side-slot" />}
        {menu}
        {foot}
      </aside>
      <nav className="mnav">
        {mobile.map(link)}
        <button className="navlink m-logo m-sec" title="Обновить" onClick={(e) => { const b = e.currentTarget; b.classList.add("spin"); setTimeout(refresh, 600);
          // спираль делает два оборота и останавливается
          setTimeout(() => b.classList.remove("spin"), 1700); }}><img src="spiral.png" alt="" /></button>
        <button className="navlink m-sec" title="Светлая / тёмная тема" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><span className="ni">{theme === "dark" ? "☀️" : "🌙"}</span></button>
        {isOwner && <button className={`navlink ${more ? "active" : ""}`} onClick={() => setMore(!more)}><span className="ni">☰</span>Ещё</button>}
        {!isOwner && <button className="navlink m-sec" title="Выйти" onClick={() => confirm("Выйти из кабинета?") && signOut(auth)}><span className="ni">⎋</span></button>}
      </nav>
      {more && <div className="msheet-back" onClick={() => setMore(false)}>
        <div className="msheet" onClick={(e) => e.stopPropagation()}>{menu}{foot}</div></div>}
      <main className="main"><PullToRefresh /><InstallHint /><Outlet /></main>
    </div>
  );
}
