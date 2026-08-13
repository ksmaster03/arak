import { describe, expect, it } from "vitest";
import { parsePrismaSchema, relationScalarNames } from "../src/parse.js";
import { readPrismaSchemas } from "../src/index.js";

const SCHEMA = `model Employee {
  empId String @id @map("emp_id")
  /// @pii(category=government_id, purposes=payroll)
  nationalId String?
  companyId  String
  company    Company @relation(fields: [companyId], references: [companyId])
  logs       AttendanceLog[]
}

model AttendanceLog {
  logId    String   @id
  empId    String
  employee Employee @relation(fields: [empId], references: [empId])
  gpsLat   Float?
}

model Membership {
  userId   String
  tenantId String
  user     User   @relation(fields: [userId], references: [id])
  tenant   Tenant @relation(fields: [tenantId], references: [id])

  @@id([userId, tenantId])
}

model User {
  id String @id
}

model Tenant {
  id String @id
}

model Company {
  companyId String @id
}
`;

describe("relationScalarNames", () => {
  const blocks = new Map(
    parsePrismaSchema(SCHEMA, "schema.prisma").blocks.map((b) => [b.name, b]),
  );

  it("จับคอลัมน์ที่เป็นกุญแจนอก", () => {
    const employee = blocks.get("Employee");
    expect(employee).toBeDefined();
    expect([...relationScalarNames(employee!)]).toEqual(["companyId"]);
  });

  it("ไม่นับกุญแจหลักของตารางเอง แม้จะถูกอ้างเป็นกุญแจนอกจากที่อื่น", () => {
    const employee = blocks.get("Employee");
    expect(relationScalarNames(employee!).has("empId")).toBe(false);

    const log = blocks.get("AttendanceLog");
    expect(relationScalarNames(log!).has("empId")).toBe(true);
  });

  it("รับกุญแจนอกแบบหลายคอลัมน์", () => {
    const membership = blocks.get("Membership");
    expect([...relationScalarNames(membership!)].sort()).toEqual(["tenantId", "userId"]);
  });
});

describe("readPrismaSchemas", () => {
  const result = readPrismaSchemas([{ file: "prisma/schema.prisma", text: SCHEMA }]);
  const byId = new Map(result.fields.map((f) => [f.id, f]));

  it("ตั้งรหัสฟิลด์เป็น prisma:Model.field", () => {
    expect(byId.has("prisma:Employee.nationalId")).toBe(true);
  });

  it("ติดป้าย @pii ที่อ่านได้ไว้กับฟิลด์", () => {
    expect(byId.get("prisma:Employee.nationalId")?.annotation).toMatchObject({
      kind: "pii",
      category: "government_id",
      purposes: ["payroll"],
    });
  });

  it("กุญแจนอกถือเป็นความสัมพันธ์ ไม่ใช่ตัวข้อมูล", () => {
    expect(byId.get("prisma:AttendanceLog.empId")?.isRelation).toBe(true);
    expect(byId.get("prisma:Employee.companyId")?.isRelation).toBe(true);
    // กุญแจหลักคือตัวระบุตัวบุคคลจริง ๆ จึงยังเป็นข้อมูล
    expect(byId.get("prisma:Employee.empId")?.isRelation).toBe(false);
  });

  it("เก็บเลขบรรทัดและชนิดข้อมูลไว้ในแหล่งที่มา", () => {
    const gps = byId.get("prisma:AttendanceLog.gpsLat");
    expect(gps?.source.type).toBe("Float");
    expect(gps?.source.container).toBe("AttendanceLog");
    expect(SCHEMA.split("\n")[(gps?.source.line ?? 0) - 1]).toContain("gpsLat");
  });

  it("อ่านสคีมาหลายไฟล์แล้วยังรู้ว่าอะไรเป็นความสัมพันธ์", () => {
    const split = readPrismaSchemas([
      { file: "a.prisma", text: "model Post {\n  id String @id\n  author User\n}\n" },
      { file: "b.prisma", text: "model User {\n  id String @id\n}\n" },
    ]);
    const author = split.fields.find((f) => f.id === "prisma:Post.author");
    expect(author?.isRelation).toBe(true);
  });

  it("เตือนเมื่อมีคนไปมาร์ก @pii บนฟิลด์ที่เป็นความสัมพันธ์", () => {
    const withAnnotation = readPrismaSchemas([
      {
        file: "a.prisma",
        text:
          "model Post {\n  id String @id\n  authorId String\n" +
          "  /// @pii(identity)\n  author User @relation(fields: [authorId], references: [id])\n}\n" +
          "model User {\n  id String @id\n}\n",
      },
    ]);
    expect(withAnnotation.problems.some((p) => p.level === "warning")).toBe(true);
  });
});
