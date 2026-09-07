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
          hover: "var(--bg-hover)",
        },
        border: {
          DEFAULT: "var(--border)",
          active: "var(--border-active)",
        },
        text: {
          DEFAULT: "var(--text)",
          dim: "var(--text-dim)",
          muted: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          dim: "var(--accent-dim)",
          wash: "var(--accent-wash)",
        },
        up: "var(--up)",
        down: "var(--down)",
        warn: "var(--warn)",
        bullish: "var(--bullish)",
        neutral: "var(--neutral)",
        bearish: "var(--bearish)",
        status: {
          good: "var(--status-good)",
          bad: "var(--status-bad)",
          info: "var(--status-info)",
        },
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
