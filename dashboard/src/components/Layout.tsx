import { NavLink, Outlet } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { modules } from "../lib/modules";
import { useEffect, useState } from "react";
import { useWorkspace } from "../lib/workspace";
import PullToRefresh from "./PullToRefresh";
import { useCollection } from "../lib/store";
import { Task } from "../lib/types";
import { checkReminders } from "../lib/reminders";

function Reminders() {
  const { items } = useCollection<Task>("tasks");
  useEffect(() => {
    checkReminders(items);
    const t = setInterval(() => checkReminders(items), 30000);
    return () => clearInterval(t);
  }, [items]);
  return null;
}

const nav = [
  { to: "/", label: "Главная", icon: "◧" },
  { to: "/planner", label: "Планер", icon: "☑" },
  { to: "/tasks", label: "Задания", icon: "▦" },
  { to: "/monthly", label: "Ежемесячные", icon: "↻" },
  { to: "/clients", label: "Клиенты", icon: "◉" },
  { to: "/projects", label: "Проекты", icon: "◆" },
  { to: "/notes", label: "Заметки", icon: "✎" },
  { to: "/admin", label: "Админка", icon: "⚙" },
];

export default function Layout() {
  const { user } = useAuth();
  const { isOwner } = useWorkspace();
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("theme") || "light"; } catch { return "light"; } });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">OPORA</div>
        {(isOwner ? [nav[0], ...modules.map((m) => ({ to: "/" + m.path, label: m.title, icon: m.icon })), ...nav.slice(1)] : nav.filter((n) => n.to === "/tasks" || n.to === "/monthly")).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className="navlink">
            <span>{n.icon}</span>{n.label}
          </NavLink>
        ))}
        <div className="side-foot">
          <button className="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "☀ Светлая" : "☾ Тёмная"}
          </button>
          <div className="muted small">{user?.email}</div>
          <button className="ghost" onClick={() => signOut(auth)}>Выйти</button>
          <div className="muted small">версия {__BUILD__}</div>
        </div>
      </aside>
      <main className="main">{isOwner && <Reminders />}<PullToRefresh /><Outlet /></main>
    </div>
  );
}
