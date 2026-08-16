import type { Catalog, CatalogField } from "@arak/core";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { buildSemgrep } from "../src/semgrep.js";

function field(
  id: string,
  container: string,
  name: string,
  overrides: Partial<CatalogField> = {},
): CatalogField {
  return {
    id,
    status: "marked",
    source: { kind: "prisma", file: "s.prisma", line: 1, container, field: name },
    ...overrides,
  } as CatalogField;
}

const catalog: Catalog = {
  version: 1,
  purposes: [],
  fields: [
    field("prisma:Customer.email", "Customer", "email", { category: "contact" }),
    // ชื่อฟิลด์ซ้ำข้ามโมเดล — Semgrep สนใจแค่ชื่อ property จึงต้องยุบให้เหลือชุดเดียว
    field("prisma:Driver.email", "Driver", "email", { category: "contact" }),
    field("prisma:Patient.bloodType", "Patient", "bloodType", { category: "health" }),
    field("prisma:Customer.refCode", "Customer", "refCode", { status: "not-pii" }),
    field("prisma:Customer.nickname", "Customer", "nickname", { status: "unmarked" }),
    field("prisma:Old.gone", "Old", "gone", { category: "contact", orphaned: true }),
  ],
};

const result = buildSemgrep(catalog);
const doc = parse(result.yaml);

describe("buildSemgrep", () => {
  it("ออก YAML ที่ parse ได้และมีโครงตามที่ Semgrep ต้องการ", () => {
    expect(Array.isArray(doc.rules)).toBe(true);
    for (const rule of doc.rules) {
      expect(rule.id).toMatch(/^arak-/);
      expect(rule.mode).toBe("taint");
      expect(rule.languages).toEqual(["typescript", "javascript"]);
      expect(rule["pattern-sources"].length).toBeGreaterThan(0);
      expect(rule["pattern-sinks"].length).toBeGreaterThan(0);
      expect(rule["pattern-sanitizers"].length).toBeGreaterThan(0);
      expect(rule.message).toBeTruthy();
    }
  });

  it("แยกข้อมูลอ่อนไหวตามมาตรา 26 เป็นกฎระดับ ERROR ต่างหาก", () => {
    const byId = Object.fromEntries(
      doc.rules.map((r: { id: string; severity: string }) => [r.id, r.severity]),
    );
    expect(byId["arak-sensitive-data-to-sink"]).toBe("ERROR");
    expect(byId["arak-personal-data-to-sink"]).toBe("WARNING");
  });

  it("ยุบชื่อฟิลด์ที่ซ้ำข้ามโมเดลให้เหลือรูปแบบเดียว", () => {
    const general = doc.rules.find(
      (r: { id: string }) => r.id === "arak-personal-data-to-sink",
    );
    const patterns: string[] = general["pattern-sources"].map(
      (p: { pattern: string }) => p.pattern,
    );
    expect(patterns.filter((p) => p === "$OBJ.email")).toHaveLength(1);
    expect(general.metadata["arak-fields"]).toBe(2);
    expect(general.metadata["arak-field-names"]).toBe(1);
  });

  it("ไม่สร้างกฎจากฟิลด์ที่ไม่ใช่ข้อมูลส่วนบุคคล ยังไม่ตัดสิน หรือหายไปจากซอร์ส", () => {
    expect(result.yaml).not.toContain("refCode");
    expect(result.yaml).not.toContain("nickname");
    expect(result.yaml).not.toContain("$OBJ.gone");
    expect(result.covered).toBe(3);
    expect(result.uncovered).toBe(1);
  });

  it("มี sink ทั้ง log คำตอบที่ส่งออก และบริการของบุคคลที่สาม", () => {
    const sinks: string[] = doc.rules[0]["pattern-sinks"].map(
      (s: { pattern: string }) => s.pattern,
    );
    expect(sinks).toContain("console.log(...)");
    expect(sinks).toContain("res.json(...)");
    expect(sinks).toContain("Sentry.captureException(...)");
  });

  it("บอกข้อจำกัดเรื่องผลบวกลวงไว้ในไฟล์ ไม่ใช่ปล่อยให้ไปเจอเอง", () => {
    expect(result.yaml).toContain("จับจากชื่อฟิลด์ ไม่ใช่ชนิดของค่า");
    expect(result.yaml).toContain("nosemgrep");
  });

  it("ไม่สร้างกฎเลยเมื่อยังไม่มีฟิลด์ที่ตัดสินแล้ว", () => {
    const empty = buildSemgrep({ version: 1, purposes: [], fields: [] });
    expect(empty.rules).toBe(0);
  });
});
