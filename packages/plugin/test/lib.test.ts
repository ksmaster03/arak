import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — ฮุกเขียนเป็น .mjs ล้วนเพื่อให้รันได้โดยไม่ต้อง build
import { discoverProjectRoots, findProjectRoot, toRepoPath } from "../hooks/lib.mjs";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "arak-hook-"));
  // โครงแบบ monorepo — ไฟล์ตั้งค่าไม่ได้อยู่ที่ราก
  mkdirSync(join(root, "apps/api/prisma"), { recursive: true });
  mkdirSync(join(root, "apps/web"), { recursive: true });
  mkdirSync(join(root, "node_modules/pkg"), { recursive: true });
  writeFileSync(join(root, "apps/api/arak.config.yaml"), "catalog: pii-catalog.yaml\n");
  writeFileSync(join(root, "node_modules/pkg/arak.config.yaml"), "catalog: x.yaml\n");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("findProjectRoot", () => {
  it("ไล่ขึ้นจากไฟล์ที่ถูกแก้จนเจอไฟล์ตั้งค่าที่ใกล้ที่สุด", () => {
    const schema = join(root, "apps/api/prisma/schema.prisma");
    expect(findProjectRoot(schema, root)).toBe(join(root, "apps/api"));
  });

  it("คืน null เมื่อไม่มีไฟล์ตั้งค่าอยู่ในสายนั้นเลย", () => {
    expect(findProjectRoot(join(root, "apps/web/page.tsx"), root)).toBeNull();
  });

  it("ไม่ไต่ออกนอกขอบเขตของ cwd", () => {
    // ไฟล์อยู่นอก cwd ที่กำหนด จึงต้องไม่ไปหยิบไฟล์ตั้งค่าของโปรเจกต์อื่น
    expect(findProjectRoot("/somewhere/else/schema.prisma", join(root, "apps/web"))).toBeNull();
  });
});

describe("discoverProjectRoots", () => {
  it("หาไฟล์ตั้งค่าที่ซ้อนอยู่ในโฟลเดอร์ย่อยได้", () => {
    expect(discoverProjectRoots(root)).toEqual([join(root, "apps/api")]);
  });

  it("ไม่เข้าไปใน node_modules", () => {
    const found = discoverProjectRoots(root) as string[];
    expect(found.some((p) => p.includes("node_modules"))).toBe(false);
  });
});

describe("toRepoPath", () => {
  it("ใช้ขีดหน้าเสมอ เพื่อให้ตรงกับที่แคตตาล็อกเก็บไว้แม้รันบนวินโดวส์", () => {
    const result = toRepoPath(join(root, "apps/api"), join(root, "apps/api/prisma/schema.prisma"));
    expect(result).toBe("prisma/schema.prisma");
  });
});
