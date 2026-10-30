import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getLang } from "./lib/i18n";
import "./index.css";

// Screen readers and spellcheck follow the chosen UI language
document.documentElement.lang = getLang();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
