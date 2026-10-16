import { getBuildInfo } from "@/lib/build-info";

export function BuildVersion() {
  const buildInfo = getBuildInfo();
  return (
    <span data-app-version={buildInfo.version} data-build-number={buildInfo.buildNumber}>
      v{buildInfo.version} · build {buildInfo.buildNumber}
    </span>
  );
}
