import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { OverlayApp } from "@/features/overlay/OverlayApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
