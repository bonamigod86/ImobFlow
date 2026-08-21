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
        // Identity based on the imobFlow logo: emerald green accents (#12C58B)
        // + deep navy text/heads (#0E1E52). Clean, light-touch brand palette.
        brand: {
          50: "#e9fbf4",
          100: "#cdf8e7",
          200: "#a0efd2",
          300: "#66e2b8",
          400: "#2fd39b",
          500: "#12c58b",
          600: "#0aa67a",
          700: "#098563",
          800: "#0b6952",
          900: "#0a5744",
        },
        navy: {
          50: "#eef1fb",
          100: "#cdd6f1",
          200: "#9aa8e0",
          300: "#6a7ccc",
          400: "#4153ad",
          500: "#27378c",
          600: "#182766",
          700: "#12204f",
          800: "#0e1e52",
          900: "#0a1638",
          950: "#03060f",
        },
        // Light-mode scale (Stripe/Linear): low numbers = dark text, high
        // numbers = light surfaces. Keeps ink-*-based components light.
        ink: {
          50: "#0f172a",
          100: "#1e293b",
          200: "#334155",
          300: "#475569",
          400: "#64748b",
          500: "#94a3b8",
          700: "#e2e8f0",
          800: "#f1f5f9",
          900: "#ffffff",
          950: "#f8fafc",
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