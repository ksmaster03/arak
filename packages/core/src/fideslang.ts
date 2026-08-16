import { stringify } from "yaml";
import {
  GENERAL_CATEGORIES,
  SENSITIVE_CATEGORIES,
  type Catalog,
  type Category,
  type LegalBasis,
} from "./types.js";

/**
 * แปลงแคตตาล็อกของ Arak ไปเป็นทรัพยากรตามภาษา Fideslang
 *
 * Fideslang (ethyca/fideslang) เป็นอนุกรมวิธานกลางสำหรับงานวิศวกรรมความเป็นส่วนตัว
 * เผยแพร่ภายใต้ CC BY 4.0 และเป็นฐานของ IAB Tech Lab Privacy Taxonomy
 * การ map ไปหามันทำให้แคตตาล็อกที่เขียนเพื่อ PDPA ไทย ไหลเข้าเครื่องมือที่คนอื่นใช้อยู่ได้
 * ทั้ง Fides, DataHub และ OpenMetadata โดยไม่ต้องกรอกใหม่
 *
 * ⚠️ ตารางนี้ไม่ได้ตรงกันหมดทุกช่อง และไม่ควรแกล้งว่าตรง
 * Fideslang เขียนขึ้นรอบ GDPR ส่วนหมวดของ Arak เขียนรอบมาตรา 26 ของ PDPA
 * ช่องที่เทียบได้ไม่ตรงจะถูกทำเครื่องหมาย `exact: false` พร้อมเหตุผลกำกับเสมอ
 * เพื่อให้คนที่เอาผลไปใช้ตัดสินใจเองได้ว่ารับความคลาดเคลื่อนนั้นไหวไหม
 */

export interface FideslangMapping {
  /** คีย์ในอนุกรมวิธาน Fideslang */
  fides: string;
  /** ความหมายตรงกันพอที่จะใช้แทนกันได้โดยไม่ต้องอธิบาย */
  exact: boolean;
  /** ทำไมถึงไม่ตรง — มีเมื่อ exact เป็น false */
  note?: string;
}

/**
 * ตารางเทียบหมวดของ Arak กับ data category ของ Fideslang
 *
 * ตรวจกับ `data_files/data_categories.csv` ของ ethyca/fideslang เมื่อ 15 ส.ค. 2569
 */
export const FIDESLANG_CATEGORIES: Record<Category, FideslangMapping> = {
  // หมวดทั่วไป
  identity: { fides: "user.name", exact: true },
  government_id: { fides: "user.government_id", exact: true },
  contact: { fides: "user.contact", exact: true },
  financial: { fides: "user.financial", exact: true },
  location: { fides: "user.location", exact: true },
  device: { fides: "user.device", exact: true },
  behavioral: { fides: "user.behavior", exact: true },
  credential: { fides: "user.authorization.credentials", exact: true },
  employment: {
    fides: "user.workplace",
    exact: false,
    note: "user.workplace หมายถึงองค์กรที่สังกัด ส่วน employment ของ Arak กว้างกว่า รวมเงินเดือนและสัญญาจ้างด้วย",
  },
  media: {
    fides: "user.content",
    exact: false,
    note: "user.content ครอบเนื้อหาที่ผู้ใช้สร้าง ส่วน media ของ Arak หมายถึงภาพ เสียง วิดีโอ ที่ระบุตัวบุคคลได้",
  },
  vehicle: {
    fides: "user.government_id.vehicle_registration",
    exact: false,
    note: "Fideslang มีแต่ทะเบียนรถในฐานะเอกสารราชการ ไม่มีหมวดยานพาหนะโดยตรง",
  },
  education: {
    fides: "user.demographic",
    exact: false,
    note: "Fideslang ไม่มีหมวดการศึกษา จึงต้องยัดลง user.demographic ซึ่งกว้างกว่ามาก",
  },
  family: {
    fides: "user.demographic.marital_status",
    exact: false,
    note: "ตรงเฉพาะสถานภาพสมรส ส่วนข้อมูลบุคคลในครอบครัวอื่น ๆ ไม่มีที่ลงใน Fideslang",
  },

  // หมวดอ่อนไหวตามมาตรา 26
  health: { fides: "user.health_and_medical", exact: true },
  genetic: { fides: "user.health_and_medical.genetic", exact: true },
  biometric: { fides: "user.biometric", exact: true },
  criminal_record: { fides: "user.criminal_history", exact: true },
  race_ethnicity: { fides: "user.demographic.race_ethnicity", exact: true },
  political_opinion: { fides: "user.demographic.political_opinion", exact: true },
  belief_religion: { fides: "user.demographic.religious_belief", exact: true },
  sexual_behavior: {
    fides: "user.demographic.sexual_orientation",
    exact: false,
    note: "รสนิยมทางเพศกับพฤติกรรมทางเพศไม่ใช่สิ่งเดียวกัน มาตรา 26 คุ้มครองอย่างหลัง Fideslang มีแต่อย่างแรก",
  },
  disability: {
    fides: "user.health_and_medical",
    exact: false,
    note: "Fideslang ไม่แยกความพิการออกจากข้อมูลสุขภาพ แต่มาตรา 26 ระบุไว้เป็นคนละรายการ",
  },
  union: {
    fides: "user.demographic",
    exact: false,
    note: "Fideslang ไม่มีหมวดสมาชิกภาพสหภาพแรงงานเลย ทั้งที่เป็นข้อมูลอ่อนไหวทั้งใน GDPR และมาตรา 26",
  },
};

/**
 * ฐานทางกฎหมายของ PDPA เทียบกับค่าที่ Fides ใช้ ซึ่งยึดถ้อยคำของ GDPR
 *
 * มาตรา 24 ของ PDPA กับมาตรา 6 ของ GDPR วางโครงคล้ายกันมากจนเทียบได้เกือบหมด
 * ยกเว้นข้อยกเว้นเรื่องจดหมายเหตุและการวิจัย ซึ่ง GDPR ไม่ได้นับเป็นฐานแยก
 */
export const FIDESLANG_LEGAL_BASIS: Record<LegalBasis, FideslangMapping> = {
  consent: { fides: "Consent", exact: true },
  contract: { fides: "Contract", exact: true },
  legal_obligation: { fides: "Legal obligations of the controller", exact: true },
  vital_interest: { fides: "Vital interests of the data subject", exact: true },
  public_task: { fides: "Public interest", exact: true },
  legitimate_interest: { fides: "Legitimate interests", exact: true },
  research_archive: {
    fides: "Legitimate interests",
    exact: false,
    note: "มาตรา 24(1) ให้จดหมายเหตุ วิจัย และสถิติ เป็นฐานแยกต่างหาก ส่วน GDPR ถือเป็นข้อยกเว้นภายใต้ฐานอื่น",
  },
};

/** ทำให้เป็น fides_key ที่ถูกกติกา — ตัวพิมพ์เล็ก ตัวเลข ขีดล่าง ขีดกลาง และจุด */
export function toFidesKey(value: string): string {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key === "" ? "arak_export" : key;
}

export interface ExportOptions {
  /** ชื่อระบบที่จะปรากฏใน Fides ปกติคือชื่อโปรเจกต์ */
  systemName: string;
}

export interface FideslangExport {
  yaml: string;
  /** หมวดที่ถูกใช้จริงแล้วเทียบได้ไม่ตรง — ต้องรายงานให้คนเห็น ไม่ใช่กลบ */
  approximations: { category: string; fides: string; note: string }[];
  /** ฟิลด์ที่ยังไม่ถูกตัดสิน จึงยังไม่มีหมวดจะส่งออก */
  undecided: number;
}

/**
 * ออกทรัพยากร Fideslang สองชิ้นจากแคตตาล็อกหนึ่งใบ
 *
 * `dataset` — โครงสร้างข้อมูล โมเดลกลายเป็น collection ฟิลด์กลายเป็น field
 * `system`  — วัตถุประสงค์กับฐานทางกฎหมาย กลายเป็น privacy_declarations
 *
 * ฟิลด์ที่ยังไม่ถูกตัดสินจะไม่ถูกส่งออกในฐานะ "ไม่มีข้อมูลส่วนบุคคล" เด็ดขาด
 * แต่จะถูกนับแล้วรายงานกลับ เพราะการเงียบจะทำให้ปลายทางเข้าใจว่าตรวจแล้วสะอาด
 */
export function exportFideslang(catalog: Catalog, options: ExportOptions): FideslangExport {
  const systemKey = toFidesKey(options.systemName);
  const approximations = new Map<string, { category: string; fides: string; note: string }>();

  const noteApproximation = (category: string): void => {
    const mapping = FIDESLANG_CATEGORIES[category as Category] as FideslangMapping | undefined;
    if (mapping === undefined || mapping.exact) return;
    approximations.set(category, {
      category,
      fides: mapping.fides,
      note: mapping.note ?? "",
    });
  };

  const collections = new Map<string, { name: string; fields: unknown[] }>();
  let undecided = 0;

  for (const field of catalog.fields) {
    if (field.status === "not-pii") continue;
    if (field.status !== "marked" || field.category === undefined) {
      undecided += 1;
      continue;
    }

    const mapping = FIDESLANG_CATEGORIES[field.category as Category] as
      | FideslangMapping
      | undefined;
    if (mapping === undefined) continue;
    noteApproximation(field.category);

    const container = field.source.container;
    let collection = collections.get(container);
    if (collection === undefined) {
      collection = { name: container, fields: [] };
      collections.set(container, collection);
    }

    collection.fields.push({
      name: field.source.field,
      description: `${field.id} — จาก ${field.source.file}:${field.source.line}`,
      data_categories: [mapping.fides],
      ...(mapping.exact ? {} : { fides_meta: { arak_category: field.category, approximate: true } }),
    });
  }

  const dataset = {
    fides_key: `${systemKey}_dataset`,
    name: options.systemName,
    description: "สร้างจาก pii-catalog.yaml ของ Arak — อย่าแก้ไฟล์นี้ด้วยมือ",
    collections: [...collections.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };

  const declarations = catalog.purposes.map((purpose) => {
    const fields = catalog.fields.filter(
      (f) => f.status === "marked" && (f.purposes ?? []).includes(purpose.key),
    );
    const categories = [
      ...new Set(
        fields
          .map((f) => FIDESLANG_CATEGORIES[f.category as Category]?.fides)
          .filter((c): c is string => c !== undefined),
      ),
    ].sort();
    const basis = FIDESLANG_LEGAL_BASIS[purpose.legalBasis];

    return {
      name: purpose.label,
      data_categories: categories,
      // Fides บังคับให้มี data_use แต่ Arak ไม่เก็บ data use ตามอนุกรมวิธานของ Fideslang
      // จะเดาให้ก็ผิดหลักของโครงการนี้ จึงใส่คีย์รากไว้ให้คนเลือกให้ละเอียดขึ้นเอง
      data_use: "essential",
      data_subjects: ["customer"],
      legal_basis_for_processing: basis?.fides ?? "Legitimate interests",
      retention_period: purpose.retention,
      ...(purpose.recipients === undefined ? {} : { shared_with: purpose.recipients }),
    };
  });

  const system = {
    fides_key: systemKey,
    name: options.systemName,
    system_type: "Application",
    description: catalog.controller?.name ?? "",
    ...(catalog.controller?.contact === undefined
      ? {}
      : { administrating_department: catalog.controller.contact }),
    privacy_declarations: declarations,
  };

  const banner =
    "# สร้างโดย arak export --format fideslang — อย่าแก้ด้วยมือ\n" +
    "# แหล่งความจริงคือ pii-catalog.yaml แก้ที่นั่นแล้วสร้างใหม่\n" +
    "#\n" +
    "# data_use และ data_subjects ยังเป็นค่าตั้งต้น เพราะ Arak ไม่เก็บสองอย่างนี้\n" +
    "# ต้องมีคนเลือกให้ละเอียดขึ้นก่อนเอาไปใช้เป็นเอกสารจริง\n\n";

  return {
    yaml: banner + stringify({ dataset: [dataset], system: [system] }, { lineWidth: 0 }),
    approximations: [...approximations.values()].sort((a, b) =>
      a.category.localeCompare(b.category),
    ),
    undecided,
  };
}

/** ตรวจว่าทุกหมวดที่ Arak รู้จัก มีที่ลงใน Fideslang จริง — ใช้ในเทสต์ */
export const ALL_CATEGORIES: readonly Category[] = [
  ...GENERAL_CATEGORIES,
  ...SENSITIVE_CATEGORIES,
];
