import { describe, expect, it } from "vitest";
import { redact, Redactor } from "../src/redact.js";
import { makeThaiId } from "../src/thai-id.js";

const ID = makeThaiId("110170020736");

describe("redact", () => {
  it("แทนที่ค่าด้วยตัวแทนที่อ่านออก", () => {
    const result = redact("ติดต่อ somchai@example.com หรือโทร 0812345678");
    expect(result.text).toBe("ติดต่อ [EMAIL_1] หรือโทร [THAI_PHONE_1]");
  });

  it("ค่าเดียวกันได้ตัวแทนเดียวกันเสมอ", () => {
    const result = redact("a@x.com คุยกับ b@x.com แล้วตอบกลับ a@x.com");
    expect(result.text).toBe("[EMAIL_1] คุยกับ [EMAIL_2] แล้วตอบกลับ [EMAIL_1]");
  });

  it("ค่าเดียวกันที่เขียนคนละแบบก็ยังเป็นตัวแทนเดียวกัน", () => {
    const dashed = `${ID[0]}-${ID.slice(1, 5)}-${ID.slice(5, 10)}-${ID.slice(10, 12)}-${ID[12]}`;
    const result = redact(`เลขบัตรประชาชน ${ID} และ เลขบัตรประชาชน ${dashed}`);
    const placeholders = result.text.match(/\[THAI_NATIONAL_ID_\d+\]/g) ?? [];
    expect(placeholders).toHaveLength(2);
    expect(new Set(placeholders).size).toBe(1);
  });

  it("ตั้งชื่อตัวแทนเองได้", () => {
    const result = redact("a@x.com", { placeholder: (type, i) => `<<${type}:${i}>>` });
    expect(result.text).toBe("<<email:1>>");
  });

  it("ข้อความที่ไม่มีอะไรให้ปิดบังต้องออกมาเหมือนเดิมทุกตัวอักษร", () => {
    const text = "ระบบจองคิวรถบรรทุก ไม่มีข้อมูลส่วนบุคคลในบรรทัดนี้";
    expect(redact(text).text).toBe(text);
  });
});

describe("Redactor", () => {
  it("ตัวแทนคงที่ข้ามการเรียกหลายครั้ง", () => {
    const redactor = new Redactor();
    const first = redactor.redact("อีเมลหลัก a@x.com");
    const second = redactor.redact("อีเมลเดิม a@x.com กับอีเมลใหม่ b@x.com");

    expect(first.text).toContain("[EMAIL_1]");
    expect(second.text).toContain("[EMAIL_1]");
    expect(second.text).toContain("[EMAIL_2]");
  });

  it("แปลงกลับได้ค่าเดิม", () => {
    const redactor = new Redactor();
    const original = `ส่งใบเสร็จให้ somchai@example.com เลขบัตรประชาชน ${ID} โทร 0812345678`;
    const masked = redactor.redact(original);
    expect(masked.text).not.toContain("somchai@example.com");
    expect(redactor.restore(masked.text)).toBe(original);
  });

  it("แปลงกลับได้แม้ตัวแทนถูกย้ายที่", () => {
    // นี่คือกรณีจริง: โมเดลอ่านข้อความที่ถูกปิดบังแล้วเขียนโค้ดใหม่ที่ใช้ตัวแทนคนละตำแหน่ง
    const redactor = new Redactor();
    redactor.redact("ผู้ติดต่อ a@x.com และ b@x.com");
    const written = "const owner = '[EMAIL_2]'; const backup = '[EMAIL_1]';";
    expect(redactor.restore(written)).toBe("const owner = 'b@x.com'; const backup = 'a@x.com';");
  });

  it("แปลงกลับข้อความที่ไม่มีตัวแทนแล้วได้ของเดิม", () => {
    const redactor = new Redactor();
    expect(redactor.restore("ไม่มีอะไรถูกปิดบัง")).toBe("ไม่มีอะไรถูกปิดบัง");
  });

  it("ตัวแทนที่เลขซ้อนกันต้องไม่แปลงกลับผิดตัว", () => {
    const redactor = new Redactor();
    const emails = Array.from({ length: 12 }, (_, i) => `user${i}@x.com`);
    redactor.redact(emails.join(" "));
    // [EMAIL_1] เป็นส่วนหน้าของ [EMAIL_11] ถ้าแทนที่ตามลำดับผิดจะได้ค่าปนกัน
    expect(redactor.restore("[EMAIL_11]")).toBe("user10@x.com");
    expect(redactor.restore("[EMAIL_1]")).toBe("user0@x.com");
  });

  it("บอกจำนวนและรายการที่ปิดบังไปแล้วได้", () => {
    const redactor = new Redactor();
    redactor.redact("a@x.com กับ 0812345678");
    expect(redactor.size).toBe(2);
    expect(redactor.entries().map((e) => e.type).sort()).toEqual(["email", "thai_phone"]);
  });
});
