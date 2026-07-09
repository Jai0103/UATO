import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#10233f",
          blue: "#1f6feb",
          gold: "#c9a227",
          slate: "#64748b",
          light: "#f6f8fb"
        }
      }
    }
  },
  plugins: []
};

export default config;
