import buildInfo from "@/lib/build-info.json";

export function BuildVersion() {
  return (
    <span data-app-version={buildInfo.version} data-build-number={buildInfo.buildNumber}>
      v{buildInfo.version} · build {buildInfo.buildNumber}
    </span>
  );
}
