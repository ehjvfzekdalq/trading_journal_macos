import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("Nemesis Trading Journal - Starting React app...");

const rootElement = document.getElementById("root");
console.log("Root element:", rootElement);

if (rootElement) {
  try {
    ReactDOM.createRoot(rootElement as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("React app mounted successfully!");
  } catch (error) {
    console.error("Failed to mount React app:", error);
  }
} else {
  console.error("Root element not found!");
}
