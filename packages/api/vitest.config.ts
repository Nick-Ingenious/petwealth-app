import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // DB integration test files share one database; running them in parallel lets
    // one file's inserts race another's count assertions. Run files sequentially.
    fileParallelism: false,
  },
});
