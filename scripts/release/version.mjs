import fs from "node:fs";
import path from "node:path";

export function syncVersion(root, identity) {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = identity.version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  const chartPath = path.join(root, "deploy/helm/mcvv/Chart.yaml");
  let chart = fs.readFileSync(chartPath, "utf8");
  for (const key of ["version", "appVersion"]) {
    const pattern = new RegExp(`^${key}: .+$`, "gm");
    if ([...chart.matchAll(pattern)].length !== 1)
      throw new Error(`Missing/duplicate chart ${key}`);
    chart = chart.replace(pattern, `${key}: "${identity.version}"`);
  }
  fs.writeFileSync(chartPath, chart);
  fs.writeFileSync(
    path.join(root, "src/lib/build-info.json"),
    JSON.stringify(
      {
        version: identity.version,
        buildNumber: identity.buildNumber,
        revision: identity.revision,
      },
      null,
      2,
    ) + "\n",
  );
}
