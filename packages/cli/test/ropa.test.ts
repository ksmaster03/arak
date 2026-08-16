import type { Catalog } from "@arak/core";
import { describe, expect, it } from "vitest";
import { buildRopa } from "../src/ropa.js";

const catalog: Catalog = {
  version: 1,
  controller: { name: "บริษัททดสอบ จำกัด", contact: "dpo@example.co.th" },
  purposes: [
    {
      key: "billing",
      label: "ออกใบกำกับภาษี",
      legalBasis: "legal_obligation",
      retention: "P5Y",
      recipients: ["กรมสรรพากร"],
    },
    { key: "care", label: "ให้บริการรักษา", legalBasis: "consent", retention: "indefinite" },
  ],
  access: { requestChannel: "privacy@example.co.th", whoCanAccess: ["ฝ่ายบัญชี"] },
  securityMeasures: ["เข้ารหัสขณะพัก"],
  fields: [
    {
      id: "prisma:Customer.taxId",
      status: "marked",
      category: "government_id",
      purposes: ["billing"],
      source: { kind: "prisma", file: "s.prisma", line: 3, container: "Customer", field: "taxId" },
    },
    {
      id: "prisma:Patient.bloodType",
      status: "marked",
      category: "health",
      purposes: ["care"],
      source: { kind: "prisma", file: "s.prisma", line: 9, container: "Patient", field: "bloodType" },
    },
    {
      id: "prisma:Patient.nickname",
      status: "unmarked",
      category: "identity",
      source: { kind: "prisma", file: "s.prisma", line: 11, container: "Patient", field: "nickname" },
    },
    {
      id: "prisma:Customer.refCode",
      status: "not-pii",
      reason: "รหัสสุ่ม ไม่ผูกกับตัวบุคคล",
      source: { kind: "prisma", file: "s.prisma", line: 5, container: "Customer", field: "refCode" },
    },
  ],
};

const ropa = buildRopa(catalog, "2026-08-15");
const [controller, activities, fields] = ropa.sheets;

describe("buildRopa", () => {
  it("ออกสามชีต — ผู้ควบคุม กิจกรรม และรายการฟิลด์", () => {
    expect(ropa.sheets.map((s) => s.name)).toEqual([
      "ผู้ควบคุมข้อมูล",
      "บันทึกรายการ ม.39",
      "รายการฟิลด์",
    ]);
  });

  it("ทุกแถวมีจำนวนช่องเท่ากับหัวตาราง ไม่งั้นคอลัมน์จะเลื่อน", () => {
    for (const sheet of ropa.sheets) {
      const width = (sheet.rows[0] ?? []).length;
      expect(sheet.widths).toHaveLength(width);
      for (const row of sheet.rows) expect(row).toHaveLength(width);
    }
  });

  it("หนึ่งแถวต่อหนึ่งวัตถุประสงค์ พร้อมฐานทางกฎหมายที่แปลเป็นภาษาคนแล้ว", () => {
    const billing = activities?.rows.find((r) => r[1] === "ออกใบกำกับภาษี");
    expect(billing?.[3]).toContain("ม.24(6)");
    expect(billing?.[5]).toBe("Customer.taxId");
    expect(billing?.[7]).toBe("P5Y");
    expect(billing?.[8]).toBe("กรมสรรพากร");
  });

  it("แยกข้อมูลอ่อนไหวตามมาตรา 26 ออกมาเป็นคอลัมน์ของตัวเอง", () => {
    const care = activities?.rows.find((r) => r[1] === "ให้บริการรักษา");
    expect(care?.[6]).toBe("Patient.bloodType");
    expect(care?.[7]).toBe("ไม่กำหนดระยะเวลา");

    const billing = activities?.rows.find((r) => r[1] === "ออกใบกำกับภาษี");
    expect(billing?.[6]).toBe("ไม่มี");
  });

  /**
   * ฟิลด์ที่ยังไม่ถูกตัดสินต้องปรากฏในเอกสาร ไม่ใช่หายไปเงียบ ๆ
   * บันทึกที่ดูเรียบร้อยแต่ไม่ครบ สร้างความเสียหายมากกว่าการไม่มีบันทึกเลย
   */
  it("ยกฟิลด์ที่ยังไม่ผูกกับวัตถุประสงค์ขึ้นมาเป็นแถวของตัวเอง", () => {
    const orphan = activities?.rows.find((r) => r[0] === "!");
    expect(orphan?.[1]).toBe("ยังไม่ได้ผูกกับวัตถุประสงค์ใด");
    expect(orphan?.[5]).toBe("Patient.nickname");
    expect(ropa.undecided).toBe(1);
  });

  it("ไม่นับฟิลด์ที่ระบุแล้วว่าไม่ใช่ข้อมูลส่วนบุคคล", () => {
    expect(ropa.fields).toBe(3);
    const notPii = fields?.rows.find((r) => r[0] === "prisma:Customer.refCode");
    expect(notPii?.[4]).toBe("—");
    expect(notPii?.[10]).toBe("รหัสสุ่ม ไม่ผูกกับตัวบุคคล");
  });

  it("เขียน ยังไม่ระบุ ในช่องที่คนยังไม่กรอก แทนการปล่อยว่างให้ดูเหมือนครบ", () => {
    const dpo = controller?.rows.find((r) => r[0] === "เจ้าหน้าที่คุ้มครองข้อมูล (DPO)");
    expect(dpo?.[1]).toBe("ยังไม่ระบุ");
    expect(dpo?.[2]).toBe("ม.41");
  });

  it("ประทับวันที่ออกเอกสารตามที่ส่งเข้ามา", () => {
    const stamped = controller?.rows.find((r) => r[0] === "วันที่ออกเอกสาร");
    expect(stamped?.[1]).toBe("2026-08-15");
  });
});
