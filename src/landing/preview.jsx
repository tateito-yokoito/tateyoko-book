import React from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import LandingPage from "../LandingPage.jsx";

// Isolated HP preview: do not initialize App, authentication, or backend clients.
createRoot(document.getElementById("root")).render(<React.StrictMode><LandingPage reviewOnly /></React.StrictMode>);
