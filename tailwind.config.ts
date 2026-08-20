import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        ink: {
          950: "#0f172a",
          900: "#1e293b",
          700: "#334155",
          500: "#64748b",
          300: "#cbd5e1",
          100: "#f1f5f9",
          50: "#f8fafc",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Inter", "Segoe UI", "Roboto", "sans-serif"],
      },
      container: {
        center: true,
        padding: "1rem",
        screens: {
          "2xl": "1280px",
        },
      },
    },
  },
  plugins: [],
};

export default config;