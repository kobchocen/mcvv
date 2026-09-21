const config = {
  repositoryUrl: "https://github.com/kobchocen/mcvv.git",
  tagFormat: "v${version}",
  branches: [
    "main",
    { name: "develop", channel: "develop", prerelease: "develop" },
    // semantic-release requires unique prerelease identifiers: one active RC branch.
    { name: "release/*", channel: "rc", prerelease: "rc" },
  ],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          { breaking: true, release: "major" },
          { type: "refactor", release: "patch" },
          { type: "build", release: "patch" },
          { type: "ci", release: "patch" },
        ],
      },
    ],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    "./scripts/release/plugin.mjs",
    [
      "@semantic-release/git",
      {
        assets: [
          "package.json",
          "CHANGELOG.md",
          "src/lib/build-info.json",
          "deploy/helm/mcvv/Chart.yaml",
        ],
        message: "chore(release): v${nextRelease.version} [skip ci]",
      },
    ],
    [
      "@semantic-release/github",
      {
        assets: [{ path: "dist/release/*" }],
        successComment: false,
        failComment: false,
        releasedLabels: false,
      },
    ],
  ],
};

export default config;
