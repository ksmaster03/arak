import { deflateRawSync } from "node:zlib";

/**
 * ตัวเขียนไฟล์ .xlsx ขนาดเล็กที่ไม่พึ่ง dependency ใด ๆ
 *
 * เขียนเองเพราะปลั๊กอินของ Claude Code ถูก bundle ให้ไม่มี dependency เลย
 * (ดู NEXT.md — Claude Code คัดลอกเฉพาะโฟลเดอร์ปลั๊กอิน symlink ของ pnpm ไม่ตามไปด้วย)
 * การลาก exceljs เข้ามาเพื่อออกตารางล้วน ๆ จึงแลกไม่คุ้ม
 *
 * รองรับเท่าที่บันทึกรายการกิจกรรมการประมวลผลต้องใช้จริง — หลายชีต หัวตารางตัวหนา
 * ความกว้างคอลัมน์ ข้อความตัดบรรทัด และตรึงแถวหัว ไม่มีสูตร ไม่มีกราฟ
 */

export interface Sheet {
  name: string;
  /** ความกว้างคอลัมน์ตามลำดับ หน่วยเดียวกับที่ Excel ใช้ */
  widths: number[];
  /** แถวแรกคือหัวตาราง */
  rows: string[][];
}

/** ดัชนีคอลัมน์เริ่มที่ 0 → "A" "B" ... "AA" */
export function columnName(index: number): string {
  let name = "";
  let n = index;
  for (;;) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    if (n < 26) return name;
    n = Math.floor(n / 26) - 1;
  }
}

/**
 * หนีอักขระพิเศษของ XML และตัดอักขระควบคุมที่ XML 1.0 ไม่ยอมรับทิ้ง
 *
 * ตัวควบคุมหลุดเข้ามาได้จริงเวลาคนคัดลอกข้อความมาวางในแคตตาล็อก
 * และ Excel จะปฏิเสธทั้งไฟล์ ไม่ใช่แค่ช่องนั้น
 */
function escapeXml(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 && ch !== "\t" && ch !== "\n") continue;
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else out += ch;
  }
  return out;
}

const HEADER_STYLE = 1;
const BODY_STYLE = 2;

function sheetXml(sheet: Sheet): string {
  const cols = sheet.widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === "") return "";
          const ref = `${columnName(c)}${r + 1}`;
          const style = r === 0 ? HEADER_STYLE : BODY_STYLE;
          return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      // แถวหัวสูงกว่าเพราะข้อความกำกับมาตรามักยาวกว่าหนึ่งบรรทัด
      const attrs = r === 0 ? ` ht="30" customHeight="1"` : "";
      return `<row r="${r + 1}"${attrs}>${cells}</row>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols === "" ? "" : `<cols>${cols}</cols>`) +
    `<sheetData>${rows}</sheetData>` +
    `</worksheet>`
  );
}

/** Tahoma เพราะมีสระและวรรณยุกต์ไทยครบ และมีอยู่แล้วทั้งบน Windows และ Excel ฝั่ง Mac */
const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Tahoma"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font>` +
  `</fonts>` +
  `<fills count="3">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF2F4858"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** ชื่อชีตของ Excel ห้ามยาวเกิน 31 ตัว และห้ามมีอักขระเหล่านี้ */
function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

function buildParts(sheets: Sheet[]): { name: string; data: Buffer }[] {
  const overrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    overrides +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    sheets
      .map(
        (s, i) =>
          `<sheet name="${escapeXml(safeSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const text = (s: string): Buffer => Buffer.from(s, "utf8");

  return [
    { name: "[Content_Types].xml", data: text(contentTypes) },
    { name: "_rels/.rels", data: text(rootRels) },
    { name: "xl/workbook.xml", data: text(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: text(workbookRels) },
    { name: "xl/styles.xml", data: text(STYLES_XML) },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: text(sheetXml(sheet)),
    })),
  ];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * ประกอบไฟล์ ZIP
 *
 * เวลาแก้ไขถูกตรึงไว้ที่ 1980-01-01 โดยตั้งใจ เพื่อให้แคตตาล็อกชุดเดิม
 * ให้ไฟล์ที่ไบต์ตรงกันทุกครั้ง — ไฟล์ที่ diff ได้คือไฟล์ที่ตรวจสอบย้อนหลังได้
 */
function zip(parts: { name: string; data: Buffer }[]): Buffer {
  const DOS_TIME = 0;
  const DOS_DATE = 0x0021;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const part of parts) {
    const name = Buffer.from(part.name, "utf8");
    const compressed = deflateRawSync(part.data);
    const crc = crc32(part.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // ชื่อไฟล์เป็น UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(part.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(part.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, compressed);
    centrals.push(central);
    offset += local.length + compressed.length;
  }

  const centralBlock = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralBlock.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBlock, end]);
}

/** ประกอบชีตทั้งหมดเป็นไฟล์ .xlsx หนึ่งไฟล์ */
export function buildXlsx(sheets: Sheet[]): Buffer {
  if (sheets.length === 0) throw new Error("ต้องมีอย่างน้อยหนึ่งชีต");
  return zip(buildParts(sheets));
}
