import React from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import App from "./App.jsx";
import LandingPage from "./LandingPage.jsx";
import AdminReview from "./admin/AdminReview.jsx";
import "./index.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wquxjeqkumossjxehdop.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const adminSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function shouldOpenApplication() {
  const params = new URLSearchParams(window.location.search);
  const applicationParameters = [
    "app",
    "entry",
    "beta",
    "dev",
    "token",
    "supporter_invite",
    "sharing_invite",
    "sequence"
  ];

  return applicationParameters.some(key => params.has(key));
}

function RootScreen() {
  const params = new URLSearchParams(window.location.search);

  if (params.has("admin")) {
    return <AdminReview supabaseClient={adminSupabaseClient} />;
  }

  return shouldOpenApplication() ? <App /> : <LandingPage />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootScreen />
  </React.StrictMode>
);
