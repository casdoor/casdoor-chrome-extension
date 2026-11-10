/** @type {import("tailwindcss").Config} */
export default {
  content: ["./src/popup/**/*.{html,tsx,ts}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f1efff",
          100: "#e4e0ff",
          500: "#6a52ef",
          600: "#5a3fe0",
          700: "#4a31c2",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "PingFang SC", "Microsoft YaHei", "sans-serif"],
      },
    },
  },
  plugins: [],
};
