import { describe, expect, it } from "vitest";
import { parseCatalog, serializeCatalog, starterCatalog } from "../src/catalog.js";
import type { Catalog, CatalogField } from "../src/types.js";

const EXISTING = `# หัวไฟล์ที่คนเขียนไว้เอง
version: 1

controller:
  # ติดต่อ DPO ได้ที่นี่
  name: บริษัททดสอบ จำกัด
  contact: dpo@example.com

purposes:
  # ใช้กับทุกฟิลด์ที่เกี่ยวกับบัญชี
  - key: account
    label: ดูแลบัญชีผู้ใช้
    legalBasis: contract
    retention: P1Y

fields:
  # ฟิลด์นี้ทีมกฎหมายตรวจแล้วเมื่อ ส.ค. 2569
  - id: prisma:User.email
    status: marked
    category: contact
    purposes:
      - account
    source:
      kind: prisma
      file: prisma/schema.prisma
      line: 12
      container: User
      field: email
`;

function field(overrides: Partial<CatalogField> & { id: string }): CatalogField {
  return {
    status: "marked",
    source: {
      kind: "prisma",
      file: "prisma/schema.prisma",
      line: 1,
      container: "User",
      field: "x",
    },
    ...overrides,
  };
}

describe("parseCatalog", () => {
  it("อ่านโครงสร้างครบ", () => {
    const { catalog, problems } = parseCatalog(EXISTING);
    expect(problems).toEqual([]);
    expect(catalog.controller?.name).toBe("บริษัททดสอบ จำกัด");
    expect(catalog.purposes).toHaveLength(1);
    expect(catalog.fields).toHaveLength(1);
  });

  it("ฟ้องเมื่อ purpose ไม่มีระยะเวลาเก็บ", () => {
    const { problems } = parseCatalog(`version: 1
purposes:
  - key: account
    label: x
    legalBasis: contract
fields: []
`);
    expect(problems.some((p) => p.message.includes("ม.39(4)"))).toBe(true);
  });

  it("ฟ้องเมื่อ legalBasis ไม่ใช่ค่าที่กฎหมายรองรับ", () => {
    const { problems } = parseCatalog(`version: 1
purposes:
  - key: account
    label: x
    legalBasis: because_we_want_to
    retention: P1Y
fields: []
`);
    expect(problems.some((p) => p.message.includes("legalBasis"))).toBe(true);
  });

  it("ฟ้องเมื่อ id ซ้ำ", () => {
    const { problems } = parseCatalog(`version: 1
purposes: []
fields:
  - id: prisma:User.email
    status: marked
    source: { kind: prisma, file: a, line: 1, container: User, field: email }
  - id: prisma:User.email
    status: marked
    source: { kind: prisma, file: a, line: 2, container: User, field: email }
`);
    expect(problems.some((p) => p.message.includes("ซ้ำ"))).toBe(true);
  });

  it("ไฟล์ว่างไม่ทำให้ระเบิด", () => {
    const { catalog } = parseCatalog("");
    expect(catalog.fields).toEqual([]);
  });
});

describe("serializeCatalog", () => {
  it("คอมเมนต์ที่คนเขียนไว้ไม่หายตอนเขียนกลับ", () => {
    const { catalog } = parseCatalog(EXISTING);
    const out = serializeCatalog(catalog, EXISTING);
    expect(out).toContain("# หัวไฟล์ที่คนเขียนไว้เอง");
    expect(out).toContain("# ติดต่อ DPO ได้ที่นี่");
    expect(out).toContain("# ใช้กับทุกฟิลด์ที่เกี่ยวกับบัญชี");
    expect(out).toContain("# ฟิลด์นี้ทีมกฎหมายตรวจแล้วเมื่อ ส.ค. 2569");
  });

  it("เขียนกลับโดยไม่เปลี่ยนอะไรได้ข้อความเดิมเป๊ะ", () => {
    const { catalog } = parseCatalog(EXISTING);
    expect(serializeCatalog(catalog, EXISTING)).toBe(EXISTING);
  });

  it("ฟิลด์ใหม่ถูกต่อท้ายโดยของเดิมยังอยู่ครบ", () => {
    const { catalog } = parseCatalog(EXISTING);
    const next: Catalog = {
      ...catalog,
      fields: [...catalog.fields, field({ id: "prisma:User.phone", status: "unmarked" })],
    };
    const out = serializeCatalog(next, EXISTING);
    expect(out).toContain("# ฟิลด์นี้ทีมกฎหมายตรวจแล้วเมื่อ ส.ค. 2569");
    expect(out).toContain("prisma:User.phone");

    const reparsed = parseCatalog(out);
    expect(reparsed.catalog.fields.map((f) => f.id)).toEqual([
      "prisma:User.email",
      "prisma:User.phone",
    ]);
  });

  it("แก้ค่าในฟิลด์เดิมโดยคอมเมนต์ของฟิลด์นั้นยังอยู่", () => {
    const { catalog } = parseCatalog(EXISTING);
    const updated = catalog.fields.map((f) => ({ ...f, retention: "P5Y" }));
    const out = serializeCatalog({ ...catalog, fields: updated }, EXISTING);
    expect(out).toContain("# ฟิลด์นี้ทีมกฎหมายตรวจแล้วเมื่อ ส.ค. 2569");
    expect(out).toContain("retention: P5Y");
  });

  it("คีย์ที่เพิ่งเพิ่มไปอยู่ตามลำดับมาตรฐาน ไม่ใช่ต่อท้ายสุด", () => {
    // yaml ต่อคีย์ใหม่ไว้ท้ายเสมอ ทำให้ deferredOn เคยไปโผล่ใต้ source ซึ่งอ่านแล้วงง
    const { catalog } = parseCatalog(EXISTING);
    const updated = catalog.fields.map((f) => ({
      ...f,
      status: "deferred" as const,
      deferredOn: "2026-08-14",
    }));
    const out = serializeCatalog({ ...catalog, fields: updated }, EXISTING);

    const lines = out.split("\n");
    const deferredAt = lines.findIndex((l) => l.includes("deferredOn:"));
    const sourceAt = lines.findIndex((l) => l.trimStart().startsWith("source:"));
    expect(deferredAt).toBeGreaterThan(-1);
    expect(deferredAt).toBeLessThan(sourceAt);
  });

  it("ไม่สลับลำดับคีย์ของรายการที่ไม่ได้เพิ่มคีย์ใหม่", () => {
    const { catalog } = parseCatalog(EXISTING);
    const updated = catalog.fields.map((f) => ({ ...f, status: "deferred" as const }));
    const out = serializeCatalog({ ...catalog, fields: updated }, EXISTING);
    expect(out.indexOf("status:")).toBeLessThan(out.indexOf("category:"));
    expect(out).toContain("# ฟิลด์นี้ทีมกฎหมายตรวจแล้วเมื่อ ส.ค. 2569");
  });

  it("ลบคีย์ที่ไม่มีค่าแล้วออกจากไฟล์", () => {
    const { catalog } = parseCatalog(EXISTING);
    const updated = catalog.fields.map((f) => {
      const copy = { ...f };
      delete copy.category;
      return copy;
    });
    const out = serializeCatalog({ ...catalog, fields: updated }, EXISTING);
    expect(out).not.toContain("category: contact");
  });

  it("เขียนแบบบล็อกเสมอ เพื่อให้ diff อ่านได้", () => {
    const fresh = starterCatalog("x");
    fresh.fields = [
      field({ id: "prisma:User.email", category: "contact", purposes: ["account"] }),
      field({ id: "prisma:User.phone", category: "contact", purposes: ["account"] }),
    ];
    const out = serializeCatalog(fresh);

    // เจอตอนรันกับสคีมาจริง: ลิสต์ว่างทำให้ทั้งก้อนกลายเป็นบรรทัดเดียว
    expect(out).not.toMatch(/fields: \[.*\{/);
    expect(out).toContain("\n  - id: prisma:User.email");
    expect(out).toContain("\n    purposes:\n      - account");
    // ทุกฟิลด์ต้องขึ้นบรรทัดของตัวเอง
    expect(out.split("\n").filter((l) => l.startsWith("  - id:"))).toHaveLength(2);
  });

  it("ฟิลด์ที่ต่อท้ายไฟล์เดิมก็ยังเป็นบล็อก", () => {
    const { catalog } = parseCatalog(EXISTING);
    const next: Catalog = {
      ...catalog,
      fields: [...catalog.fields, field({ id: "prisma:User.phone", status: "unmarked" })],
    };
    const out = serializeCatalog(next, EXISTING);
    expect(out).toContain("\n  - id: prisma:User.phone");
    expect(out).not.toMatch(/\{ kind: prisma/);
  });

  it("สร้างไฟล์ใหม่พร้อมหัวอธิบายเมื่อยังไม่มีของเดิม", () => {
    const out = serializeCatalog(starterCatalog("โปรเจกต์ทดสอบ"));
    expect(out.startsWith("#")).toBe(true);
    expect(out).toContain("มาตรา 39");
    const { catalog, problems } = parseCatalog(out);
    expect(problems).toEqual([]);
    expect(catalog.purposes[0]?.key).toBe("account");
  });

  it("เขียนแล้วอ่านกลับได้ค่าเดิม", () => {
    const original = starterCatalog("x");
    original.fields = [
      field({
        id: "prisma:User.email",
        category: "contact",
        purposes: ["account"],
        firstSeen: "2026-08-13",
      }),
    ];
    const round = parseCatalog(serializeCatalog(original)).catalog;
    expect(round.fields).toEqual(original.fields);
  });
});
