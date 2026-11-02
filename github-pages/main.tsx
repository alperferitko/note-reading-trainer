import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import "../app/learning-studio.css";
import "../app/notebook.css";
// Same order as app/layout.tsx: the frost identity, then the colour themes, then the shell.
import "../app/frost.css";
import "../app/palettes.css";
import "../app/shell.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
