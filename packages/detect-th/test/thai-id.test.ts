import { describe, expect, it } from "vitest";
import { isValidThaiId, makeThaiId, thaiIdCheckDigit } from "../src/thai-id.js";

/**
 * ทุกเลขในเทสต์นี้สร้างขึ้นจากสูตร ไม่ใช่เลขบัตรของคนจริง
 * ห้ามเอาเลขบัตรจริงมาใส่ในโค้ดไม่ว่ากรณีใด
 */
describe("หลักตรวจสอบเลขประจำตัวประชาชน", () => {
  it("คำนวณหลักตรวจสอบได้", () => {
    const check = thaiIdCheckDigit("110170020736");
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThanOrEqual(9);
  });

  it("เลขที่สร้างจากสูตรต้องผ่านการตรวจเสมอ", () => {
    for (const prefix of [
      "110170020736",
      "310990123456",
      "500112233445",
      "100000000000",
      "999888777666",
    ]) {
      expect(isValidThaiId(makeThaiId(prefix))).toBe(true);
    }
  });

  it("กรองเลขสุ่มสิบสามหลักทิ้งได้เกือบทั้งหมด", () => {
    // เหตุผลทั้งหมดที่ต้องมี checksum คือกันรหัสอ้างอิงในระบบไม่ให้กลายเป็นผลบวกลวง
    // ตัวสุ่มแบบมีเมล็ด เพื่อให้ผลคงที่ทุกครั้งที่รันเทสต์
    let seed = 20260813;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };

    let passed = 0;
    const trials = 5000;
    for (let n = 0; n < trials; n += 1) {
      const random = Array.from({ length: 13 }, () => next() % 10).join("");
      if (isValidThaiId(random)) passed += 1;
    }
    // ตามทฤษฎีควรผ่านราวหนึ่งในสิบเอ็ด
    expect(passed / trials).toBeLessThan(0.15);
    expect(passed / trials).toBeGreaterThan(0.03);
  });

  /**
   * จุดบอดที่วัดแล้วของสูตรนี้ ไม่ใช่บั๊กของเรา แต่เป็นสมบัติของตัวสูตรเอง
   * ตรึงไว้เพื่อไม่ให้ใครในอนาคตเข้าใจผิดว่า "ผ่าน checksum แปลว่าเลขมีอยู่จริง"
   */
  describe("ข้อจำกัดของสูตร", () => {
    const id = makeThaiId("110170020736");

    it("แก้หลักที่สามแล้วสูตรจับไม่ได้เลย เพราะน้ำหนักคือ 11", () => {
      for (let d = 0; d <= 9; d += 1) {
        const broken = `${id.slice(0, 2)}${d}${id.slice(3)}`;
        expect(isValidThaiId(broken)).toBe(true);
      }
    });

    it("หลักอื่นจับได้เกือบทั้งหมด แต่ไม่ใช่ทั้งหมด", () => {
      let missed = 0;
      let tried = 0;
      for (let i = 0; i < 13; i += 1) {
        if (i === 2) continue;
        for (let d = 0; d <= 9; d += 1) {
          if (String(d) === id[i]) continue;
          tried += 1;
          if (isValidThaiId(`${id.slice(0, i)}${d}${id.slice(i + 1)}`)) missed += 1;
        }
      }
      expect(missed / tried).toBeLessThan(0.05);
    });
  });

  it("รับรูปแบบที่มีขีดคั่นอย่างที่พิมพ์บนบัตร", () => {
    const id = makeThaiId("110170020736");
    const dashed = `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}`;
    expect(isValidThaiId(dashed)).toBe(true);
  });

  it("ปฏิเสธเลขที่ซ้ำกันทั้งสิบสามหลักแม้สูตรจะผ่าน", () => {
    const repeated = [...Array(10).keys()].map((d) => String(d).repeat(13));
    for (const value of repeated) {
      expect(isValidThaiId(value)).toBe(false);
    }
  });

  it("ปฏิเสธความยาวที่ไม่ใช่สิบสามหลัก", () => {
    expect(isValidThaiId("1101700207")).toBe(false);
    expect(isValidThaiId("11017002073640")).toBe(false);
    expect(isValidThaiId("")).toBe(false);
    expect(isValidThaiId("abcdefghijklm")).toBe(false);
  });

  it("makeThaiId ปฏิเสธอินพุตที่ไม่ใช่ตัวเลข 12 หลัก", () => {
    expect(() => makeThaiId("123")).toThrow();
    expect(() => makeThaiId("12345678901a")).toThrow();
  });
});
