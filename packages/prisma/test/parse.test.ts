import { describe, expect, it } from "vitest";
import { isRelationType, parsePrismaSchema, type BlockKind } from "../src/parse.js";

const SCHEMA = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// ผู้ใช้ระบบ
model User {
  id        String   @id @default(cuid())
  /// อีเมลที่ใช้ล็อกอิน
  /// @pii(contact)
  email     String   @unique
  citizenId String?  /// @pii(category=government_id)
  // คอมเมนต์ธรรมดา ไม่ใช่เอกสาร
  nickname  String?
  homepage  String   @default("http://example.com/a//b")
  role      Role     @default(STAFF)
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  tenantId  String
  posts     Post[]

  @@index([tenantId])
  @@map("users")
}

enum Role {
  ADMIN
  STAFF
}

model Tenant {
  id    String @id
  name  String
  users User[]
}

model Post {
  id       String @id
  authorId String
}
`;

describe("parsePrismaSchema", () => {
  const schema = parsePrismaSchema(SCHEMA, "prisma/schema.prisma");
  const byName = new Map(schema.blocks.map((b) => [b.name, b]));

  it("ข้าม generator และ datasource", () => {
    expect(byName.has("client")).toBe(false);
    expect(byName.has("db")).toBe(false);
    expect([...byName.keys()]).toEqual(["User", "Role", "Tenant", "Post"]);
  });

  it("เก็บคอมเมนต์เอกสารของ model", () => {
    expect(byName.get("User")?.doc).toEqual(["ผู้ใช้ระบบ"]);
  });

  it("เก็บคอมเมนต์เอกสารหลายบรรทัดที่อยู่เหนือฟิลด์", () => {
    const email = byName.get("User")?.fields.find((f) => f.name === "email");
    expect(email?.doc).toEqual(["อีเมลที่ใช้ล็อกอิน", "@pii(contact)"]);
  });

  it("เก็บคอมเมนต์เอกสารที่ต่อท้ายบรรทัดเดียวกัน", () => {
    const citizen = byName.get("User")?.fields.find((f) => f.name === "citizenId");
    expect(citizen?.doc).toEqual(["@pii(category=government_id)"]);
    expect(citizen?.isOptional).toBe(true);
  });

  it("คอมเมนต์ // ธรรมดาไม่กลายเป็นเอกสาร", () => {
    const nickname = byName.get("User")?.fields.find((f) => f.name === "nickname");
    expect(nickname?.doc).toEqual([]);
  });

  it("ไม่หลง // ที่อยู่ในสตริง", () => {
    const homepage = byName.get("User")?.fields.find((f) => f.name === "homepage");
    expect(homepage).toBeDefined();
    expect(homepage?.typeName).toBe("String");
    expect(homepage?.doc).toEqual([]);
  });

  it("ไม่นับบรรทัด @@ เป็นฟิลด์", () => {
    const names = byName.get("User")?.fields.map((f) => f.name) ?? [];
    expect(names).toEqual([
      "id",
      "email",
      "citizenId",
      "nickname",
      "homepage",
      "role",
      "tenant",
      "tenantId",
      "posts",
    ]);
  });

  it("ไม่นับค่าใน enum เป็นฟิลด์", () => {
    expect(byName.get("Role")?.fields).toEqual([]);
  });

  it("บอกเลขบรรทัดของฟิลด์ได้ถูกต้อง", () => {
    const email = byName.get("User")?.fields.find((f) => f.name === "email");
    const lines = SCHEMA.split("\n");
    expect(lines[(email?.line ?? 0) - 1]).toContain("email     String");
  });
});

describe("isRelationType", () => {
  const kinds = new Map<string, BlockKind>([
    ["User", "model"],
    ["Tenant", "model"],
    ["Role", "enum"],
    ["Address", "type"],
  ]);

  it("ชนิดพื้นฐานไม่ใช่ความสัมพันธ์", () => {
    expect(isRelationType("String", kinds)).toBe(false);
    expect(isRelationType("DateTime", kinds)).toBe(false);
  });

  it("ชื่อ model และ type คือความสัมพันธ์", () => {
    expect(isRelationType("Tenant", kinds)).toBe(true);
    expect(isRelationType("Address", kinds)).toBe(true);
  });

  it("enum ถือเป็นข้อมูล ไม่ใช่ความสัมพันธ์", () => {
    expect(isRelationType("Role", kinds)).toBe(false);
  });

  it("ชนิดที่ไม่รู้จักถือเป็นข้อมูลไว้ก่อน", () => {
    expect(isRelationType("SomethingElse", kinds)).toBe(false);
  });
});
