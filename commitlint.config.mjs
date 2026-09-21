const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "chore",
        "docs",
        "style",
        "refactor",
        "test",
        "perf",
        "ci",
        "build",
        "revert",
      ],
    ],
    "header-max-length": [2, "always", 100],
  },
};

export default config;
