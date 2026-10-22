import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { modules } from "./lib/modules";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import PnL from "./pages/PnL";
import Products from "./pages/Products";
import Knowledge from "./pages/Knowledge";
import Tasks from "./pages/Tasks";
import Monthly from "./pages/Monthly";
import Report from "./pages/Report";
import VerifyEmail from "./pages/VerifyEmail";
import { WorkspaceProvider, useWorkspace } from "./lib/workspace";
import Clients from "./pages/Clients";
import Projects from "./pages/Projects";
import Admin from "./pages/Admin";
import "./styles.css";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Загрузка…</div>;
  return user ? <WorkspaceProvider><Layout /></WorkspaceProvider> : <Navigate to="/login" replace />;
}

// Сотрудник видит только «Задания»
function OwnerOnly({ children }: { children: JSX.Element }) {
  const { isOwner, ready } = useWorkspace();
  if (!ready) return <div className="muted">Загрузка…</div>;
  return isOwner ? children : <Navigate to="/tasks" replace />;
}

// Общие разделы: владелец или приглашённый сотрудник; остальные — «нет доступа»
function MemberGate({ children }: { children: JSX.Element }) {
  const { wsId, ready, isOwner } = useWorkspace();
  const { user } = useAuth();
  if (!ready) return <div className="muted">Загрузка…</div>;
  if (!isOwner && user && !user.emailVerified) return <VerifyEmail />;
  return wsId ? children : <><h1>Нет доступа</h1><div className="card">🔒 Владелец ещё не открыл вам доступ. Выйдите и попросите добавить вашу почту.</div></>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route index element={<OwnerOnly><Home /></OwnerOnly>} />
            <Route path="tasks" element={<MemberGate><Tasks /></MemberGate>} />
            <Route path="kb" element={<MemberGate><Knowledge /></MemberGate>} />
            <Route path="monthly" element={<MemberGate><Monthly /></MemberGate>} />
            <Route path="products" element={<OwnerOnly><Products /></OwnerOnly>} />
            <Route path="pnl" element={<OwnerOnly><PnL /></OwnerOnly>} />
            <Route path="clients" element={<OwnerOnly><Clients /></OwnerOnly>} />
            <Route path="projects" element={<OwnerOnly><Projects /></OwnerOnly>} />
            <Route path="report" element={<OwnerOnly><Report /></OwnerOnly>} />
            <Route path="admin" element={<OwnerOnly><Admin /></OwnerOnly>} />
            {modules.map((m) => <Route key={m.id} path={m.path} element={<OwnerOnly><m.component /></OwnerOnly>} />)}
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", async () => {
    const reg = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
    // Проверяем обновления при каждом возврате в приложение
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update(); });
    // Новая версия активировалась — перезагружаемся один раз
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloaded) { reloaded = true; location.reload(); }
    });
  });
}
