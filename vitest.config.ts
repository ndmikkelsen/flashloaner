import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "./bot",
    include: ["__tests__/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    globals: true,
  },
});
