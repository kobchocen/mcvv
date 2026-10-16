import buildInfo from "@/lib/build-info.json";

export type BuildInfo = { version: string; buildNumber: string; revision: string };

/**
 * Effective build identity. build-info.json may be rewritten at image build time;
 * BUILD_NUMBER / APP_REVISION env vars (if set) take precedence.
 */
export function getBuildInfo(): BuildInfo {
  return {
    ...buildInfo,
    ...(process.env.BUILD_NUMBER ? { buildNumber: process.env.BUILD_NUMBER } : {}),
    ...(process.env.APP_REVISION ? { revision: process.env.APP_REVISION } : {}),
  };
}
