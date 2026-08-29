import React from "react";
import { createRoot } from "react-dom/client";
import App, { supabaseClient as adminSupabaseClient } from "./App.jsx";
import LandingPage from "./LandingPage.jsx";
import AdminReview from "./admin/AdminReview.jsx";
import VoiceLibraryPage from "./VoiceLibraryPage.jsx";
import VoicePlaybackPage from "./VoicePlaybackPage.jsx";
import "./index.css";

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

  if (params.has("voice")) {
    return (
      <VoicePlaybackPage
        supabaseClient={adminSupabaseClient}
        publicId={params.get("voice") || ""}
      />
    );
  }

  if (params.has("library")) {
    return <VoiceLibraryPage supabaseClient={adminSupabaseClient} />;
  }

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
