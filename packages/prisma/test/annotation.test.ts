import { describe, expect, it } from "vitest";
import { parseAnnotation } from "../src/annotation.js";

describe("parseAnnotation", () => {
  it("คืน null เมื่อไม่มีป้ายเลย", () => {
    const { annotation, errors } = parseAnnotation(["อีเมลที่ใช้ล็อกอิน"]);
    expect(annotation).toBeNull();
    expect(errors).toEqual([]);
  });

  it("รับป้ายเปล่า", () => {
    const { annotation } = parseAnnotation(["@pii"]);
    expect(annotation?.kind).toBe("pii");
    expect(annotation?.category).toBeUndefined();
  });

  it("รับทางลัดที่ใส่หมวดมาตรง ๆ", () => {
    const { annotation, errors } = parseAnnotation(["@pii(identity)"]);
    expect(annotation?.category).toBe("identity");
    expect(errors).toEqual([]);
  });

  it("อ่านคีย์ครบทุกตัว", () => {
    const { annotation, errors } = parseAnnotation([
      "@pii(category=contact, purposes=account;marketing, retention=P2Y)",
    ]);
    expect(errors).toEqual([]);
    expect(annotation).toMatchObject({
      kind: "pii",
      category: "contact",
      purposes: ["account", "marketing"],
      retention: "P2Y",
    });
  });

  it("แยกวัตถุประสงค์ได้ทั้ง ; | และ +", () => {
    expect(parseAnnotation(["@pii(purposes=a|b)"]).annotation?.purposes).toEqual(["a", "b"]);
    expect(parseAnnotation(["@pii(purposes=a+b)"]).annotation?.purposes).toEqual(["a", "b"]);
  });

  it("อ่าน @not-pii พร้อมเหตุผลที่มีคอมมาข้างใน", () => {
    const { annotation, errors } = parseAnnotation([
      '@not-pii(reason="รหัสภายใน, ไม่ผูกกับตัวบุคคล")',
    ]);
    expect(errors).toEqual([]);
    expect(annotation?.kind).toBe("not-pii");
    expect(annotation?.reason).toBe("รหัสภายใน, ไม่ผูกกับตัวบุคคล");
  });

  it("อ่านป้ายที่ปนอยู่กับคำอธิบายภาษาคน", () => {
    const { annotation } = parseAnnotation([
      "เลขประจำตัวประชาชน เก็บไว้ออกใบกำกับภาษี",
      "@pii(category=government_id, purposes=tax_invoice)",
      "ห้ามแสดงเต็มบนหน้าจอ",
    ]);
    expect(annotation?.category).toBe("government_id");
    expect(annotation?.purposes).toEqual(["tax_invoice"]);
  });

  it("บ่นเมื่อเจอคีย์ที่ไม่รู้จัก", () => {
    const { errors } = parseAnnotation(["@pii(catgory=contact)"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("catgory");
  });

  it("บ่นเมื่อ @not-pii ดันใส่หมวดมาด้วย", () => {
    const { errors } = parseAnnotation(["@not-pii(category=contact)"]);
    expect(errors.some((e) => e.includes("@not-pii"))).toBe(true);
  });

  it("ไม่สับสนระหว่าง @pii กับ @not-pii", () => {
    expect(parseAnnotation(["@not-pii"]).annotation?.kind).toBe("not-pii");
    expect(parseAnnotation(["@pii"]).annotation?.kind).toBe("pii");
  });
});
