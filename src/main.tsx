import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("Nemesis Trading Journal - Starting React app...");
console.log("Platform:", navigator.platform);
console.log("User Agent:", navigator.userAgent);

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  document.body.innerHTML = `
    <div style="padding: 20px; color: white; background: #1A1A1A; font-family: monospace;">
      <h1>Application Error</h1>
      <p style="color: red;">${event.error?.message || 'Unknown error'}</p>
      <pre style="background: #000; padding: 10px; overflow: auto;">${event.error?.stack || ''}</pre>
    </div>
  `;
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

const rootElement = document.getElementById("root");
console.log("Root element:", rootElement);

if (rootElement) {
  try {
    console.log("Creating React root...");
    const root = ReactDOM.createRoot(rootElement as HTMLElement);
    console.log("Rendering app...");
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("React app mounted successfully!");
  } catch (error) {
    console.error("Failed to mount React app:", error);
    rootElement.innerHTML = `
      <div style="padding: 20px; color: white; background: #1A1A1A; font-family: monospace;">
        <h1>React Mount Error</h1>
        <p style="color: red;">${error instanceof Error ? error.message : String(error)}</p>
        <pre style="background: #000; padding: 10px; overflow: auto;">${error instanceof Error ? error.stack : ''}</pre>
      </div>
    `;
  }
} else {
  console.error("Root element not found!");
  document.body.innerHTML = `
    <div style="padding: 20px; color: white; background: #1A1A1A; font-family: monospace;">
      <h1>Initialization Error</h1>
      <p style="color: red;">Root element with id "root" not found in DOM!</p>
    </div>
  `;
}
