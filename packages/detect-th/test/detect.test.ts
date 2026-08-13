import { describe, expect, it } from "vitest";
import { detect } from "../src/detect.js";
import { makeThaiId } from "../src/thai-id.js";
import type { DetectorType } from "../src/detectors.js";

const ID = makeThaiId("110170020736");

function types(text: string, options = {}): DetectorType[] {
  return detect(text, options).map((m) => m.type);
}

describe("เลขประจำตัวประชาชน", () => {
  it("จับเลขที่ผ่านหลักตรวจสอบ", () => {
    const matches = detect(`ผู้สมัครเลขบัตรประชาชน ${ID} ยื่นเอกสารครบ`);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.type).toBe("thai_national_id");
    expect(matches[0]?.value).toBe(ID);
  });

  it("ไม่จับเลขสิบสามหลักที่ไม่ผ่านหลักตรวจสอบ", () => {
    // นี่คือเหตุผลที่ต้องตรวจ checksum — รหัสอ้างอิงในระบบมักยาวสิบสามหลักพอดี
    expect(types("รหัสอ้างอิงคำสั่งซื้อ 1234567890123")).not.toContain("thai_national_id");
  });

  it("มั่นใจขึ้นเมื่อมีคำว่าบัตรประชาชนอยู่ใกล้", () => {
    const withContext = detect(`เลขบัตรประชาชน ${ID}`)[0];
    const without = detect(`${ID}`)[0];
    expect(withContext?.confidence).toBeGreaterThan(without?.confidence ?? 0);
  });

  it("จับรูปแบบที่มีขีดคั่น", () => {
    const dashed = `${ID[0]}-${ID.slice(1, 5)}-${ID.slice(5, 10)}-${ID.slice(10, 12)}-${ID[12]}`;
    expect(types(`เลขบัตร ${dashed}`)).toContain("thai_national_id");
  });
});

describe("เบอร์โทรไทย", () => {
  it("จับมือถือทุกรูปแบบการเขียน", () => {
    for (const phone of ["0812345678", "081-234-5678", "081 234 5678", "+66812345678"]) {
      expect(types(`โทร ${phone}`)).toContain("thai_phone");
    }
  });

  it("จับเบอร์บ้านและสำนักงาน", () => {
    expect(types("ติดต่อ 021234567")).toContain("thai_phone");
    expect(types("ติดต่อ 02-123-4567")).toContain("thai_phone");
  });

  it("ไม่จับตัวเลขที่ยาวหรือสั้นเกินไป", () => {
    expect(types("ยอดรวม 08123456")).not.toContain("thai_phone");
    expect(types("เลขที่ 081234567890")).not.toContain("thai_phone");
  });

  it("ไม่จับเลขที่ขึ้นต้นผิด", () => {
    expect(types("รหัส 0112345678")).not.toContain("thai_phone");
  });
});

describe("อีเมล", () => {
  it("จับอีเมลปกติ", () => {
    const matches = detect("ส่งไปที่ somchai.k@example.co.th ได้เลย");
    expect(matches[0]?.type).toBe("email");
    expect(matches[0]?.value).toBe("somchai.k@example.co.th");
  });
});

describe("ชื่อคนไทย", () => {
  it("จับชื่อที่มีคำนำหน้า", () => {
    const matches = detect("ผู้รับคือ นายสมชาย ใจดี ปลายทางกรุงเทพ");
    expect(matches.some((m) => m.type === "thai_person_name")).toBe(true);
  });

  it("จับคำนำหน้าแบบย่อ", () => {
    expect(types("น.ส.สมหญิง รักไทย")).toContain("thai_person_name");
    expect(types("ด.ช.ก้อง เก่งกล้า")).toContain("thai_person_name");
  });

  it("เลือกคำนำหน้าที่ยาวที่สุด ไม่ตัดแค่ นาง จาก นางสาว", () => {
    const matches = detect("นางสาวมาลี");
    expect(matches[0]?.value.startsWith("นางสาว")).toBe(true);
  });
});

describe("ป้ายทะเบียนรถ", () => {
  it("จับทั้งแบบเก่าและแบบมีเลขนำหน้า", () => {
    expect(types("ทะเบียน กก 1234")).toContain("thai_licence_plate");
    expect(types("ทะเบียนรถ 1กก 1234")).toContain("thai_licence_plate");
  });

  it("มั่นใจต่ำเมื่อไม่มีคำว่าทะเบียนอยู่ใกล้", () => {
    const plain = detect("กม 100", { minConfidence: 0 })[0];
    expect(plain?.confidence).toBeLessThan(0.7);
  });
});

describe("ตัวตรวจที่ต้องมีบริบทเท่านั้น", () => {
  it("รหัสไปรษณีย์ไม่ถูกจับถ้าไม่มีคำบอก", () => {
    expect(types("จำนวน 10250 ชิ้น")).not.toContain("thai_postal_code");
    expect(types("รหัสไปรษณีย์ 10250")).toContain("thai_postal_code");
  });

  it("หนังสือเดินทางไม่ถูกจับถ้าไม่มีคำบอก", () => {
    expect(types("รหัสสินค้า AB1234567")).not.toContain("passport");
    expect(types("หนังสือเดินทาง AB1234567")).toContain("passport");
  });

  it("เลขบัญชีไม่ถูกจับถ้าไม่มีคำบอก", () => {
    expect(types("เลขพัสดุ 1234567890")).not.toContain("bank_account");
    expect(types("เลขที่บัญชี 123-4-56789-0")).toContain("bank_account");
  });
});

describe("บัตรเครดิตและไอพี", () => {
  it("จับเลขบัตรที่ผ่าน Luhn", () => {
    expect(types("ชำระด้วยบัตร 4111 1111 1111 1111")).toContain("credit_card");
  });

  it("ไม่จับเลขที่ไม่ผ่าน Luhn", () => {
    expect(types("อ้างอิง 4111 1111 1111 1112")).not.toContain("credit_card");
  });

  it("เลขสิบสามหลักไม่ถูกจับเป็นบัตรเครดิตถ้าไม่มีคำบอก", () => {
    // เจอจากการสแกนของจริง: เลขประจำตัวผู้เสียภาษีผ่าน Luhn ได้ราวหนึ่งในสิบ
    // และเคยถูกรายงานว่าเป็นบัตรเครดิต ทั้งที่บัตรสิบสามหลักเลิกออกไปนานแล้ว
    const luhn13 = "0105536000026";
    expect(types(`taxId: '${luhn13}'`)).not.toContain("credit_card");
    expect(types(`card number ${luhn13}`)).toContain("credit_card");
  });

  it("เลขผู้เสียภาษีที่ผ่านหลักตรวจสอบไทยถูกจัดเป็นเลขประจำตัว ไม่ใช่บัตรเครดิต", () => {
    const matches = detect(`เลขประจำตัวผู้เสียภาษี ${ID}`);
    expect(matches[0]?.type).toBe("thai_national_id");
  });

  it("จับหมายเลขไอพี", () => {
    expect(types("client 203.150.20.11 connected")).toContain("ip_address");
    expect(types("version 999.999.999.999")).not.toContain("ip_address");
  });
});

describe("การตัดสินช่วงที่ทับกัน", () => {
  it("เลขบัตรประชาชนชนะเมื่อเลขชุดเดียวกันถูกจับหลายแบบ", () => {
    const matches = detect(`เลขบัตรประชาชน ${ID}`);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.type).toBe("thai_national_id");
  });

  it("ผลลัพธ์เรียงตามตำแหน่งในข้อความ", () => {
    const matches = detect(`โทร 0812345678 อีเมล a@b.co.th เลขบัตรประชาชน ${ID}`);
    const starts = matches.map((m) => m.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(matches).toHaveLength(3);
  });
});

describe("ที่อยู่", () => {
  it("รวมส่วนของที่อยู่ที่ติดกันเป็นช่วงเดียว", () => {
    const matches = detect("ที่อยู่ 123/45 หมู่ 6 ต.บางรัก อ.เมือง จ.สมุทรปราการ");
    const addresses = matches.filter((m) => m.type === "thai_address");
    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.value).toContain("ต.บางรัก");
    expect(addresses[0]?.value).toContain("จ.สมุทรปราการ");
  });

  it("การอ้างมาตราในกฎหมายไม่ใช่ที่อยู่", () => {
    // เจอตอน Arak สแกนซอร์สของตัวเอง — `ม.` ย่อได้ทั้ง หมู่ และ มาตรา
    expect(types("บังคับตาม ม.39 และ ม.37")).not.toContain("thai_address");
    expect(types("บ้านเลขที่ 12 หมู่ 4")).toContain("thai_address");
  });

  it("ที่อยู่คนละที่ในข้อความเดียวไม่ถูกรวมกัน", () => {
    const matches = detect(
      "ต้นทาง จ.ระยอง แล้ววิ่งอีกประมาณสองร้อยกิโลเมตรก่อนถึงจุดหมาย จ.ชลบุรี",
    );
    expect(matches.filter((m) => m.type === "thai_address")).toHaveLength(2);
  });
});

describe("ตัวเลือก", () => {
  it("จำกัดชนิดที่ต้องการได้", () => {
    const matches = detect(`โทร 0812345678 อีเมล a@b.co.th`, { only: ["email"] });
    expect(matches.map((m) => m.type)).toEqual(["email"]);
  });

  it("ปิดชนิดที่ไม่ต้องการได้", () => {
    expect(types("โทร 0812345678 อีเมล a@b.co.th", { exclude: ["email"] })).not.toContain("email");
  });

  it("ข้อความว่างไม่ทำให้ระเบิด", () => {
    expect(detect("")).toEqual([]);
  });

  it("ข้อความยาวที่ไม่มีอะไรเลยก็ไม่เจออะไร", () => {
    expect(detect("ระบบจองคิวรถบรรทุกสำหรับคลังสินค้า ".repeat(200))).toEqual([]);
  });
});
