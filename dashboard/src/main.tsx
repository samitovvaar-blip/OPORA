import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { modules } from "./lib/modules";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Planner from "./pages/Planner";
import Notes from "./pages/Notes";
import Tasks from "./pages/Tasks";
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route index element={<OwnerOnly><Home /></OwnerOnly>} />
            <Route path="planner" element={<OwnerOnly><Planner /></OwnerOnly>} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="notes" element={<OwnerOnly><Notes /></OwnerOnly>} />
            <Route path="clients" element={<OwnerOnly><Clients /></OwnerOnly>} />
            <Route path="projects" element={<OwnerOnly><Projects /></OwnerOnly>} />
            <Route path="admin" element={<OwnerOnly><Admin /></OwnerOnly>} />
            {modules.map((m) => <Route key={m.id} path={m.path} element={<m.component />} />)}
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  </React.StrictMode>
);
