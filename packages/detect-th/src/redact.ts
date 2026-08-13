import { detect, type DetectOptions, type Match } from "./detect.js";
import type { DetectorType } from "./detectors.js";

export interface RedactEntry {
  placeholder: string;
  type: DetectorType;
  /** ค่าตามที่พบครั้งแรก ใช้ตอนแปลงกลับ */
  value: string;
}

export interface RedactResult {
  text: string;
  matches: Match[];
  entries: RedactEntry[];
}

export interface RedactOptions extends DetectOptions {
  /** ตั้งชื่อตัวแทนเอง ค่าเริ่มต้นคือ [THAI_NATIONAL_ID_1] */
  placeholder?: (type: DetectorType, index: number) => string;
}

function defaultPlaceholder(type: DetectorType, index: number): string {
  return `[${type.toUpperCase()}_${index}]`;
}

/** ตัวเลขที่เขียนคนละแบบแต่เป็นค่าเดียวกัน ต้องได้ตัวแทนตัวเดียวกัน */
function normalizeValue(type: DetectorType, value: string): string {
  switch (type) {
    case "email":
      return value.toLowerCase();
    case "thai_national_id":
    case "thai_id_laser":
    case "thai_phone":
    case "bank_account":
    case "credit_card":
    case "thai_postal_code":
      return value.replace(/[\s-]/g, "");
    default:
      return value.replace(/\s+/g, " ").trim();
  }
}

/**
 * แทนที่ข้อมูลส่วนบุคคลด้วยตัวแทนที่คงที่
 *
 * ความคงที่คือหัวใจ ไม่ใช่ของแถม — โค้ดที่เขียนขึ้นจากข้อความที่ถูกปิดบัง
 * จะพังทันทีถ้า "สมชาย" กลายเป็นคนละตัวแทนในแต่ละครั้งที่อ่าน
 * ตัวแปลกลับเก็บอยู่ในหน่วยความจำของเครื่องที่รัน ไม่ถูกส่งออกไปไหน
 */
export class Redactor {
  private readonly byValue = new Map<string, string>();
  private readonly byPlaceholder = new Map<string, string>();
  private readonly counters = new Map<DetectorType, number>();
  private readonly order: RedactEntry[] = [];

  redact(text: string, options: RedactOptions = {}): RedactResult {
    const naming = options.placeholder ?? defaultPlaceholder;
    const matches = detect(text, options);

    let out = "";
    let cursor = 0;

    for (const match of matches) {
      const key = `${match.type}:${normalizeValue(match.type, match.value)}`;
      let placeholder = this.byValue.get(key);

      if (placeholder === undefined) {
        const next = (this.counters.get(match.type) ?? 0) + 1;
        this.counters.set(match.type, next);
        placeholder = naming(match.type, next);
        this.byValue.set(key, placeholder);
        this.byPlaceholder.set(placeholder, match.value);
        this.order.push({ placeholder, type: match.type, value: match.value });
      }

      out += text.slice(cursor, match.start) + placeholder;
      cursor = match.end;
    }
    out += text.slice(cursor);

    return { text: out, matches, entries: [...this.order] };
  }

  /** แปลงตัวแทนกลับเป็นค่าจริง ใช้ตอนจะเขียนสิ่งที่โมเดลผลิตกลับลงไฟล์ */
  restore(text: string): string {
    if (this.byPlaceholder.size === 0) return text;
    const keys = [...this.byPlaceholder.keys()].sort((a, b) => b.length - a.length);
    let out = text;
    for (const placeholder of keys) {
      out = out.split(placeholder).join(this.byPlaceholder.get(placeholder) ?? placeholder);
    }
    return out;
  }

  entries(): RedactEntry[] {
    return [...this.order];
  }

  get size(): number {
    return this.order.length;
  }
}

/** ปิดบังข้อความก้อนเดียวจบ เมื่อไม่ต้องการความคงที่ข้ามการเรียก */
export function redact(text: string, options: RedactOptions = {}): RedactResult {
  return new Redactor().redact(text, options);
}
