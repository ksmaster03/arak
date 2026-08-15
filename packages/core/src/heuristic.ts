import type { Category, SourceField } from "./types.js";

/**
 * ตัวตรวจตั้งต้นที่เดาจากชื่อฟิลด์และชนิดข้อมูล
 *
 * หน้าที่ของมันคือทำให้ `arak sync` มีของให้ดูตั้งแต่วันแรกโดยไม่ต้องมีใครมาร์กอะไรไว้ก่อน
 * ไม่ใช่เพื่อความแม่นยำ ตัวตรวจของจริง (เลขบัตรประชาชนพร้อมหลักตรวจสอบ ชื่อไทย
 * และการดูค่าในข้อมูลจริง) จะอยู่ในแพ็กเกจแยกและมาแทนที่ไฟล์นี้
 *
 * กฎทุกข้อในนี้ถูกปรับจากการรันกับสคีมาจริงสามชุด (ระบบคลังสินค้า ระบบซ่อมบำรุง
 * และระบบบุคคล) ทุกครั้งที่แก้กฎ ให้เพิ่มเคสที่เจอลงเทสต์ด้วย
 */

type ContextGate =
  /** ยิงได้เสมอ */
  | "always"
  /** ยิงเมื่อ container ดูเกี่ยวกับคน เช่น EmployeeCertificate ก็นับ */
  | "person"
  /**
   * ยิงเมื่อ container "คือ" คน ไม่ใช่แค่เกี่ยวกับคน
   * ใช้กับชื่อฟิลด์กว้าง ๆ อย่าง `name` — `Employee.name` ใช่ แต่ `EmployeeCertificate.name` ไม่ใช่
   */
  | "person-tail";

interface Rule {
  id: string;
  test: RegExp;
  category: Category;
  confidence: number;
  gate?: ContextGate;
  /** บางกฎต้องดูชนิดข้อมูลด้วย เช่น ก้อน Json ที่ไม่รู้ว่ามีอะไรอยู่ข้างใน */
  typeTest?: RegExp;
}

/** container ที่เกี่ยวกับคน */
const PERSON_CONTAINER =
  /(user|customer|client|driver|employee|staff|person|people|contact|member|patient|applicant|candidate|guest|visitor|profile|account|owner|subscriber|recipient|passenger|student|teacher|payslip|payroll|compensation|attendance|leave)/i;

/** container ที่ "คือ" คนหนึ่งคน — ชื่อลงท้ายด้วยคำที่หมายถึงบุคคล */
const PERSON_TAIL =
  /(user|customer|client|driver|employee|staff|person|contact|member|patient|applicant|candidate|guest|visitor|profile|account|owner|subscriber|recipient|passenger|student|teacher)$/i;

/**
 * นิติบุคคลไม่ใช่ "บุคคลธรรมดา" ตาม พ.ร.บ. จึงไม่ใช่เจ้าของข้อมูลส่วนบุคคล
 * แต่เจ้าของกิจการรายเดียวใช้เลขประจำตัวเดียวกับบัตรประชาชน จึงยังเสนอไว้
 * เพียงแต่ลดความเชื่อมั่นลงให้ไปอยู่ท้ายรายการ
 */
const JURISTIC_CONTAINER =
  /^(company|organi[sz]ation|corporate|firm|branch|tenant|site|carrier|vendor|supplier|clinic|hospital|store|shop|merchant)$/i;
const JURISTIC_PENALTY = 0.4;

/**
 * ชื่อที่บอกว่าฟิลด์นี้เป็นธง ตัวนับ หรือสถานะ ไม่ใช่ตัวข้อมูล
 * `DailyAttendance.payrollLocked` เคยถูกจับว่าเป็นข้อมูลการเงินเพราะมีคำว่า payroll
 */
const NOT_A_VALUE =
  /^(is|has|can|should|allow|enable|disable|require)_|_(locked|enabled|disabled|flag|required|verified|visible|count|total|order|index|seq|version|status|issue)$/;

const RULES: Rule[] = [
  // เลขประจำตัวที่ราชการออกให้
  {
    id: "citizen-id",
    test: /(citizen|national|personal)_?(id|no|number)|id_?card|idcard|thai_?id/,
    category: "government_id",
    confidence: 0.95,
  },
  { id: "passport", test: /passport/, category: "government_id", confidence: 0.95 },
  {
    id: "tax-id",
    test: /tax_?(id|no|number)|vat_?(id|no|number)/,
    category: "government_id",
    confidence: 0.85,
  },
  { id: "ssn", test: /social_?security|ssn\b/, category: "government_id", confidence: 0.95 },

  // ข้อมูลติดต่อ
  { id: "email", test: /e?_?mail(_?address)?$|^email/, category: "contact", confidence: 0.95 },
  {
    id: "phone",
    test: /phone|mobile_?(no|number|phone)|^tel$|telephone|fax|line_?id|whatsapp/,
    category: "contact",
    confidence: 0.9,
  },
  {
    id: "address",
    test: /address|addr\b|street|postcode|postal_?code|zip_?code|subdistrict|tambon|district|amphoe|province/,
    category: "contact",
    confidence: 0.75,
    gate: "person",
  },

  // ข้อมูลระบุตัวตน
  {
    id: "person-name-compound",
    test: /(first|last|middle|full|given|family|sur|nick|display|legal)_?name|fullname|surname/,
    category: "identity",
    confidence: 0.85,
  },
  {
    /**
     * ชื่อของคนที่สาม เช่นผู้ติดต่อฉุกเฉินหรือผู้ปกครอง
     * เป็นข้อมูลส่วนบุคคลของ "อีกคนหนึ่ง" ที่อยู่ในตารางของเจ้าของข้อมูล
     */
    id: "related-person-name",
    test: /(emergency|guardian|parent|spouse|relative|referrer|contact)_?(person_?)?name/,
    category: "identity",
    confidence: 0.8,
  },
  {
    id: "person-name-bare",
    test: /^name(_th|_en)?$/,
    category: "identity",
    confidence: 0.8,
    gate: "person-tail",
  },
  { id: "thai-name", test: /(ชื่อ|นามสกุล)/, category: "identity", confidence: 0.9 },
  {
    id: "birth-date",
    test: /birth_?(date|day)|date_?of_?birth|^dob$|วันเกิด/,
    category: "identity",
    confidence: 0.9,
  },
  { id: "gender", test: /^gender$|^sex$|เพศ/, category: "identity", confidence: 0.8 },
  { id: "signature", test: /signature|ลายเซ็น|ลายมือชื่อ/, category: "identity", confidence: 0.85 },

  // ตัวระบุจากผู้ให้บริการภายนอก — นามแฝงที่ยังชี้กลับไปหาคนได้ จึงเป็นข้อมูลส่วนบุคคล
  {
    id: "external-subject-id",
    test: /(google|line|facebook|apple|azure|oidc|oauth|sso)_?(sub|id|uid|user_?id)|_?sub$|external_?id/,
    category: "identity",
    confidence: 0.8,
    gate: "person",
  },

  // หลักฐานความยินยอม — เป็นข้อมูลเกี่ยวกับบุคคลและเป็นสิ่งที่ผู้ควบคุมต้องพิสูจน์ได้
  {
    id: "consent-record",
    test: /consent|pdpa_?(accepted|agreed)|terms_?accepted|opt_?in/,
    category: "behavioral",
    confidence: 0.75,
  },

  // การเงิน
  {
    id: "bank",
    test: /bank_?(account|acct|no|number)|account_?(no|number)|iban|swift|promptpay|card_?(no|number)|credit_?card/,
    category: "financial",
    confidence: 0.9,
  },
  {
    id: "money-person",
    test: /salary|wage|income|payroll|compensation|bonus|allowance|provident|social_?security_?fund|เงินเดือน|รายได้/,
    category: "financial",
    confidence: 0.85,
  },

  // การจ้างงานและการศึกษา
  {
    /** HN ของโรงพยาบาลคือตัวระบุผู้ป่วยโดยตรง ไม่ใช่รหัสระบบทั่วไป */
    id: "patient-number",
    test: /^hn$|^mrn$|hospital_?(no|number)|patient_?(no|id|code|number)/,
    category: "identity",
    confidence: 0.85,
  },
  {
    /** เลขใบอนุญาตประกอบวิชาชีพผูกกับตัวบุคคลและค้นย้อนกลับได้ */
    id: "professional-licence",
    test: /licen[cs]e_?(no|number|id)$|licen[cs]e_?number|practitioner_?(no|id)/,
    category: "government_id",
    confidence: 0.8,
  },
  {
    id: "employee-code",
    test: /^emp(loyee)?_?(id|no|code)$|staff_?(id|no|code)|badge_?(id|no)/,
    category: "employment",
    confidence: 0.8,
  },
  {
    id: "employment",
    test: /job_?title|^position$|^department$|hire_?date|resign|termination|probation|^start_?date$|^end_?date$|employment_?(type|status)/,
    category: "employment",
    confidence: 0.7,
    gate: "person",
  },
  {
    id: "education",
    test: /education|degree|university|graduat|gpa|transcript/,
    category: "education",
    confidence: 0.7,
    gate: "person",
  },

  // ตำแหน่งที่อยู่ — เฉพาะเมื่อผูกกับคน ไม่ใช่พิกัดของสถานที่
  {
    id: "geo",
    test: /^(lat|lng|lon)$|latitude|longitude|geo_?(point|location)|gps|last_?location/,
    category: "location",
    confidence: 0.7,
    gate: "person",
  },

  // อุปกรณ์และการเชื่อมต่อ
  {
    id: "device",
    test: /ip_?address|^ip$|user_?agent|device_?(id|token|uuid)|mac_?address|fingerprint|advertising_?id|push_?token/,
    category: "device",
    confidence: 0.8,
  },
  {
    id: "behavioral",
    test: /last_?(login|seen|active)|login_?(at|count|history)|visited|clickstream/,
    category: "behavioral",
    confidence: 0.6,
    gate: "person",
  },

  // ภาพและสื่อ
  {
    id: "media",
    test: /avatar|photo|picture|selfie|profile_?image|image_?(url|key)|voice_?(note|clip)|recording/,
    category: "media",
    confidence: 0.7,
    gate: "person",
  },

  // ยานพาหนะ
  {
    id: "plate",
    test: /license_?plate|plate_?(no|number)|ทะเบียนรถ|vehicle_?(reg|no)|driver_?license/,
    category: "vehicle",
    confidence: 0.85,
  },

  // ข้อมูลยืนยันตัวตน
  {
    id: "credential",
    test: /password|passwd|^pwd|otp|reset_?token|refresh_?token|api_?key|^secret/,
    category: "credential",
    confidence: 0.85,
  },

  // ข้อมูลอ่อนไหวตามมาตรา 26
  {
    id: "health",
    test: /health|medical|diagnos|allerg|blood_?(type|group)|prescription|treatment|illness|chronic|comorbid|symptom|vaccin|immuni|surgery|therapy|สุขภาพ|โรคประจำตัว/,
    category: "health",
    confidence: 0.9,
  },
  { id: "disability", test: /disabilit|handicap|impairment|พิการ/, category: "disability", confidence: 0.9 },
  { id: "religion", test: /religio|ศาสนา|faith_?group/, category: "belief_religion", confidence: 0.9 },
  {
    id: "race",
    test: /ethnic|race$|nationality|เชื้อชาติ|สัญชาติ/,
    category: "race_ethnicity",
    confidence: 0.8,
  },
  {
    id: "criminal",
    test: /criminal|conviction|offence|offense_?record|ประวัติอาชญากรรม/,
    category: "criminal_record",
    confidence: 0.9,
  },
  { id: "union", test: /union_?(member|id)|สหภาพ/, category: "union", confidence: 0.85 },
  {
    id: "biometric",
    test: /biometric|face_?(embedding|template|descriptor)|iris|fingerprint_?template|voice_?print/,
    category: "biometric",
    confidence: 0.9,
  },
  { id: "genetic", test: /genetic|dna_?|genome/, category: "genetic", confidence: 0.9 },

  /**
   * ก้อน Json บนตารางที่เกี่ยวกับคนคือจุดบอดที่ใหญ่ที่สุด
   * ชื่อฟิลด์ไม่บอกอะไรเลยว่าข้างในมีอะไร และของจริงมักมีข้อมูลภาษี เงินกู้ หรือผลประเมิน
   * จึงเสนอด้วยความเชื่อมั่นต่ำเพื่อบังคับให้คนเปิดไปดู
   */
  {
    id: "opaque-json",
    test: /.*/,
    typeTest: /^Json(\[\])?$/,
    category: "behavioral",
    confidence: 0.35,
    gate: "person",
  },
];

export interface HeuristicHit {
  ruleId: string;
  category: Category;
  confidence: number;
}

/** ตัดตัวคั่นออกให้เทียบง่าย: `citizenId` และ `citizen_id` ต้องได้ผลเท่ากัน */
function normalize(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function passesGate(gate: ContextGate, container: string): boolean {
  switch (gate) {
    case "always":
      return true;
    case "person":
      return PERSON_CONTAINER.test(container);
    case "person-tail":
      return PERSON_TAIL.test(container);
  }
}

/**
 * เดาว่าฟิลด์นี้น่าจะเป็นข้อมูลส่วนบุคคลหรือไม่ คืน null ถ้าไม่เข้ากฎไหนเลย
 * ถ้าเข้าหลายกฎจะคืนกฎที่มั่นใจที่สุด
 */
export function guessCategory(field: SourceField): HeuristicHit | null {
  if (field.isRelation) return null;

  const name = normalize(field.source.field);
  if (NOT_A_VALUE.test(name)) return null;

  const container = field.source.container;
  const type = field.source.type ?? "";
  const penalty = JURISTIC_CONTAINER.test(container) ? JURISTIC_PENALTY : 1;

  let best: HeuristicHit | null = null;
  for (const rule of RULES) {
    if (!passesGate(rule.gate ?? "always", container)) continue;
    if (rule.typeTest !== undefined && !rule.typeTest.test(type)) continue;
    if (!rule.test.test(name)) continue;

    const confidence = Math.round(rule.confidence * penalty * 100) / 100;
    if (best === null || confidence > best.confidence) {
      best = { ruleId: rule.id, category: rule.category, confidence };
    }
  }
  return best;
}

/** เปิดเผยไว้ให้เทสต์และเอกสารอ้างถึงจำนวนกฎได้ */
export const RULE_COUNT = RULES.length;
