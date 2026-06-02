import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./assets/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <Toaster position="top-center" />
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
