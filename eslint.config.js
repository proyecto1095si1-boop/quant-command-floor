const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    files: ["server/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-assignment": "off",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["dist/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        module: "readonly",
        QCF: "readonly",
        QCFAudit: "readonly",
        QCFAgentProfiles: "readonly",
        QCFData: "readonly",
        QCFOps: "readonly",
        QCFPlatform: "readonly",
        QCFResearch: "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": "off",
    },
  },
];
