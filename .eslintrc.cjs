/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["next/core-web-vitals"],
  rules: {
    // UI warnings only (you can keep these on)
    "@next/next/no-img-element": "warn",
    "react/no-unescaped-entities": "off",
  },
  overrides: [
    {
      files: [
        "src/app/api/**/*.{ts,tsx}",
        "src/app/lib/**/*.{ts,tsx}",
        "src/app/tinder/**/*.{ts,tsx}",
      ],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "prefer-const": "off",
        "@typescript-eslint/ban-ts-comment": "off",
      },
    },
  ],
};
