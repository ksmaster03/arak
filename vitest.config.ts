import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  // เทสต์ชี้ไปที่ซอร์สโดยตรง จะได้ไม่ต้อง build ก่อนรันเทสต์ทุกครั้ง
  resolve: {
    alias: {
      "@arak/core": src("core"),
      "@arak/prisma": src("prisma"),
      "@arak/detect-th": src("detect-th"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
