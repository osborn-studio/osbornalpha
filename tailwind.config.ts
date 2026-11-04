import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "var(--bg)",
          elevated: "var(--bg-elevated)",
          card: "var(--bg-card)",
        },
        border: "var(--border)",
        text: {
          DEFAULT: "var(--text)",
          dim: "var(--text-dim)",
          muted: "var(--text-muted)",
        },
        accent: { DEFAULT: "var(--accent)", dim: "var(--accent-dim)" },
        up: "var(--up)",
        down: "var(--down)",
        warn: "var(--warn)",
        danger: "var(--danger)",
        bullish: "var(--bullish)",
        neutral: "var(--neutral)",
        bearish: "var(--bearish)",
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "SF Pro Text",
          "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
