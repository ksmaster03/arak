import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectFiles } from "../src/scan.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "arak-collect-"));
  mkdirSync(join(root, "prisma"), { recursive: true });
  mkdirSync(join(root, "src/deep"), { recursive: true });
  mkdirSync(join(root, "node_modules/pkg"), { recursive: true });
  mkdirSync(join(root, "empty"), { recursive: true });

  writeFileSync(join(root, "prisma/seed.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "prisma/schema.prisma"), "model A {}\n");
  writeFileSync(join(root, "src/index.ts"), "export {};\n");
  writeFileSync(join(root, "src/deep/util.ts"), "export {};\n");
  writeFileSync(join(root, "src/logo.png"), "not text");
  writeFileSync(join(root, "node_modules/pkg/index.ts"), "export {};\n");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("collectFiles", () => {
  it("ไล่ทั้งโปรเจกต์เมื่อไม่ระบุพาธ และข้าม node_modules กับไฟล์ที่ไม่ใช่ข้อความ", () => {
    const { files, unresolved } = collectFiles(root, []);
    expect(unresolved).toEqual([]);
    expect(files).toContain("prisma/seed.ts");
    expect(files).toContain("src/deep/util.ts");
    expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
    expect(files).not.toContain("src/logo.png");
  });

  it("รับโฟลเดอร์แล้วไล่ข้างในให้", () => {
    const { files, unresolved } = collectFiles(root, ["prisma"]);
    expect(unresolved).toEqual([]);
    expect(files).toEqual(["prisma/seed.ts"]);
  });

  it("รับ glob แล้วขยายเป็นรายชื่อไฟล์", () => {
    const { files, unresolved } = collectFiles(root, ["src/**/*.ts"]);
    expect(unresolved).toEqual([]);
    expect(files).toEqual(["src/deep/util.ts", "src/index.ts"]);
  });

  it("รับไฟล์ที่ระบุตรง ๆ แม้นามสกุลจะไม่อยู่ในรายการปกติ เพราะผู้ใช้สั่งมาเอง", () => {
    const { files, unresolved } = collectFiles(root, ["src/logo.png"]);
    expect(unresolved).toEqual([]);
    expect(files).toEqual(["src/logo.png"]);
  });

  it("ไม่ทำรายการซ้ำเมื่อพาธที่ให้มาทับกัน", () => {
    const { files } = collectFiles(root, ["prisma", "prisma/seed.ts", "prisma/*.ts"]);
    expect(files).toEqual(["prisma/seed.ts"]);
  });

  /**
   * นี่คือเคสที่เคยพัง — `arak scan <โฟลเดอร์>` เคยคืนรหัส 0 พร้อมข้อความว่าไม่พบอะไร
   * ทั้งที่ไม่ได้อ่านไฟล์สักไฟล์ ด่าน CI ที่เขียนพาธผิดจึงเขียวอยู่ได้ตลอดกาล
   */
  it("บอกว่าพาธไหนหาไม่เจอ แทนที่จะเงียบแล้วรายงานว่าสะอาด", () => {
    const { files, unresolved } = collectFiles(root, ["ไม่มีอยู่จริง"]);
    expect(files).toEqual([]);
    expect(unresolved).toEqual(["ไม่มีอยู่จริง"]);
  });

  it("นับ glob ที่ไม่ตรงกับอะไรเลยว่าหาไม่เจอด้วย", () => {
    const { unresolved } = collectFiles(root, ["src/**/*.rb"]);
    expect(unresolved).toEqual(["src/**/*.rb"]);
  });

  it("นับโฟลเดอร์ที่ไม่มีไฟล์ให้สแกนว่าหาไม่เจอ", () => {
    const { unresolved } = collectFiles(root, ["empty"]);
    expect(unresolved).toEqual(["empty"]);
  });

  it("แยกได้ว่าพาธไหนเจอและพาธไหนไม่เจอ ในการเรียกครั้งเดียวกัน", () => {
    const { files, unresolved } = collectFiles(root, ["prisma", "ไม่มี"]);
    expect(files).toEqual(["prisma/seed.ts"]);
    expect(unresolved).toEqual(["ไม่มี"]);
  });
});
