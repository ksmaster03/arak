import { isValidThaiId } from "./thai-id.js";

export type DetectorType =
  | "thai_national_id"
  | "thai_id_laser"
  | "thai_phone"
  | "email"
  | "thai_licence_plate"
  | "thai_postal_code"
  | "passport"
  | "thai_person_name"
  | "thai_address"
  | "bank_account"
  | "credit_card"
  | "ip_address";

export interface Detector {
  type: DetectorType;
  /** หมวดตามชุดที่แคตตาล็อกของ Arak ใช้ */
  category: string;
  /** ต้องมีธง g เสมอ */
  pattern: RegExp;
  baseConfidence: number;
  /** ตรวจซ้ำหลังจาก regex จับได้ เช่น หลักตรวจสอบ */
  validate?: (value: string) => boolean;
  /** คำที่อยู่ใกล้แล้วทำให้มั่นใจขึ้น */
  context?: RegExp;
  /** ถ้าจริง จะนับก็ต่อเมื่อมีคำบริบทอยู่ใกล้เท่านั้น */
  requiresContext?: boolean;
  /** ความเชื่อมั่นเมื่อเจอคำบริบท */
  contextConfidence?: number;
  /**
   * รวมช่วงชนิดเดียวกันที่อยู่ห่างกันไม่เกินกี่ตัวอักษร
   * ที่อยู่ไทยหนึ่งบรรทัดประกอบด้วยหลายส่วน — หมู่ ตำบล อำเภอ จังหวัด
   * ถ้ารายงานแยกกันจะได้สี่บรรทัดสำหรับที่อยู่เดียว
   */
  mergeGap?: number;
}

const digits = (value: string): string => value.replace(/\D/g, "");

/** เลขบัตรเครดิตใช้สูตร Luhn ซึ่งกันเลขมั่วได้ดีพอ ๆ กับหลักตรวจสอบของบัตรประชาชน */
function passesLuhn(value: string): boolean {
  const d = digits(value);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let n = Number(d[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * เบอร์โทรไทย
 * มือถือขึ้นต้น 06 08 09 ตามด้วยอีกแปดหลัก · บ้านและสำนักงานขึ้นต้น 0 ตามด้วยเจ็ดถึงแปดหลัก
 * รูปแบบ +66 ตัดศูนย์หน้าออก จึงต้องเติมกลับก่อนตรวจ
 */
function isThaiPhone(value: string): boolean {
  let d = digits(value);
  if (d.startsWith("66")) d = `0${d.slice(2)}`;
  if (!/^0[2-9]\d{7,8}$/.test(d)) return false;
  if (/^0[689]/.test(d)) return d.length === 10;
  return d.length === 9 || d.length === 10;
}

/** ช่วง unicode ของอักษรไทย ใช้กันไม่ให้ป้ายทะเบียนไปจับคำไทยที่ติดกัน */
const THAI = "\\u0E00-\\u0E7F";

export const DETECTORS: Detector[] = [
  {
    type: "thai_national_id",
    category: "government_id",
    // สิบสามหลัก คั่นด้วยขีดหรือเว้นวรรคได้ ตามที่พิมพ์บนบัตรจริง
    pattern: /(?<!\d)(?:\d[- ]?){12}\d(?!\d)/g,
    baseConfidence: 0.95,
    validate: isValidThaiId,
    context: /บัตรประชาชน|ประจำตัวประชาชน|เลขประจำตัว|national\s*id|citizen\s*id|id\s*card/i,
    contextConfidence: 0.99,
  },
  {
    type: "thai_id_laser",
    category: "government_id",
    pattern: /(?<![A-Z0-9])[A-Z]{2}\d[- ]?\d{7}[- ]?\d{2}(?![A-Z0-9])/g,
    baseConfidence: 0.6,
    context: /เลเซอร์|laser|หลังบัตร/i,
    contextConfidence: 0.9,
  },
  {
    type: "thai_phone",
    category: "contact",
    pattern: /(?<![\d+])(?:\+?66[- ]?|0)\d(?:[- ]?\d){7,8}(?!\d)/g,
    baseConfidence: 0.75,
    validate: isThaiPhone,
    context: /โทร|เบอร์|มือถือ|ติดต่อ|tel|phone|mobile|contact/i,
    contextConfidence: 0.92,
  },
  {
    type: "email",
    category: "contact",
    pattern: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z])/g,
    baseConfidence: 0.95,
  },
  {
    type: "thai_licence_plate",
    category: "vehicle",
    // เลขนำหน้าไม่เกินสองตัว ตามด้วยพยัญชนะไทยสองตัว แล้วตัวเลขหนึ่งถึงสี่หลัก
    pattern: new RegExp(
      `(?<![${THAI}0-9A-Za-z])[0-9]{0,2}[\\u0E01-\\u0E2E]{2}[ -]?[0-9]{1,4}(?![${THAI}0-9])`,
      "g",
    ),
    baseConfidence: 0.55,
    context: /ทะเบียน|ป้ายทะเบียน|licen[cs]e\s*plate|plate|รถบรรทุก|หัวลาก|หางพ่วง/i,
    contextConfidence: 0.88,
  },
  {
    type: "thai_postal_code",
    category: "contact",
    pattern: /(?<!\d)\d{5}(?!\d)/g,
    baseConfidence: 0.7,
    requiresContext: true,
    context: /ไปรษณีย์|รหัสไปรษณีย์|postal|post\s*code|zip/i,
    contextConfidence: 0.85,
  },
  {
    type: "passport",
    category: "government_id",
    pattern: /(?<![A-Z0-9])[A-Z]{1,2}\d{6,7}(?![A-Z0-9])/g,
    baseConfidence: 0.5,
    requiresContext: true,
    context: /passport|หนังสือเดินทาง|พาสปอร์ต/i,
    contextConfidence: 0.9,
  },
  {
    type: "thai_person_name",
    category: "identity",
    // คำนำหน้าคือสัญญาณที่เชื่อถือได้ที่สุดสำหรับชื่อคนไทย
    pattern: new RegExp(
      `(?:นาย|นางสาว|นาง|น\\.ส\\.|ด\\.ช\\.|ด\\.ญ\\.|เด็กชาย|เด็กหญิง)\\s?[\\u0E01-\\u0E4E]+(?:\\s+[\\u0E01-\\u0E4E]+)?`,
      "g",
    ),
    baseConfidence: 0.85,
  },
  {
    type: "thai_address",
    category: "contact",
    pattern: new RegExp(
      `(?:ตำบล|แขวง|อำเภอ|เขต|จังหวัด|ต\\.|อ\\.|จ\\.|ซอย|ซ\\.|ถนน|ถ\\.|หมู่ที่|หมู่|ม\\.)\\s?[\\u0E01-\\u0E4E0-9]+`,
      "g",
    ),
    baseConfidence: 0.6,
    context: /ที่อยู่|address|จัดส่ง|ผู้รับ|บ้านเลขที่/i,
    contextConfidence: 0.8,
    mergeGap: 4,
  },
  {
    type: "bank_account",
    category: "financial",
    pattern: /(?<!\d)\d{3}[- ]?\d[- ]?\d{5}[- ]?\d(?!\d)/g,
    baseConfidence: 0.5,
    requiresContext: true,
    context: /บัญชี|เลขที่บัญชี|ธนาคาร|account\s*(no|number)|bank/i,
    contextConfidence: 0.85,
  },
  {
    /**
     * สิบสี่ถึงสิบเก้าหลัก
     *
     * เดิมเริ่มที่สิบสามหลักตามสเปกบัตร แต่พอรันกับข้อมูลจริงพบว่า
     * เลขประจำตัวผู้เสียภาษีไทยซึ่งยาวสิบสามหลักผ่าน Luhn ได้ราวหนึ่งในสิบ
     * และถูกจับเป็นบัตรเครดิตแทน — บัตรสิบสามหลักเลิกออกไปนานแล้ว
     * จึงย้ายไปเป็นกฎแยกที่ต้องมีคำบริบทกำกับ
     */
    type: "credit_card",
    category: "financial",
    pattern: /(?<!\d)(?:\d[- ]?){13,18}\d(?!\d)/g,
    baseConfidence: 0.9,
    validate: passesLuhn,
    context: /บัตรเครดิต|บัตรเดบิต|credit\s*card|card\s*(no|number)/i,
    contextConfidence: 0.97,
  },
  {
    type: "credit_card",
    category: "financial",
    pattern: /(?<!\d)(?:\d[- ]?){12}\d(?!\d)/g,
    baseConfidence: 0.9,
    validate: passesLuhn,
    requiresContext: true,
    context: /บัตรเครดิต|บัตรเดบิต|credit\s*card|card\s*(no|number)/i,
    contextConfidence: 0.95,
  },
  {
    type: "ip_address",
    category: "device",
    pattern: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g,
    baseConfidence: 0.8,
  },
];

export { passesLuhn, isThaiPhone };
