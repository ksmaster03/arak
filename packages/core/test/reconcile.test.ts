import { describe, expect, it } from "vitest";
import { reconcile, summarize } from "../src/reconcile.js";
import type { Catalog, CatalogField, PiiAnnotation, SourceField } from "../src/types.js";

const TODAY = "2026-08-13";

function source(
  container: string,
  name: string,
  annotation: PiiAnnotation | null = null,
  line = 10,
): SourceField {
  return {
    id: `prisma:${container}.${name}`,
    isRelation: false,
    annotation,
    source: {
      kind: "prisma",
      file: "prisma/schema.prisma",
      line,
      container,
      field: name,
      type: "String",
    },
  };
}

function catalog(fields: CatalogField[], purposes = ["account"]): Catalog {
  return {
    version: 1,
    purposes: purposes.map((key) => ({
      key,
      label: key,
      legalBasis: "contract" as const,
      retention: "P1Y",
    })),
    fields,
  };
}

const options = { today: TODAY, scannedKinds: ["prisma"] };

describe("reconcile", () => {
  it("ตัวเดาเสนอฟิลด์ใหม่ในสถานะยังไม่ได้ตัดสิน", () => {
    const result = reconcile(catalog([]), [source("User", "email")], options);
    expect(result.catalog.fields).toHaveLength(1);
    expect(result.catalog.fields[0]).toMatchObject({
      id: "prisma:User.email",
      status: "unmarked",
      category: "contact",
      firstSeen: TODAY,
    });
    expect(result.catalog.fields[0]?.detectedBy?.[0]).toMatch(/^heuristic:/);
  });

  it("ปิดตัวเดาแล้วจะไม่มีอะไรถูกเพิ่มเอง", () => {
    const result = reconcile(catalog([]), [source("User", "email")], {
      ...options,
      useHeuristic: false,
    });
    expect(result.catalog.fields).toEqual([]);
  });

  it("ไม่แตะฟิลด์ที่เป็นความสัมพันธ์", () => {
    const relation: SourceField = { ...source("Booking", "customer"), isRelation: true };
    const result = reconcile(catalog([]), [relation], options);
    expect(result.catalog.fields).toEqual([]);
  });

  it("annotation ในโค้ดชนะของเดิมในแคตตาล็อก", () => {
    const before = catalog([
      {
        id: "prisma:User.email",
        status: "unmarked",
        category: "identity",
        source: source("User", "email").source,
        detectedBy: ["heuristic:person-name"],
        confidence: 0.8,
      },
    ]);
    const ann: PiiAnnotation = {
      kind: "pii",
      category: "contact",
      purposes: ["account"],
      raw: "@pii(...)",
    };

    const result = reconcile(before, [source("User", "email", ann)], options);
    const field = result.catalog.fields[0];
    expect(field).toMatchObject({ status: "marked", category: "contact", purposes: ["account"] });
    // เมื่อคนตัดสินแล้ว ผลของตัวเดาต้องหายไป ไม่ใช่ค้างอยู่ให้สับสน
    expect(field?.detectedBy).toBeUndefined();
    expect(field?.confidence).toBeUndefined();
  });

  it("ของเดิมในแคตตาล็อกชนะเมื่อโค้ดไม่ได้พูดอะไร", () => {
    const before = catalog([
      {
        id: "prisma:User.email",
        status: "marked",
        category: "contact",
        purposes: ["account"],
        notes: "คนใส่ไว้เอง",
        source: source("User", "email").source,
      },
    ]);
    const result = reconcile(before, [source("User", "email")], options);
    expect(result.catalog.fields[0]).toMatchObject({
      status: "marked",
      notes: "คนใส่ไว้เอง",
    });
  });

  it("ปรับเลขบรรทัดให้ตรงกับซอร์สเสมอ", () => {
    const before = catalog([
      {
        id: "prisma:User.email",
        status: "marked",
        category: "contact",
        purposes: ["account"],
        source: source("User", "email", null, 10).source,
      },
    ]);
    const result = reconcile(before, [source("User", "email", null, 42)], options);
    expect(result.catalog.fields[0]?.source.line).toBe(42);
  });

  it("@not-pii ล้างหมวดและวัตถุประสงค์ทิ้ง", () => {
    const ann: PiiAnnotation = { kind: "not-pii", reason: "รหัสภายใน", raw: "@not-pii(...)" };
    const before = catalog([
      {
        id: "prisma:Order.refCode",
        status: "marked",
        category: "identity",
        purposes: ["account"],
        source: source("Order", "refCode").source,
      },
    ]);
    const result = reconcile(before, [source("Order", "refCode", ann)], options);
    expect(result.catalog.fields[0]).toMatchObject({
      status: "not-pii",
      reason: "รหัสภายใน",
    });
    expect(result.catalog.fields[0]?.category).toBeUndefined();
    expect(result.catalog.fields[0]?.purposes).toBeUndefined();
  });

  it("ฟิลด์ที่หายไปจากซอร์สถูกทำเครื่องหมาย ไม่ใช่ถูกลบ", () => {
    const before = catalog([
      {
        id: "prisma:User.faxNumber",
        status: "marked",
        category: "contact",
        purposes: ["account"],
        source: source("User", "faxNumber").source,
      },
    ]);
    const result = reconcile(before, [], options);
    expect(result.catalog.fields).toHaveLength(1);
    expect(result.catalog.fields[0]?.orphaned).toBe(true);
    expect(result.changes.map((c) => c.kind)).toContain("orphaned");
  });

  it("ฟิลด์ที่กลับมาจะถูกปลดเครื่องหมาย", () => {
    const before = catalog([
      {
        id: "prisma:User.faxNumber",
        status: "marked",
        category: "contact",
        purposes: ["account"],
        orphaned: true,
        source: source("User", "faxNumber").source,
      },
    ]);
    const result = reconcile(before, [source("User", "faxNumber")], options);
    expect(result.catalog.fields[0]?.orphaned).toBeUndefined();
    expect(result.changes.map((c) => c.kind)).toContain("restored");
  });

  it("ไม่ไปแตะฟิลด์ของตัวอ่านชนิดอื่นที่ยังไม่ได้สแกน", () => {
    const before = catalog([
      {
        id: "openapi:Customer.email",
        status: "marked",
        category: "contact",
        purposes: ["account"],
        source: {
          kind: "openapi",
          file: "openapi.yaml",
          line: 3,
          container: "Customer",
          field: "email",
        },
      },
    ]);
    const result = reconcile(before, [], options);
    expect(result.catalog.fields[0]?.orphaned).toBeUndefined();
  });

  it("ฟ้องเมื่อมาร์กว่าเป็น PII แล้วแต่ไม่มีวัตถุประสงค์", () => {
    const ann: PiiAnnotation = { kind: "pii", category: "contact", raw: "@pii(contact)" };
    const result = reconcile(catalog([]), [source("User", "email", ann)], options);
    const errors = result.problems.filter((p) => p.level === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("ม.39(2)");
  });

  it("ฟ้องเมื่ออ้างวัตถุประสงค์ที่ไม่มีในแคตตาล็อก", () => {
    const ann: PiiAnnotation = {
      kind: "pii",
      category: "contact",
      purposes: ["ไม่มีอยู่จริง"],
      raw: "@pii(...)",
    };
    const result = reconcile(catalog([]), [source("User", "email", ann)], options);
    expect(result.problems.some((p) => p.level === "error" && p.message.includes("ไม่มีอยู่จริง"))).toBe(
      true,
    );
  });

  it("เตือนเมื่อ @not-pii ไม่ให้เหตุผล", () => {
    const ann: PiiAnnotation = { kind: "not-pii", raw: "@not-pii" };
    const result = reconcile(catalog([]), [source("Order", "refCode", ann)], options);
    expect(result.problems.some((p) => p.level === "warning" && p.message.includes("reason"))).toBe(
      true,
    );
  });

  it("รันซ้ำแล้วผลไม่เปลี่ยน", () => {
    const first = reconcile(catalog([]), [source("User", "email")], options);
    const second = reconcile(first.catalog, [source("User", "email")], options);
    expect(second.catalog.fields).toEqual(first.catalog.fields);
    expect(second.changes).toEqual([]);
  });
});

describe("summarize", () => {
  it("นับข้อมูลอ่อนไหวแยกจากยอดรวม", () => {
    const c = catalog([
      {
        id: "prisma:Employee.bloodType",
        status: "marked",
        category: "health",
        purposes: ["account"],
        source: source("Employee", "bloodType").source,
      },
      {
        id: "prisma:User.email",
        status: "unmarked",
        category: "contact",
        source: source("User", "email").source,
      },
    ]);
    expect(summarize(c)).toMatchObject({ total: 2, marked: 1, unmarked: 1, sensitive: 1 });
  });
});
