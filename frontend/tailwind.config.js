/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0D12",
        surface: "#12151C",
        raised: "#191D27",
        line: "#242A37",
        ink: "#E8EAF0",
        muted: "#8C94A7",
        faint: "#5D6578",
        partner: "#60A5FA",
        me: "#34D399",
        danger: "#F87171",
        warn: "#FBBF24",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI Variable", "Segoe UI", "system-ui", "sans-serif"],
      },
      boxShadow: {
        dock: "0 -12px 40px -12px rgba(0,0,0,.6)",
      },
      keyframes: {
        pulseDot: { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.3 } },
      },
      animation: {
        "pulse-dot": "pulseDot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
