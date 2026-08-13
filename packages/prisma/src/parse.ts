/**
 * ตัวอ่านไฟล์ .prisma แบบเบา ๆ
 *
 * ตั้งใจไม่พึ่ง `@prisma/internals` ด้วยเหตุผลสองข้อ
 * หนึ่ง มันหนักมากสำหรับงานที่เราต้องการแค่ชื่อฟิลด์กับคอมเมนต์
 * สอง เราต้องรู้ "เลขบรรทัด" ของทุกฟิลด์เพื่อชี้กลับไปที่ซอร์สได้ ซึ่ง DMMF ไม่ให้มา
 */

export type BlockKind = "model" | "view" | "type" | "enum";

export interface ParsedField {
  name: string;
  typeName: string;
  isList: boolean;
  isOptional: boolean;
  /** เลขบรรทัดที่ประกาศฟิลด์ เริ่มนับที่ 1 */
  line: number;
  /** คอมเมนต์ /// ที่ติดกับฟิลด์นี้ ทั้งที่อยู่บรรทัดบนและที่ต่อท้าย */
  doc: string[];
  /** ข้อความ @attribute ที่เหลือท้ายบรรทัด เก็บไว้อ่าน @relation */
  attributes: string;
}

export interface ParsedBlock {
  kind: BlockKind;
  name: string;
  line: number;
  doc: string[];
  fields: ParsedField[];
}

export interface ParsedSchema {
  file: string;
  blocks: ParsedBlock[];
}

const BLOCK_OPEN =
  /^(model|view|type|enum|generator|datasource)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/;

const FIELD =
  /^([A-Za-z_][A-Za-z0-9_]*)\s+(Unsupported\("[^"]*"\)|[A-Za-z_][A-Za-z0-9_]*)(\[\])?(\?)?\s*(.*)$/;

/**
 * ตัดคอมเมนต์ท้ายบรรทัดออก โดยไม่หลงเครื่องหมาย // ที่อยู่ในสตริง
 * เช่น `@default("http://x")` ต้องไม่ถูกตัด
 */
function splitTrailingComment(line: string): { code: string; doc: string | null } {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      // Prisma ไม่มี escape ที่ซับซ้อนในค่า default จึงเทียบ backslash ตรง ๆ พอ
      if (line[i - 1] !== "\\") inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "/" && line[i + 1] === "/") {
      const isDoc = line[i + 2] === "/";
      return {
        code: line.slice(0, i),
        doc: isDoc ? line.slice(i + 3).trim() : null,
      };
    }
  }
  return { code: line, doc: null };
}

export function parsePrismaSchema(text: string, file: string): ParsedSchema {
  const lines = text.split(/\r?\n/);
  const blocks: ParsedBlock[] = [];

  let pendingDoc: string[] = [];
  let current: ParsedBlock | null = null;
  let skippingBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    const trimmedRaw = rawLine.trim();

    // บรรทัดที่เป็นคอมเมนต์ล้วน
    if (trimmedRaw.startsWith("///")) {
      pendingDoc.push(trimmedRaw.slice(3).trim());
      continue;
    }
    if (trimmedRaw.startsWith("//")) continue;
    if (trimmedRaw.length === 0) {
      pendingDoc = [];
      continue;
    }

    const { code, doc: trailingDoc } = splitTrailingComment(rawLine);
    const trimmed = code.trim();
    if (trimmed.length === 0) {
      if (trailingDoc !== null) pendingDoc.push(trailingDoc);
      continue;
    }

    if (trimmed.startsWith("}")) {
      current = null;
      skippingBlock = false;
      pendingDoc = [];
      continue;
    }

    if (current === null && !skippingBlock) {
      const open = BLOCK_OPEN.exec(trimmed);
      if (open !== null) {
        const kind = open[1] as BlockKind | "generator" | "datasource";
        const name = open[2] ?? "";
        if (kind === "generator" || kind === "datasource") {
          skippingBlock = true;
        } else {
          current = { kind, name, line: i + 1, doc: pendingDoc, fields: [] };
          blocks.push(current);
        }
        pendingDoc = [];
        continue;
      }
      pendingDoc = [];
      continue;
    }

    if (skippingBlock) continue;
    if (current === null) continue;

    // ภายในบล็อก
    if (trimmed.startsWith("@@")) {
      pendingDoc = [];
      continue;
    }

    const match = FIELD.exec(trimmed);
    if (match === null) {
      pendingDoc = [];
      continue;
    }

    const doc = [...pendingDoc];
    if (trailingDoc !== null) doc.push(trailingDoc);
    pendingDoc = [];

    current.fields.push({
      name: match[1] ?? "",
      typeName: match[2] ?? "",
      isList: match[3] === "[]",
      isOptional: match[4] === "?",
      line: i + 1,
      doc,
      attributes: match[5] ?? "",
    });
  }

  return { file, blocks };
}

/** ชนิดที่ Prisma รู้จักเอง ทุกอย่างที่เหลือคือชื่อบล็อกในสคีมา */
const SCALAR_TYPES = new Set([
  "String",
  "Boolean",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "DateTime",
  "Json",
  "Bytes",
]);

const RELATION_FIELDS = /@relation\s*\([^)]*\bfields\s*:\s*\[([^\]]*)\]/;

/**
 * หาชื่อคอลัมน์ที่ทำหน้าที่เป็นกุญแจนอกของบล็อกนี้
 *
 * `AttendanceLog.empId` ไม่ใช่ข้อมูลเกี่ยวกับพนักงาน มันคือเส้นเชื่อมไปยังตาราง Employee
 * ถ้านับเป็นข้อมูลด้วย สคีมาระบบบุคคลจริงจะได้ `empId` ซ้ำกัน 21 รายการ
 * ซึ่งเป็นเสียงรบกวนมากพอที่จะทำให้คนปิดเครื่องมือทิ้ง
 *
 * กุญแจหลักของตารางเองไม่นับ เพราะนั่นคือตัวระบุตัวบุคคลจริง ๆ
 */
export function relationScalarNames(block: ParsedBlock): Set<string> {
  const names = new Set<string>();
  for (const field of block.fields) {
    const match = RELATION_FIELDS.exec(field.attributes);
    if (match === null) continue;
    for (const raw of (match[1] ?? "").split(",")) {
      const name = raw.trim();
      if (name.length > 0) names.add(name);
    }
  }
  for (const field of block.fields) {
    if (/@id\b/.test(field.attributes)) names.delete(field.name);
  }
  return names;
}

/**
 * ฟิลด์นี้เป็นความสัมพันธ์ไปยัง model อื่นหรือไม่
 *
 * ความสัมพันธ์ไม่ใช่ตัวข้อมูล จึงไม่ควรเข้าแคตตาล็อก ส่วน enum ถือเป็นข้อมูล
 * เพราะค่าที่เก็บจริงอยู่ในคอลัมน์นั้น
 */
export function isRelationType(typeName: string, blockKinds: Map<string, BlockKind>): boolean {
  if (SCALAR_TYPES.has(typeName)) return false;
  if (typeName.startsWith("Unsupported(")) return false;
  const kind = blockKinds.get(typeName);
  if (kind === undefined) return false;
  return kind === "model" || kind === "view" || kind === "type";
}
