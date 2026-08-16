import type { CatalogField, Problem } from "@arak/core";
import { describe, expect, it } from "vitest";
import { scanToSarif, statusToSarif } from "../src/sarif.js";
import { scanText } from "../src/scan.js";

function field(overrides: Partial<CatalogField> & { id: string }): CatalogField {
  return {
    status: "unmarked",
    source: {
      kind: "prisma",
      file: "prisma/schema.prisma",
      line: 12,
      container: "Patient",
      field: "note",
    },
    ...overrides,
  } as CatalogField;
}

describe("statusToSarif", () => {
  it("ออกโครง SARIF 2.1.0 ที่ถูกต้อง และแนบเฉพาะกฎที่ถูกใช้จริง", () => {
    const log = JSON.parse(
      statusToSarif([field({ id: "prisma:Patient.note", category: "contact" })], [], "9.9.9"),
    );

    expect(log.version).toBe("2.1.0");
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0].tool.driver.name).toBe("Arak");
    expect(log.runs[0].tool.driver.version).toBe("9.9.9");
    expect(log.runs[0].tool.driver.rules.map((r: { id: string }) => r.id)).toEqual([
      "arak/undecided-field",
    ]);
    expect(log.runs[0].results[0].locations[0].physicalLocation).toEqual({
      artifactLocation: { uri: "prisma/schema.prisma" },
      region: { startLine: 12 },
    });
  });

  it("ยกข้อมูลอ่อนไหวตามมาตรา 26 เป็นระดับ error ไม่ใช่แค่ warning", () => {
    const log = JSON.parse(
      statusToSarif(
        [
          field({ id: "prisma:Patient.bloodType", category: "health" }),
          field({ id: "prisma:Patient.email", category: "contact" }),
        ],
        [],
        "0.1.0",
      ),
    );

    const byRule = Object.fromEntries(
      log.runs[0].results.map((r: { ruleId: string; level: string }) => [r.ruleId, r.level]),
    );
    expect(byRule["arak/sensitive-field"]).toBe("error");
    expect(byRule["arak/undecided-field"]).toBe("warning");
  });

  it("ไม่รายงานฟิลด์ที่ตัดสินแล้ว หรือฟิลด์ที่หายไปจากซอร์ส", () => {
    const log = JSON.parse(
      statusToSarif(
        [
          field({ id: "a", status: "marked", category: "contact" }),
          field({ id: "b", status: "not-pii", reason: "รหัสสุ่ม" }),
          field({ id: "c", status: "unmarked", orphaned: true }),
        ],
        [],
        "0.1.0",
      ),
    );
    expect(log.runs[0].results).toEqual([]);
  });

  it("แปลงปัญหาในแคตตาล็อกที่รู้ตำแหน่งไฟล์ให้เป็นผลลัพธ์ด้วย", () => {
    const problems: Problem[] = [
      { level: "error", id: "prisma:X.y", message: "หมวดไม่รู้จัก", file: "prisma/schema.prisma", line: 4 },
      { level: "warning", id: "no-file", message: "ไม่มีตำแหน่ง" },
    ];
    const log = JSON.parse(statusToSarif([], problems, "0.1.0"));
    expect(log.runs[0].results).toHaveLength(1);
    expect(log.runs[0].results[0].ruleId).toBe("arak/catalog-error");
  });
});

describe("scanToSarif", () => {
  const text = 'const a = { email: "somchai@example.co.th", phone: "0812345678" };';
  const findings = scanText(text, "prisma/seed.ts", 0.7);

  it("สร้างหนึ่งกฎต่อหนึ่งชนิดข้อมูล เพื่อให้ปลายทางจัดกลุ่มผลได้เอง", () => {
    const log = JSON.parse(scanToSarif(findings, "0.1.0"));
    const ids: string[] = log.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
    expect(ids.every((id) => id.startsWith("arak/real-data/"))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * ข้อบังคับเด็ดขาด — ไฟล์ SARIF ถูกอัปขึ้นเซิร์ฟเวอร์และเก็บไว้นานกว่าไฟล์ที่ถูกสแกน
   * ถ้าค่าจริงหลุดลงไป เครื่องมือที่จ้างมาหารอยรั่วจะกลายเป็นรอยรั่วเสียเอง
   */
  it("ไม่มีค่าจริงของข้อมูลส่วนบุคคลอยู่ในผลลัพธ์เลย", () => {
    const raw = scanToSarif(findings, "0.1.0");
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(raw).not.toContain(finding.match.value);
    }
    expect(raw).toContain("•");
  });

  it("คืนโครงที่ถูกต้องแม้ไม่พบอะไรเลย", () => {
    const log = JSON.parse(scanToSarif([], "0.1.0"));
    expect(log.runs[0].results).toEqual([]);
    expect(log.runs[0].tool.driver.rules).toEqual([]);
  });
});
