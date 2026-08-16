import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx, columnName, type Sheet } from "../src/xlsx.js";

/**
 * ตัวอ่าน ZIP ขนาดจิ๋วสำหรับเทสต์
 *
 * อ่านจากสารบัญกลางจริง ๆ ไม่ใช่เดาตำแหน่ง เพื่อให้จับได้ถ้า offset หรือ CRC เพี้ยน
 * ถ้าตัวเขียนผิด ตัวอ่านนี้จะพังก่อนที่ Excel จะได้เห็นไฟล์
 */
function readZip(buffer: Buffer): Map<string, string> {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error("หา end of central directory ไม่เจอ");

  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, string>();

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ส่วนหัวของสารบัญกลางเพี้ยน");
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("ส่วนหัวของไฟล์เพี้ยน");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.set(name, inflateRawSync(raw).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const sample: Sheet[] = [
  {
    name: "ชีตแรก",
    widths: [10, 40],
    rows: [
      ["หัวข้อ", "รายละเอียด"],
      ["ผู้ควบคุมข้อมูล", 'บริษัท "ตัวอย่าง" & จำกัด <ทดสอบ>'],
      ["ว่าง", ""],
    ],
  },
];

describe("columnName", () => {
  it("แปลงดัชนีเป็นชื่อคอลัมน์แบบ Excel", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(27)).toBe("AB");
    expect(columnName(51)).toBe("AZ");
    expect(columnName(52)).toBe("BA");
  });
});

describe("buildXlsx", () => {
  const parts = readZip(buildXlsx(sample));

  it("มีชิ้นส่วนครบตามที่ OPC บังคับ", () => {
    for (const name of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]) {
      expect(parts.has(name)).toBe(true);
    }
  });

  it("หนีอักขระพิเศษของ XML ไม่ให้ทำไฟล์พัง", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml") ?? "";
    expect(sheet).toContain("&quot;ตัวอย่าง&quot;");
    expect(sheet).toContain("&amp;");
    expect(sheet).toContain("&lt;ทดสอบ&gt;");
  });

  it("เก็บข้อความไทยเป็น UTF-8 ครบถ้วน", () => {
    expect(parts.get("xl/workbook.xml")).toContain("ชีตแรก");
    expect(parts.get("xl/worksheets/sheet1.xml")).toContain("ผู้ควบคุมข้อมูล");
  });

  it("ใส่สไตล์หัวตารางกับเนื้อตารางคนละอัน และข้ามช่องว่าง", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml") ?? "";
    expect(sheet).toContain('r="A1" t="inlineStr" s="1"');
    expect(sheet).toContain('r="A2" t="inlineStr" s="2"');
    expect(sheet).not.toContain('r="B3"');
  });

  it("ตรึงแถวหัวไว้และตั้งความกว้างคอลัมน์ตามที่สั่ง", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml") ?? "";
    expect(sheet).toContain('ySplit="1"');
    expect(sheet).toContain('<col min="2" max="2" width="40" customWidth="1"/>');
  });

  it("ตัดชื่อชีตให้เหลือ 31 ตัวและเอาอักขระที่ Excel ห้ามออก", () => {
    const long = buildXlsx([{ name: "ก".repeat(40) + "/[x]", widths: [], rows: [["a"]] }]);
    const workbook = readZip(long).get("xl/workbook.xml") ?? "";
    const match = /name="([^"]*)"/.exec(workbook);
    expect(match?.[1]).toHaveLength(31);
    expect(match?.[1]).not.toContain("/");
  });

  it("ให้ไบต์ชุดเดิมทุกครั้งเมื่อข้อมูลเข้าเหมือนเดิม จึง diff ย้อนหลังได้", () => {
    expect(buildXlsx(sample).equals(buildXlsx(sample))).toBe(true);
  });

  it("ปฏิเสธเมื่อไม่มีชีตเลย แทนที่จะเขียนไฟล์ที่เปิดไม่ได้ออกมา", () => {
    expect(() => buildXlsx([])).toThrow();
  });
});
