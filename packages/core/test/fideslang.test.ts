import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  ALL_CATEGORIES,
  exportFideslang,
  FIDESLANG_CATEGORIES,
  FIDESLANG_LEGAL_BASIS,
  LEGAL_BASES,
  toFidesKey,
  type Catalog,
} from "../src/index.js";

/**
 * คีย์ทั้งหมดของ data category ใน Fideslang
 *
 * คัดจาก `data_files/data_categories.csv` ของ ethyca/fideslang เมื่อ 15 ส.ค. 2569
 * เก็บสำเนาไว้ในเทสต์เพราะถ้าวันหนึ่งมีใครแก้ตารางเทียบให้ชี้ไปหาคีย์ที่ไม่มีจริง
 * ปลายทางจะรับไฟล์ไปแล้วค่อยพัง ซึ่งสายเกินกว่าจะรู้ตัว
 */
const FIDESLANG_KEYS = new Set([
  "system",
  "system.authentication",
  "system.operations",
  "user",
  "user.account",
  "user.account.settings",
  "user.account.username",
  "user.authorization",
  "user.authorization.biometric",
  "user.authorization.credentials",
  "user.authorization.password",
  "user.behavior",
  "user.behavior.browsing_history",
  "user.behavior.media_consumption",
  "user.behavior.purchase_history",
  "user.behavior.search_history",
  "user.biometric",
  "user.biometric.fingerprint",
  "user.biometric.health",
  "user.biometric.retinal",
  "user.biometric.voice",
  "user.childrens",
  "user.contact",
  "user.contact.address",
  "user.contact.address.city",
  "user.contact.address.country",
  "user.contact.address.postal_code",
  "user.contact.address.state",
  "user.contact.address.street",
  "user.contact.email",
  "user.contact.fax_number",
  "user.contact.organization",
  "user.contact.phone_number",
  "user.contact.url",
  "user.content",
  "user.content.private",
  "user.content.public",
  "user.content.self_image",
  "user.criminal_history",
  "user.demographic",
  "user.demographic.age_range",
  "user.demographic.date_of_birth",
  "user.demographic.gender",
  "user.demographic.language",
  "user.demographic.marital_status",
  "user.demographic.political_opinion",
  "user.demographic.profile",
  "user.demographic.race_ethnicity",
  "user.demographic.religious_belief",
  "user.demographic.sexual_orientation",
  "user.device",
  "user.device.cookie",
  "user.device.cookie_id",
  "user.device.device_id",
  "user.device.ip_address",
  "user.financial",
  "user.financial.bank_account",
  "user.financial.credit_card",
  "user.government_id",
  "user.government_id.birth_certificate",
  "user.government_id.drivers_license_number",
  "user.government_id.immigration",
  "user.government_id.national_identification_number",
  "user.government_id.passport_number",
  "user.government_id.vehicle_registration",
  "user.health_and_medical",
  "user.health_and_medical.genetic",
  "user.health_and_medical.insurance_beneficiary_id",
  "user.health_and_medical.record_id",
  "user.job_title",
  "user.location",
  "user.location.imprecise",
  "user.location.precise",
  "user.name",
  "user.name.first",
  "user.name.last",
  "user.payment",
  "user.privacy_preferences",
  "user.sensor",
  "user.social",
  "user.telemetry",
  "user.unique_id",
  "user.unique_id.pseudonymous",
  "user.user_sensor",
  "user.workplace",
]);

describe("ตารางเทียบกับ Fideslang", () => {
  it("ทุกหมวดที่ Arak รู้จักมีที่ลงใน Fideslang", () => {
    for (const category of ALL_CATEGORIES) {
      expect(FIDESLANG_CATEGORIES[category], `ขาดการเทียบของหมวด ${category}`).toBeDefined();
    }
  });

  it("ทุกคีย์ปลายทางมีอยู่จริงในอนุกรมวิธานของ Fideslang", () => {
    for (const [category, mapping] of Object.entries(FIDESLANG_CATEGORIES)) {
      expect(FIDESLANG_KEYS.has(mapping.fides), `${category} → ${mapping.fides} ไม่มีอยู่จริง`).toBe(
        true,
      );
    }
  });

  it("ช่องที่เทียบได้ไม่ตรงต้องมีเหตุผลกำกับเสมอ", () => {
    for (const [category, mapping] of Object.entries(FIDESLANG_CATEGORIES)) {
      if (mapping.exact) continue;
      expect(mapping.note, `${category} บอกว่าไม่ตรงแต่ไม่ได้บอกว่าทำไม`).toBeTruthy();
    }
  });

  it("ฐานทางกฎหมายทุกข้อของ PDPA มีที่ลง", () => {
    for (const basis of LEGAL_BASES) {
      expect(FIDESLANG_LEGAL_BASIS[basis]).toBeDefined();
    }
  });
});

describe("toFidesKey", () => {
  it("แปลงชื่อโปรเจกต์ให้เป็นคีย์ที่ถูกกติกา", () => {
    expect(toFidesKey("My App")).toBe("my_app");
    expect(toFidesKey("arak-demo")).toBe("arak-demo");
    expect(toFidesKey("ระบบคลัง")).toBe("arak_export");
  });
});

const catalog: Catalog = {
  version: 1,
  controller: { name: "บริษัททดสอบ จำกัด", contact: "dpo@example.co.th" },
  purposes: [
    { key: "billing", label: "ออกใบกำกับ", legalBasis: "legal_obligation", retention: "P5Y" },
  ],
  fields: [
    {
      id: "prisma:Driver.licencePlate",
      status: "marked",
      category: "vehicle",
      purposes: ["billing"],
      source: { kind: "prisma", file: "s.prisma", line: 4, container: "Driver", field: "licencePlate" },
    },
    {
      id: "prisma:Customer.email",
      status: "marked",
      category: "contact",
      purposes: ["billing"],
      source: { kind: "prisma", file: "s.prisma", line: 2, container: "Customer", field: "email" },
    },
    {
      id: "prisma:Customer.nickname",
      status: "unmarked",
      source: { kind: "prisma", file: "s.prisma", line: 6, container: "Customer", field: "nickname" },
    },
  ],
};

describe("exportFideslang", () => {
  const result = exportFideslang(catalog, { systemName: "demo app" });
  const doc = parse(result.yaml);

  it("ออก dataset ที่จัดกลุ่มฟิลด์ตามโมเดล", () => {
    const names = doc.dataset[0].collections.map((c: { name: string }) => c.name);
    expect(names).toEqual(["Customer", "Driver"]);
    expect(doc.dataset[0].fides_key).toBe("demo_app_dataset");
  });

  it("แปลงวัตถุประสงค์เป็น privacy_declarations พร้อมฐานทางกฎหมายแบบ GDPR", () => {
    const declaration = doc.system[0].privacy_declarations[0];
    expect(declaration.legal_basis_for_processing).toBe("Legal obligations of the controller");
    expect(declaration.retention_period).toBe("P5Y");
    expect(declaration.data_categories).toContain("user.contact");
  });

  it("ติดธงไว้ที่ฟิลด์ที่เทียบได้ไม่ตรง แล้วรายงานกลับมาให้คนเห็น", () => {
    const driver = doc.dataset[0].collections.find((c: { name: string }) => c.name === "Driver");
    expect(driver.fields[0].fides_meta.approximate).toBe(true);
    expect(result.approximations.map((a) => a.category)).toEqual(["vehicle"]);
    expect(result.approximations[0]?.note).toBeTruthy();
  });

  /**
   * ฟิลด์ที่ยังไม่ตัดสินห้ามถูกส่งออกในฐานะ "ตรวจแล้วไม่มีข้อมูลส่วนบุคคล"
   * ปลายทางไม่มีทางรู้ว่ามันมีอยู่ จึงต้องนับแล้วบอกกลับมาเสมอ
   */
  it("ไม่ส่งออกฟิลด์ที่ยังไม่ถูกตัดสิน แต่นับไว้แล้วรายงาน", () => {
    expect(result.undecided).toBe(1);
    expect(result.yaml).not.toContain("nickname");
  });

  it("เตือนไว้ในไฟล์ว่า data_use กับ data_subjects ยังเป็นค่าตั้งต้น", () => {
    expect(result.yaml).toContain("data_use และ data_subjects ยังเป็นค่าตั้งต้น");
  });
});
