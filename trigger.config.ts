import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID!,
  maxDuration: 600,
  dirs: ["trigger"],
  build: {
    // tar-stream must NOT be external — it needs to be bundled into the
    // deploy image so the scan task can decompress GitHub tarballs.
    external: [],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
});
