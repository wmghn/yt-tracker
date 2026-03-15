/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        surface: {
          DEFAULT: "#F7F6F3",
          1: "#FFFFFF",
          2: "#F0EEE9",
          3: "#E8E5DE",
        },
        accent: {
          DEFAULT: "#2563EB",
          dim: "#1D4ED8",
          muted: "rgba(37,99,235,0.08)",
          light: "rgba(37,99,235,0.12)",
        },
        ink: {
          DEFAULT: "#1A1814",
          secondary: "#3D3A34",
          tertiary: "#6B6760",
          muted: "#9B9890",
        },
        border: "#E2DED6",
        "border-strong": "#C8C4BC",
      },
    },
  },
  plugins: [],
};
