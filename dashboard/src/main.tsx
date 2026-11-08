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
import { AdminClients, AdminStaff } from "./pages/Admin";
import Hub from "./components/Hub";
import StudentHome from "./pages/StudentHome";
// объединённые разделы: Клиенты | Проекты и Финансы (P&L | Отчёт)
const CLI = [{ to: "/projects", label: "◆ Проекты", el: <Projects /> }, { to: "/clients", label: "◉ Клиенты и воронка", el: <Clients /> }];
const FIN = [{ to: "/pnl", label: "₽ P&L", el: <PnL /> }, { to: "/wallet", label: "👛 Личные деньги", el: <Wallet /> }];
const ADM = [{ to: "/admin", label: "👥 Сотрудники", el: <AdminStaff /> }, { to: "/team-clients", label: "💼 Клиенты", el: <AdminClients /> }, { to: "/report", label: "📊 Отчётность", el: <Report /> }];
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
  const { isOwner, ready, clientOf, student } = useWorkspace();
  if (!ready) return <NeylaLoading />;
  if (clientOf) return <ClientPortal />;
  if (student) return <StudentHome />;
  return isOwner ? <Home /> : <MemberGate><StaffHome /></MemberGate>;
}

// Кабинет клиента: клиенту — свой, владельцу — предпросмотр
function ClientGate() {
  const { isOwner, clientOf, ready, wsId } = useWorkspace();
  if (!ready) return <NeylaLoading />;
  // сотрудник тоже может открыть кабинет своего клиента — только просмотр
  return isOwner || clientOf || wsId ? <ClientPortal /> : <Navigate to="/" replace />;
}

// Нет доступа — говорит Нейла: доступ ещё не открыт, напишите в чат поддержки
let REF = ""; try { const r = new URLSearchParams(location.search).get("ref"); if (r) localStorage.setItem("opora-ref", r); REF = localStorage.getItem("opora-ref") || ""; } catch { /* */ }
function NoAccess({ email }: { email: string }) {
  return <div style={{ maxWidth: 520, margin: "40px auto" }}>
    <div className="card" style={{ textAlign: "center", padding: "26px 22px", borderTop: "4px solid #e8873a" }}>
      <img src="neyla.jpg" alt="" style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", boxShadow: "0 6px 18px rgba(22,48,79,.2)" }} />
      <h2 style={{ margin: "12px 0 6px" }}>Привет! Я Нейла 👋</h2>
      <p style={{ margin: "6px 0" }}>Вы зарегистрировались{email ? <> с почтой <b>{email}</b></> : null} — отлично!</p>
      <p style={{ margin: "6px 0" }}>Но ваш кабинет ещё не открыт. Напишите в чат поддержки — бухгалтер ОПОРЫ подключит вас и откроет доступ.</p>
      {REF && <p className="small" style={{ margin: "10px 0", padding: "8px 12px", background: "rgba(232,135,58,.12)", borderRadius: 10 }}>🎁 Вы пришли по рекомендации — скажите об этом в чате, и первый месяц будет со скидкой 20%.</p>}
      <a href="https://t.me/samitovva" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 12, background: "#16304f", color: "#fff", borderRadius: 999, padding: "10px 24px", fontWeight: 700, textDecoration: "none" }}>💬 Чат поддержки</a>
      <div><button className="ghost small" style={{ marginTop: 12 }} onClick={() => import("./lib/firebase").then(({ auth }) => import("firebase/auth").then(({ signOut }) => signOut(auth)))}>Выйти</button></div>
    </div>
  </div>;
}

// Общие разделы: владелец или приглашённый сотрудник; остальные — «нет доступа»
function MemberGate({ children }: { children: JSX.Element }) {
  const { wsId, ready, isOwner, clientOf } = useWorkspace();
  const { user } = useAuth();
  if (clientOf) return <Navigate to="/" replace />;
  if (!ready) return <NeylaLoading />;
  if (!isOwner && user && !user.emailVerified) return <VerifyEmail />;
  return wsId ? children : <NoAccess email={user?.email || ""} />;
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
            <Route path="wallet" element={<OwnerOnly><Hub tabs={FIN} /></OwnerOnly>} />
            <Route path="pnl" element={<OwnerOnly><Hub tabs={FIN} /></OwnerOnly>} />
            <Route path="clients" element={<OwnerOnly><Hub tabs={CLI} /></OwnerOnly>} />
            <Route path="projects" element={<OwnerOnly><Hub tabs={CLI} /></OwnerOnly>} />
            <Route path="report" element={<OwnerOnly><Hub tabs={ADM} /></OwnerOnly>} />
            <Route path="team-clients" element={<OwnerOnly><Hub tabs={ADM} /></OwnerOnly>} />
            <Route path="admin" element={<OwnerOnly><Hub tabs={ADM} /></OwnerOnly>} />
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
