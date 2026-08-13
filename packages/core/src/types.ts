/**
 * โครงข้อมูลของแคตตาล็อกข้อมูลส่วนบุคคล
 *
 * แคตตาล็อกคือแหล่งความจริงเพียงที่เดียว ส่วน annotation ในโค้ดเป็นแค่ป้ายชี้กลับมาที่นี่
 * โครงนี้ออกแบบให้ครอบข้อมูลที่ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 มาตรา 39
 * บังคับให้ต้องมีในบันทึกรายการกิจกรรมการประมวลผล (RoPA)
 */

/**
 * ฐานทางกฎหมายที่ใช้ประมวลผลข้อมูล — ความยินยอมตามมาตรา 19
 * และข้อยกเว้นหกข้อตามมาตรา 24
 */
export const LEGAL_BASES = [
  "consent",
  "contract",
  "legal_obligation",
  "vital_interest",
  "public_task",
  "legitimate_interest",
  "research_archive",
] as const;

export type LegalBasis = (typeof LEGAL_BASES)[number];

export const LEGAL_BASIS_LABELS: Record<LegalBasis, string> = {
  consent: "ความยินยอม (ม.19)",
  contract: "จำเป็นเพื่อปฏิบัติตามสัญญา (ม.24(3))",
  legal_obligation: "ปฏิบัติตามกฎหมาย (ม.24(6))",
  vital_interest: "ป้องกันอันตรายต่อชีวิต ร่างกาย สุขภาพ (ม.24(2))",
  public_task: "ภารกิจเพื่อประโยชน์สาธารณะ / ใช้อำนาจรัฐ (ม.24(4))",
  legitimate_interest: "ประโยชน์โดยชอบด้วยกฎหมาย (ม.24(5))",
  research_archive: "จดหมายเหตุ / วิจัย / สถิติ (ม.24(1))",
};

/**
 * หมวดข้อมูลที่ถือเป็น "ข้อมูลส่วนบุคคลอ่อนไหว" ตามมาตรา 26
 * ซึ่งต้องได้ความยินยอมโดยชัดแจ้ง เว้นแต่เข้าข้อยกเว้นในมาตราเดียวกัน
 */
export const SENSITIVE_CATEGORIES = [
  "race_ethnicity",
  "political_opinion",
  "belief_religion",
  "sexual_behavior",
  "criminal_record",
  "health",
  "disability",
  "union",
  "genetic",
  "biometric",
] as const;

/** หมวดข้อมูลส่วนบุคคลทั่วไป */
export const GENERAL_CATEGORIES = [
  "identity",
  "government_id",
  "contact",
  "financial",
  "employment",
  "education",
  "location",
  "device",
  "behavioral",
  "media",
  "family",
  "vehicle",
  "credential",
] as const;

export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];
export type GeneralCategory = (typeof GENERAL_CATEGORIES)[number];
export type Category = SensitiveCategory | GeneralCategory;

export const CATEGORY_LABELS: Record<Category, string> = {
  identity: "ข้อมูลระบุตัวตน",
  government_id: "เลขประจำตัวที่ราชการออกให้",
  contact: "ข้อมูลติดต่อ",
  financial: "ข้อมูลทางการเงิน",
  employment: "ข้อมูลการจ้างงาน",
  education: "ข้อมูลการศึกษา",
  location: "ข้อมูลตำแหน่งที่อยู่",
  device: "ข้อมูลอุปกรณ์และการเชื่อมต่อ",
  behavioral: "ข้อมูลพฤติกรรมการใช้งาน",
  media: "ภาพ เสียง หรือวิดีโอ",
  family: "ข้อมูลครอบครัว",
  vehicle: "ข้อมูลยานพาหนะ",
  credential: "ข้อมูลยืนยันตัวตนและรหัสผ่าน",
  race_ethnicity: "เชื้อชาติ เผ่าพันธุ์ (อ่อนไหว ม.26)",
  political_opinion: "ความคิดเห็นทางการเมือง (อ่อนไหว ม.26)",
  belief_religion: "ความเชื่อ ศาสนา ปรัชญา (อ่อนไหว ม.26)",
  sexual_behavior: "พฤติกรรมทางเพศ (อ่อนไหว ม.26)",
  criminal_record: "ประวัติอาชญากรรม (อ่อนไหว ม.26)",
  health: "ข้อมูลสุขภาพ (อ่อนไหว ม.26)",
  disability: "ความพิการ (อ่อนไหว ม.26)",
  union: "ข้อมูลสหภาพแรงงาน (อ่อนไหว ม.26)",
  genetic: "ข้อมูลพันธุกรรม (อ่อนไหว ม.26)",
  biometric: "ข้อมูลชีวภาพ (อ่อนไหว ม.26)",
};

const SENSITIVE_SET: ReadonlySet<string> = new Set(SENSITIVE_CATEGORIES);

/** หมวดนี้เป็นข้อมูลอ่อนไหวตามมาตรา 26 หรือไม่ */
export function isSensitiveCategory(category: string | undefined): boolean {
  return category !== undefined && SENSITIVE_SET.has(category);
}

export function isKnownCategory(category: string): boolean {
  return (
    SENSITIVE_SET.has(category) ||
    (GENERAL_CATEGORIES as readonly string[]).includes(category)
  );
}

/** ตำแหน่งจริงในซอร์สที่ฟิลด์นี้ถูกประกาศ */
export interface FieldSource {
  /** ตัวอ่านที่ผลิตรายการนี้ เช่น "prisma" */
  kind: string;
  /** พาธสัมพัทธ์กับรากโปรเจกต์ */
  file: string;
  /** บรรทัดที่ประกาศฟิลด์ เริ่มนับที่ 1 */
  line: number;
  /** ชื่อ container เช่นชื่อ model ของ Prisma */
  container: string;
  /** ชื่อฟิลด์ */
  field: string;
  /** ชนิดข้อมูลตามที่ซอร์สประกาศ */
  type?: string;
}

export type FieldStatus = "marked" | "unmarked" | "not-pii";

/** หนึ่งฟิลด์ในแคตตาล็อก */
export interface CatalogField {
  /** รหัสถาวร เช่น "prisma:User.email" */
  id: string;
  status: FieldStatus;
  source: FieldSource;
  category?: Category | string;
  /** อ้างถึง key ใน purposes */
  purposes?: string[];
  /** ISO-8601 duration เช่น P2Y — ถ้าไม่ใส่จะใช้ค่าของ purpose */
  retention?: string;
  /** เหตุผล จำเป็นเมื่อ status เป็น not-pii */
  reason?: string;
  /** บันทึกของคน เครื่องมือจะไม่แตะ */
  notes?: string;
  /** ตัวตรวจที่เสนอรายการนี้ */
  detectedBy?: string[];
  /** ความเชื่อมั่นของตัวตรวจ 0–1 */
  confidence?: number;
  /** ซอร์สไม่มีฟิลด์นี้แล้ว แต่ยังเก็บไว้ให้คนตัดสิน */
  orphaned?: boolean;
  /** วันที่พบครั้งแรก รูปแบบ YYYY-MM-DD */
  firstSeen?: string;
}

/** วัตถุประสงค์การประมวลผลหนึ่งรายการ — ม.39(2) */
export interface Purpose {
  key: string;
  label: string;
  legalBasis: LegalBasis;
  /** ISO-8601 duration หรือ "indefinite" — ม.39(4) */
  retention: string;
  /** ผู้รับข้อมูลหรือปลายทางที่เปิดเผย — ม.39(6) */
  recipients?: string[];
  description?: string;
}

/** ผู้ควบคุมข้อมูลส่วนบุคคล — ม.39(3) */
export interface Controller {
  name: string;
  contact?: string;
  address?: string;
  dpo?: { name?: string; contact?: string };
}

/** สิทธิและวิธีการเข้าถึงข้อมูล — ม.39(5) และการปฏิเสธคำขอ — ม.39(7) */
export interface AccessPolicy {
  /** ช่องทางที่เจ้าของข้อมูลใช้ยื่นคำขอ */
  requestChannel?: string;
  /** ลิงก์นโยบายความเป็นส่วนตัวหรือหน้าใช้สิทธิ */
  rightsUrl?: string;
  /** ใครในองค์กรเข้าถึงได้ และภายใต้เงื่อนไขใด */
  whoCanAccess?: string[];
  /** เงื่อนไขที่ปฏิเสธคำขอได้ */
  refusalGrounds?: string[];
}

export interface Catalog {
  version: 1;
  controller?: Controller;
  purposes: Purpose[];
  access?: AccessPolicy;
  /** มาตรการรักษาความมั่นคงปลอดภัย — ม.37 ที่ ม.39 ให้แนบมาด้วย */
  securityMeasures?: string[];
  fields: CatalogField[];
}

export function emptyCatalog(): Catalog {
  return { version: 1, purposes: [], fields: [] };
}

/**
 * สิ่งที่ตัวอ่านซอร์สหนึ่งตัวผลิตออกมา ก่อนจะถูกนำไปเทียบกับแคตตาล็อก
 */
export interface SourceField {
  id: string;
  source: FieldSource;
  /** ฟิลด์นี้เป็นความสัมพันธ์ ไม่ใช่ตัวข้อมูลเอง */
  isRelation: boolean;
  annotation?: PiiAnnotation | null;
  /** คอมเมนต์เอกสารทั้งก้อนที่ติดกับฟิลด์นี้ */
  doc?: string;
}

/** ผลการอ่าน `@pii(...)` หรือ `@not-pii(...)` จากคอมเมนต์ */
export interface PiiAnnotation {
  kind: "pii" | "not-pii";
  category?: string;
  purposes?: string[];
  retention?: string;
  reason?: string;
  /** ข้อความดิบที่อ่านมา ใช้ตอนรายงานข้อผิดพลาด */
  raw: string;
}
