import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";
import { cartographer } from "@replit/vite-plugin-cartographer";

export default defineConfig(({ command }) => {
  const rawPort = process.env.PORT;
  const port = rawPort ? Number(rawPort) : 5173;
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return {
    base: process.env.BASE_PATH || "/",
    plugins: [
      mockupPreviewPlugin(),
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
    ...(command === "serve"
      ? {
          server: {
            port,
            host: "0.0.0.0",
            allowedHosts: true,
            fs: {
              strict: true,
            },
          },
          preview: {
            port,
            host: "0.0.0.0",
            allowedHosts: true,
          },
        }
      : {}),
  };
});
