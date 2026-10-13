import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#10B981", dark: "#059669", light: "#D1FAE5" },
        accent: { DEFAULT: "#F59E0B", light: "#FEF3C7" },
        ink: { DEFAULT: "#0F172A", soft: "#334155", muted: "#64748B" },
      },
      fontFamily: { sans: ["Heebo", "Rubik", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12)" },
      borderRadius: { xl2: "1.25rem" },
      keyframes: {
        pop: { "0%": { transform: "scale(0.96)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
      },
      animation: { pop: "pop .18s ease-out" },
    },
  },
  plugins: [],
};
export default config;
