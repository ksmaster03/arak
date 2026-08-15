import { build } from "esbuild";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * รวมทุกอย่างที่ปลั๊กอินต้องใช้ให้อยู่ในไฟล์เดียวต่อจุดเข้า
 *
 * จำเป็น ไม่ใช่ของหรูหรา — Claude Code ติดตั้งปลั๊กอินด้วยการ **คัดลอกเฉพาะโฟลเดอร์ปลั๊กอิน**
 * ไปไว้ในแคช (โหมด link ใช้บนวินโดวส์ไม่ได้) ถ้าโค้ดยัง import ข้ามไปแพ็กเกจอื่นในเวิร์กสเปซ
 * ปลั๊กอินที่ถูกคัดลอกไปจะพังทันทีเพราะ symlink ของ pnpm ไม่ได้ตามไปด้วย
 *
 * ผลลัพธ์คือปลั๊กอินที่ไม่มี dependency เลย ติดตั้งแล้วใช้ได้ทันทีโดยไม่ต้อง npm install
 */

const here = dirname(fileURLToPath(import.meta.url));

const SHEBANG = "#!/usr/bin/env node";

/**
 * `yaml` มีแต่รุ่น CommonJS สำหรับ node ตัวที่ bundle เป็น ESM จึงต้องมี `require` ให้มันใช้
 * ใส่ผ่าน banner ของ esbuild ตรง ๆ ไม่ได้ เพราะ banner จะไปอยู่ **เหนือ** shebang
 * แล้ว shebang ที่ตกไปบรรทัดสองทำให้ไฟล์ parse ไม่ผ่านทันที
 */
const REQUIRE_SHIM =
  'import { createRequire as __arakCreateRequire } from "node:module";\n' +
  "const require = __arakCreateRequire(import.meta.url);";

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  legalComments: "none",
};

const entries = [
  { from: "src/on-edit.mjs", to: "hooks/on-edit.mjs" },
  { from: "src/session-start.mjs", to: "hooks/session-start.mjs" },
  { from: "src/on-stop.mjs", to: "hooks/on-stop.mjs" },
  // คำสั่ง arak ตัวเต็มมาด้วย เพื่อให้ไม่ต้องติดตั้ง CLI แยกอีกชุด
  { from: "../cli/src/index.ts", to: "bin/arak.mjs" },
];

await Promise.all(
  entries.map((entry) =>
    build({
      ...shared,
      entryPoints: [join(here, entry.from)],
      outfile: join(here, entry.to),
    }),
  ),
);

for (const entry of entries) {
  const path = join(here, entry.to);
  const body = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("#!"))
    .join("\n");

  writeFileSync(path, `${SHEBANG}\n${REQUIRE_SHIM}\n${body}`, "utf8");
  chmodSync(path, 0o755);
}

console.log(`bundled: ${entries.length} ไฟล์ ไม่มี dependency`);
