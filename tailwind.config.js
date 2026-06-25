/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand:       "#111E7B",
        "brand-light": "#22C5FE",
        muted:       "#6B7280",
        warning:     "#F59E0B",
        danger:      "#EF4444",
        success:     "#10B981",
        "bg-primary": "var(--color-bg-primary)",
        "bg-surface": "var(--color-bg-surface)",
        "color-text": "var(--color-text)",
        "color-border": "var(--color-border)",
      },
      fontFamily: {
        sans: ["Inter", "SF Pro Display", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 20px rgba(0,0,0,0.10)",
      },
      keyframes: {
        scanLine: {
          "0%,100%": { top: "10%", opacity: 1 },
          "50%":     { top: "85%", opacity: 0.7 },
        },
      },
      animation: {
        "scan-line": "scanLine 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
