import {
  CATEGORY_LABELS,
  isSensitiveCategory,
  LEGAL_BASIS_LABELS,
  type Catalog,
  type CatalogField,
  type Purpose,
} from "@arak/core";
import type { Sheet } from "./xlsx.js";

/**
 * บันทึกรายการกิจกรรมการประมวลผลข้อมูลส่วนบุคคล — พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล มาตรา 39
 *
 * ออกเป็น .xlsx เพราะ RoPA คือตาราง ไม่ใช่เรียงความ ผู้ตรวจกับ DPO ต้องกรอง เรียง
 * และเติมคอลัมน์ของตัวเองต่อได้ ซึ่งไฟล์ข้อความทำให้ไม่ได้
 *
 * เอกสารนี้ประกอบจากแคตตาล็อกล้วน ๆ ไม่มีการเดาแทรกเลยแม้แต่ช่องเดียว
 * ช่องที่คนยังไม่กรอกจะขึ้นว่า "ยังไม่ระบุ" ให้เห็นชัด ไม่ใช่ปล่อยว่างให้ดูเหมือนครบ
 */

const NOT_SET = "ยังไม่ระบุ";

const STATUS_LABELS: Record<CatalogField["status"], string> = {
  marked: "ตัดสินแล้ว",
  unmarked: "ยังไม่ได้ตัดสิน",
  deferred: "หนี้เก่าที่พักไว้",
  "not-pii": "ระบุว่าไม่ใช่ข้อมูลส่วนบุคคล",
};

function categoryLabel(category: string | undefined): string {
  if (category === undefined) return NOT_SET;
  return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category;
}

function list(values: string[] | undefined): string {
  return values === undefined || values.length === 0 ? NOT_SET : values.join("\n");
}

function fieldLabel(field: CatalogField): string {
  return `${field.source.container}.${field.source.field}`;
}

/** ฟิลด์ที่นับเป็นข้อมูลส่วนบุคคล — ตัดสินแล้วว่าเป็น หรือยังไม่มีใครตัดสิน */
function personalFields(catalog: Catalog): CatalogField[] {
  return catalog.fields.filter((f) => f.status !== "not-pii");
}

function purposeRow(
  purpose: Purpose,
  index: number,
  fields: CatalogField[],
  catalog: Catalog,
): string[] {
  const mine = fields.filter((f) => (f.purposes ?? []).includes(purpose.key));
  const sensitive = mine.filter((f) => isSensitiveCategory(f.category));
  const categories = [...new Set(mine.map((f) => categoryLabel(f.category)))].sort();

  return [
    String(index + 1),
    purpose.label,
    purpose.description ?? "",
    LEGAL_BASIS_LABELS[purpose.legalBasis] ?? purpose.legalBasis,
    categories.length === 0 ? NOT_SET : categories.join("\n"),
    mine.length === 0 ? NOT_SET : mine.map(fieldLabel).join("\n"),
    sensitive.length === 0 ? "ไม่มี" : sensitive.map(fieldLabel).join("\n"),
    purpose.retention === "indefinite" ? "ไม่กำหนดระยะเวลา" : purpose.retention,
    list(purpose.recipients),
    list(catalog.access?.whoCanAccess),
    catalog.access?.requestChannel ?? NOT_SET,
    catalog.access?.rightsUrl ?? NOT_SET,
    list(catalog.access?.refusalGrounds),
    list(catalog.securityMeasures),
  ];
}

function activitiesSheet(catalog: Catalog): Sheet {
  const fields = personalFields(catalog);
  const rows: string[][] = [
    [
      "ลำดับ",
      "กิจกรรมการประมวลผล / วัตถุประสงค์\nม.39(2)",
      "คำอธิบาย",
      "ฐานทางกฎหมาย\nม.24 / ม.26",
      "หมวดข้อมูลที่เก็บ\nม.39(1)",
      "ฟิลด์ที่เกี่ยวข้อง\nม.39(1)",
      "ข้อมูลอ่อนไหว\nม.26",
      "ระยะเวลาเก็บ\nม.39(4)",
      "ผู้รับข้อมูล / การเปิดเผย\nม.39(6)",
      "ผู้เข้าถึงภายใน\nม.39(5)",
      "ช่องทางใช้สิทธิ\nม.39(5)",
      "ลิงก์นโยบาย",
      "เหตุที่ปฏิเสธคำขอได้\nม.39(7)",
      "มาตรการความมั่นคงปลอดภัย\nม.37(1)",
    ],
  ];

  catalog.purposes.forEach((purpose, i) => {
    rows.push(purposeRow(purpose, i, fields, catalog));
  });

  // ฟิลด์ที่ยังไม่ถูกผูกกับวัตถุประสงค์ใดเลยต้องปรากฏในเอกสาร ไม่ใช่หายไปเงียบ ๆ
  // บันทึกที่ดูเรียบร้อยแต่ไม่ครบ สร้างความเสียหายมากกว่าการไม่มีบันทึกเลย
  const unassigned = fields.filter((f) => (f.purposes ?? []).length === 0);
  if (unassigned.length > 0) {
    rows.push([
      "!",
      "ยังไม่ได้ผูกกับวัตถุประสงค์ใด",
      `${unassigned.length} ฟิลด์ที่ยังไม่ถูกตัดสิน จึงยังลงบันทึกตามมาตรา 39 ไม่ได้`,
      NOT_SET,
      [...new Set(unassigned.map((f) => categoryLabel(f.category)))].sort().join("\n"),
      unassigned.map(fieldLabel).join("\n"),
      unassigned
        .filter((f) => isSensitiveCategory(f.category))
        .map(fieldLabel)
        .join("\n") || "ไม่มี",
      NOT_SET,
      NOT_SET,
      NOT_SET,
      NOT_SET,
      NOT_SET,
      NOT_SET,
      NOT_SET,
    ]);
  }

  return {
    name: "บันทึกรายการ ม.39",
    widths: [6, 32, 34, 30, 24, 30, 24, 14, 26, 24, 24, 26, 28, 30],
    rows,
  };
}

function fieldsSheet(catalog: Catalog): Sheet {
  const rows: string[][] = [
    [
      "รหัสฟิลด์",
      "โมเดล",
      "ฟิลด์",
      "ชนิดข้อมูล",
      "หมวด",
      "อ่อนไหว ม.26",
      "สถานะ",
      "วัตถุประสงค์",
      "ระยะเวลาเก็บ",
      "แหล่งที่มาในซอร์ส",
      "เหตุผลที่ระบุว่าไม่ใช่",
      "หมายเหตุ",
      "พบครั้งแรก",
    ],
  ];

  for (const field of [...catalog.fields].sort((a, b) => a.id.localeCompare(b.id))) {
    rows.push([
      field.id,
      field.source.container,
      field.source.field,
      field.source.type ?? "",
      field.status === "not-pii" ? "—" : categoryLabel(field.category),
      isSensitiveCategory(field.category) ? "ใช่" : "",
      STATUS_LABELS[field.status] + (field.orphaned === true ? " (หายไปจากซอร์สแล้ว)" : ""),
      (field.purposes ?? []).join("\n"),
      field.retention ?? "",
      `${field.source.file}:${field.source.line}`,
      field.reason ?? "",
      field.notes ?? "",
      field.firstSeen ?? "",
    ]);
  }

  return {
    name: "รายการฟิลด์",
    widths: [30, 20, 20, 12, 26, 12, 22, 22, 14, 34, 40, 30, 12],
    rows,
  };
}

function controllerSheet(catalog: Catalog, generatedOn: string): Sheet {
  const c = catalog.controller;
  const rows: string[][] = [
    ["หัวข้อ", "รายละเอียด", "อ้างอิง"],
    ["ผู้ควบคุมข้อมูลส่วนบุคคล", c?.name ?? NOT_SET, "ม.39(3)"],
    ["ที่อยู่", c?.address ?? NOT_SET, "ม.39(3)"],
    ["ช่องทางติดต่อ", c?.contact ?? NOT_SET, "ม.39(3)"],
    ["เจ้าหน้าที่คุ้มครองข้อมูล (DPO)", c?.dpo?.name ?? NOT_SET, "ม.41"],
    ["ช่องทางติดต่อ DPO", c?.dpo?.contact ?? NOT_SET, "ม.41"],
    ["ช่องทางที่เจ้าของข้อมูลใช้สิทธิ", catalog.access?.requestChannel ?? NOT_SET, "ม.39(5)"],
    ["ลิงก์นโยบายความเป็นส่วนตัว", catalog.access?.rightsUrl ?? NOT_SET, "ม.39(5)"],
    ["ผู้เข้าถึงข้อมูลภายในองค์กร", list(catalog.access?.whoCanAccess), "ม.39(5)"],
    ["เหตุที่ปฏิเสธคำขอใช้สิทธิได้", list(catalog.access?.refusalGrounds), "ม.39(7)"],
    ["มาตรการรักษาความมั่นคงปลอดภัย", list(catalog.securityMeasures), "ม.37(1)"],
    ["", "", ""],
    ["วันที่ออกเอกสาร", generatedOn, ""],
    ["ที่มาของเอกสาร", "สร้างจาก pii-catalog.yaml ด้วย arak ropa", ""],
  ];

  return { name: "ผู้ควบคุมข้อมูล", widths: [34, 60, 14], rows };
}

export interface RopaResult {
  sheets: Sheet[];
  /** ฟิลด์ที่ยังไม่ถูกตัดสิน จึงทำให้บันทึกยังไม่ครบตามมาตรา 39 */
  undecided: number;
  purposes: number;
  fields: number;
}

export function buildRopa(catalog: Catalog, generatedOn: string): RopaResult {
  const undecided = catalog.fields.filter(
    (f) => (f.status === "unmarked" || f.status === "deferred") && f.orphaned !== true,
  ).length;

  return {
    sheets: [controllerSheet(catalog, generatedOn), activitiesSheet(catalog), fieldsSheet(catalog)],
    undecided,
    purposes: catalog.purposes.length,
    fields: personalFields(catalog).length,
  };
}
