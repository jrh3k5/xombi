import { AppInitializer } from "./lib/app_initializer.js";

async function main(): Promise<void> {
  await AppInitializer.initialize();
}

main().catch((error) => {
  console.error("failed to run main():", error);
  // log and rethrow - it's an anti-pattern, but logging
  // gets a stacktrace and throwing signals an erroneous exist
  throw error;
});
