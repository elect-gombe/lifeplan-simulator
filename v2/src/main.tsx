import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./state/store";
import "./index.css";

// テーマ初期化（OS 設定 or 保存値）
const savedTheme = localStorage.getItem("lifeplan-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.theme = savedTheme ?? (prefersDark ? "dark" : "light");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
