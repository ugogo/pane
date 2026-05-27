import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./App";
import { AreaSelector } from "./views/AreaSelector";
import { CapturePreview } from "./views/CapturePreview";
import "./styles.css";

function resolveView() {
  const view = new URL(window.location.href).searchParams.get("view");
  switch (view) {
    case "area-selector":
      return <AreaSelector />;
    case "preview":
      return <CapturePreview />;
    default:
      return <App />;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{resolveView()}</React.StrictMode>,
);

if (!new URL(window.location.href).searchParams.has("view")) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void getCurrentWindow().show().catch(console.error);
    });
  });
}
