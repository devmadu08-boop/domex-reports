import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./services/firebase.js";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
