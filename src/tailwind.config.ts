import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        accent: "#0d7a5f",
        panel: "#f5f5f4",
        line: "#e5e7eb",
      },
    },
  },
  plugins: [],
} satisfies Config;
