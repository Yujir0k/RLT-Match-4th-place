const colors = require("tailwindcss/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "primary-base": "#1F66FF",
        "primary-hover": "#74A4FF",
        "primary-light": "#EDF3FF",
        "bg-surface": "#F4F8FF",
        text: {
          primary: colors.slate[900],
          secondary: colors.slate[400],
        },
        border: {
          DEFAULT: colors.slate[200],
        },
      },
      fontFamily: {
        sans: ['"Exo 2"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        h1: ["64px", { lineHeight: "72px" }],
        h2: ["44px", { lineHeight: "48px" }],
        h3: ["32px", { lineHeight: "40px" }],
        control: ["16px", { lineHeight: "24px" }],
      },
      borderRadius: {
        lg: "8px",
      },
      boxShadow: {
        halo: "0 0 0 4px #EDF3FF",
      },
    },
  },
  plugins: [],
};
