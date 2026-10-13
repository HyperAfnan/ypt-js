import { execSync } from "node:child_process";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "es2022",
  onSuccess: async () => {
    execSync("tsc -p tsconfig.build.json && cp dist/index.d.ts dist/index.d.cts");
  },
});
