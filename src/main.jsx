import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import LandingPage from "./LandingPage.jsx";
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

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {shouldOpenApplication() ? <App /> : <LandingPage />}
  </React.StrictMode>
);
