import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import "./ajustes.css";
import "./correcoes.css";

const target = document.getElementById("app");
if (!target) throw new Error("Elemento principal do aplicativo não encontrado.");
createRoot(target).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/**
 * Ativado apenas pelo build de homologação, nunca pelo piloto de desenvolvimento.
 * A PWA nunca intercepta as chamadas autenticadas /api/*.
 */
if (
  import.meta.env.VITE_STAGING_PWA === "1" &&
  "serviceWorker" in navigator &&
  (location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1")
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* O aplicativo permanece online sem service worker. */
    });
  });
}
