import NeylaLoading from "./components/NeylaLoading";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { modules } from "./lib/modules";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import PnL from "./pages/PnL";
import Wallet from "./pages/Wallet";
import Products from "./pages/Products";
import Knowledge from "./pages/Knowledge";
import StaffHome from "./pages/StaffHome";
import ClientPortal from "./pages/ClientPortal";
import Tasks from "./pages/Tasks";
import Monthly from "./pages/Monthly";
import Report from "./pages/Report";
import VerifyEmail from "./pages/VerifyEmail";
import { WorkspaceProvider, useWorkspace } from "./lib/workspace";
import Clients from "./pages/Clients";
import Projects from "./pages/Projects";
import Admin from "./pages/Admin";
import Hub from "./components/Hub";
// объединённые разделы: Клиенты | Проекты и Финансы (P&L | Отчёт)
const CLI = [{ to: "/projects", label: "◆ Проекты", el: <Projects /> }, { to: "/clients", label: "◉ Клиенты и воронка", el: <Clients /> }];
const FIN = [{ to: "/pnl", label: "₽ P&L", el: <PnL /> }, { to: "/report", label: "📊 Отчёт", el: <Report /> }];
import "./styles.css";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <NeylaLoading text="Секунду, открываю кабинет" />;
  return user ? <WorkspaceProvider><Layout /></WorkspaceProvider> : <Navigate to="/login" replace />;
}

// Сотрудник видит только «Задания»
function OwnerOnly({ children }: { children: JSX.Element }) {
  const { isOwner, ready } = useWorkspace();
  if (!ready) return <NeylaLoading />;
  return isOwner ? children : <Navigate to="/" replace />;
}

// Главная: у владельца своя, у сотрудника своя
function HomeSwitch() {
  const { isOwner, ready, clientOf } = useWorkspace();
  if (!ready) return <NeylaLoading />;
  if (clientOf) return <ClientPortal />;
  return isOwner ? <Home /> : <MemberGate><StaffHome /></MemberGate>;
}

// Кабинет клиента: клиенту — свой, владельцу — предпросмотр
function ClientGate() {
  const { isOwner, clientOf, ready, wsId } = useWorkspace();
  if (!ready) return <NeylaLoading />;
  // сотрудник тоже может открыть кабинет своего клиента — только просмотр
  return isOwner || clientOf || wsId ? <ClientPortal /> : <Navigate to="/" replace />;
}

// Общие разделы: владелец или приглашённый сотрудник; остальные — «нет доступа»
function MemberGate({ children }: { children: JSX.Element }) {
  const { wsId, ready, isOwner, clientOf } = useWorkspace();
  const { user } = useAuth();
  if (clientOf) return <Navigate to="/" replace />;
  if (!ready) return <NeylaLoading />;
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
            <Route index element={<HomeSwitch />} />
            <Route path="client" element={<ClientGate />} />
            <Route path="tasks" element={<MemberGate><Tasks /></MemberGate>} />
            <Route path="kb" element={<MemberGate><Knowledge /></MemberGate>} />
            <Route path="monthly" element={<MemberGate><Monthly /></MemberGate>} />
            <Route path="products" element={<OwnerOnly><Products /></OwnerOnly>} />
            <Route path="wallet" element={<OwnerOnly><Wallet /></OwnerOnly>} />
            <Route path="pnl" element={<OwnerOnly><Hub tabs={FIN} /></OwnerOnly>} />
            <Route path="clients" element={<OwnerOnly><Hub tabs={CLI} /></OwnerOnly>} />
            <Route path="projects" element={<OwnerOnly><Hub tabs={CLI} /></OwnerOnly>} />
            <Route path="report" element={<OwnerOnly><Hub tabs={FIN} /></OwnerOnly>} />
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
