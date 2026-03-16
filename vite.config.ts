import { defineConfig } from "vite";
import react    from "@vitejs/plugin-react";
import path     from "path";
import ytProxy  from "./yt-proxy-plugin";

export default defineConfig({
  plugins: [
    react(),
    ytProxy(),   // handles /yt-proxy/* with cookies.txt auth
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: { manualChunks: { xlsx: ["xlsx"] } },
    },
  },
});
