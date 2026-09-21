import { execFileSync } from "node:child_process";

const chart = "deploy/helm/mcvv";
const common = [
  "--set",
  "image.repository=example.azurecr.io/web/prod",
  "--set",
  "migration.repository=example.azurecr.io/migration/prod",
];
execFileSync("helm", ["lint", chart, "--strict", ...common], { stdio: "inherit" });
for (const environment of ["prod", "stg"]) {
  const rendered = execFileSync(
    "helm",
    [
      "template",
      "mcvv",
      chart,
      ...common,
      "--set",
      `environment=${environment}`,
      "--set",
      "caSecret=test-ca",
      "--set",
      "ingress.enabled=true",
      "--set",
      "ingress.host=mcvv.example",
      "--set",
      "ingress.tlsSecret=test-tls",
    ],
    { encoding: "utf8" },
  );
  if (
    !rendered.includes("kind: Deployment") ||
    !rendered.includes("kind: Job") ||
    !rendered.includes("kind: Ingress")
  ) {
    throw new Error("Chart resources are missing");
  }
  if (rendered.includes("STAGING_BASIC_PASSWORD") !== (environment === "stg"))
    throw new Error("Staging configuration mismatch");
}
console.log("Helm production/staging templates verified.");
