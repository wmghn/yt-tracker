/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "sans-serif"],
        mono: ["'DM Mono'", "monospace"],
      },
      colors: {
        surface: {
          DEFAULT: "#0f1117",
          1: "#161b25",
          2: "#1d2535",
          3: "#252e42",
        },
        accent: {
          DEFAULT: "#00d084",
          dim: "#00a369",
          muted: "rgba(0,208,132,0.12)",
        },
        border: "rgba(255,255,255,0.08)",
      },
    },
  },
  plugins: [],
};
