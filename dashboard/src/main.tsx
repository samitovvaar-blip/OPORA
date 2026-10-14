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
import Clients from "./pages/Clients";
import Projects from "./pages/Projects";
import Admin from "./pages/Admin";
import "./styles.css";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Загрузка…</div>;
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route index element={<Home />} />
            <Route path="planner" element={<Planner />} />
            <Route path="notes" element={<Notes />} />
            <Route path="clients" element={<Clients />} />
            <Route path="projects" element={<Projects />} />
            <Route path="admin" element={<Admin />} />
            {modules.map((m) => <Route key={m.id} path={m.path} element={<m.component />} />)}
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  </React.StrictMode>
);
