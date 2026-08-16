import { isSensitiveCategory, type CatalogField, type Problem } from "@arak/core";
import type { Finding } from "./scan.js";

/**
 * ออกผลเป็น SARIF 2.1.0
 *
 * มีไว้เพราะรหัสจบการทำงานเห็นได้แค่คนที่เปิดเทอร์มินัลดู ทีมที่เหลือไม่เห็นอะไรเลย
 * พอ GitHub รับ SARIF ผ่าน `github/codeql-action/upload-sarif` ผลจะไปโผล่เป็น
 * คอมเมนต์ในบรรทัดที่มีปัญหาใน pull request ตรงจุดที่คนกำลังตัดสินใจว่าจะ merge ไหม
 *
 * ข้อบังคับเด็ดขาดของไฟล์นี้ — ห้ามมีค่าจริงของข้อมูลส่วนบุคคลหลุดลงไปในผลลัพธ์
 * ไฟล์ SARIF ถูกอัปโหลดขึ้นเซิร์ฟเวอร์และเก็บไว้นานกว่าไฟล์ที่ถูกสแกนมาก
 * ตัว `scan` จึงส่งได้เฉพาะ `preview` ที่ปิดบังแล้วเท่านั้น
 */

const SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const INFO_URI = "https://github.com/ksmaster03/arak";

type Level = "error" | "warning" | "note";

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  defaultConfiguration: { level: Level };
  help: { text: string };
}

interface SarifResult {
  ruleId: string;
  level: Level;
  message: { text: string };
  locations: {
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number; startColumn?: number };
    };
  }[];
  partialFingerprints: Record<string, string>;
}

function buildLog(
  rules: SarifRule[],
  results: SarifResult[],
  version: string,
): string {
  const used = new Set(results.map((r) => r.ruleId));
  return `${JSON.stringify(
    {
      $schema: SCHEMA,
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "Arak",
              version,
              informationUri: INFO_URI,
              rules: rules.filter((rule) => used.has(rule.id)),
            },
          },
          results,
        },
      ],
    },
    null,
    2,
  )}\n`;
}

function location(file: string, line: number, column?: number) {
  return {
    physicalLocation: {
      artifactLocation: { uri: file },
      region: column === undefined ? { startLine: line } : { startLine: line, startColumn: column },
    },
  };
}

const STATUS_RULES: SarifRule[] = [
  {
    id: "arak/undecided-field",
    name: "UndecidedPersonalDataField",
    shortDescription: { text: "ฟิลด์นี้ยังไม่มีใครตัดสินว่าเป็นข้อมูลส่วนบุคคลหรือไม่" },
    fullDescription: {
      text:
        "บันทึกรายการกิจกรรมการประมวลผลตามมาตรา 39 ต้องระบุได้ว่าเก็บข้อมูลอะไร " +
        "เพื่ออะไร และด้วยฐานทางกฎหมายใด ฟิลด์ที่ยังไม่ถูกตัดสินทำให้บันทึกนั้นไม่ครบ",
    },
    defaultConfiguration: { level: "warning" },
    help: {
      text:
        "เติมคอมเมนต์เอกสารเหนือฟิลด์ — /// @pii(category=<หมวด>, purposes=<คีย์>) " +
        'หรือ /// @not-pii(reason="เหตุผล") ถ้าพิจารณาแล้วไม่ใช่ข้อมูลส่วนบุคคล',
    },
  },
  {
    id: "arak/sensitive-field",
    name: "SensitivePersonalDataField",
    shortDescription: { text: "ข้อมูลอ่อนไหวตามมาตรา 26 ที่ยังไม่ถูกตัดสิน" },
    fullDescription: {
      text:
        "ข้อมูลอ่อนไหวตามมาตรา 26 เช่นสุขภาพ ศาสนา ชีวมาตร ต้องได้ความยินยอมโดยชัดแจ้ง " +
        "เว้นแต่เข้าข้อยกเว้นในมาตราเดียวกัน จึงต้องตัดสินก่อนขึ้นโปรดักชันเสมอ",
    },
    defaultConfiguration: { level: "error" },
    help: { text: "ตัดสินฟิลด์นี้ก่อน แล้วตรวจว่าฐานทางกฎหมายของวัตถุประสงค์รองรับข้อมูลอ่อนไหวจริง" },
  },
  {
    id: "arak/catalog-error",
    name: "CatalogError",
    shortDescription: { text: "แคตตาล็อกข้อมูลส่วนบุคคลมีข้อผิดพลาด" },
    defaultConfiguration: { level: "error" },
    help: { text: "รัน arak status ในเครื่องเพื่อดูรายละเอียด" },
  },
  {
    id: "arak/catalog-warning",
    name: "CatalogWarning",
    shortDescription: { text: "แคตตาล็อกข้อมูลส่วนบุคคลมีจุดที่ควรดู" },
    defaultConfiguration: { level: "warning" },
    help: { text: "รัน arak status ในเครื่องเพื่อดูรายละเอียด" },
  },
];

/** ผลของ `arak status` ในรูป SARIF — ฟิลด์ที่ยังไม่ตัดสิน บวกปัญหาในแคตตาล็อก */
export function statusToSarif(
  fields: CatalogField[],
  problems: Problem[],
  version: string,
): string {
  const results: SarifResult[] = [];

  for (const field of fields) {
    if (field.status !== "unmarked" || field.orphaned === true) continue;
    const sensitive = isSensitiveCategory(field.category);
    const parts = [
      `${field.source.container}.${field.source.field} ยังไม่ถูกตัดสินว่าเป็นข้อมูลส่วนบุคคลหรือไม่`,
    ];
    if (field.category !== undefined) {
      parts.push(
        sensitive
          ? `ตัวเดาเสนอว่าน่าจะเป็น ${field.category} ซึ่งเป็นข้อมูลอ่อนไหวตามมาตรา 26`
          : `ตัวเดาเสนอว่าน่าจะเป็น ${field.category}`,
      );
    }
    parts.push("เติม /// @pii(...) หรือ /// @not-pii(reason=...) เหนือฟิลด์นี้");

    results.push({
      ruleId: sensitive ? "arak/sensitive-field" : "arak/undecided-field",
      level: sensitive ? "error" : "warning",
      message: { text: parts.join(" — ") },
      locations: [location(field.source.file, field.source.line)],
      partialFingerprints: { arakFieldId: field.id },
    });
  }

  for (const problem of problems) {
    if (problem.file === undefined) continue;
    results.push({
      ruleId: problem.level === "error" ? "arak/catalog-error" : "arak/catalog-warning",
      level: problem.level === "error" ? "error" : "warning",
      message: { text: `${problem.id}: ${problem.message}` },
      locations: [location(problem.file, problem.line ?? 1)],
      partialFingerprints: { arakProblemId: `${problem.id}:${problem.message}` },
    });
  }

  return buildLog(STATUS_RULES, results, version);
}

/**
 * ผลของ `arak scan` ในรูป SARIF
 *
 * หนึ่งกฎต่อหนึ่งชนิดข้อมูล เพื่อให้ GitHub จัดกลุ่มผลให้เอง
 * ข้อความใช้ `preview` ที่ปิดบังแล้วเสมอ ไม่แตะ `match.value`
 */
export function scanToSarif(findings: Finding[], version: string): string {
  const types = [...new Set(findings.map((f) => f.match.type))].sort();

  const rules: SarifRule[] = types.map((type) => ({
    id: `arak/real-data/${type}`,
    name: `RealPersonalData_${type}`,
    shortDescription: { text: `พบข้อมูลส่วนบุคคลของจริงชนิด ${type} อยู่ในไฟล์` },
    fullDescription: {
      text:
        "ข้อมูลส่วนบุคคลของจริงที่ค้างอยู่ในซอร์ส เช่นไฟล์ seed หรือ fixture " +
        "จะถูกคัดลอกไปพร้อมโค้ดทุกครั้งที่มีคน clone และอยู่ในประวัติ git ตลอดไป",
    },
    defaultConfiguration: { level: "error" },
    help: { text: "ย้ายค่าออกไปนอก repo หรือแทนด้วยข้อมูลสมมติที่ไม่ผูกกับตัวบุคคลจริง" },
  }));

  const results: SarifResult[] = findings.map((finding) => ({
    ruleId: `arak/real-data/${finding.match.type}`,
    level: "error" as const,
    message: {
      text:
        `พบค่าที่น่าจะเป็น ${finding.match.type} ของจริง (${finding.preview}) ` +
        `ความเชื่อมั่น ${finding.match.confidence} — ย้ายออกหรือแทนด้วยข้อมูลสมมติ`,
    },
    locations: [location(finding.file, finding.line, finding.column)],
    partialFingerprints: {
      arakFinding: `${finding.match.type}:${finding.file}:${finding.line}:${finding.column}`,
    },
  }));

  return buildLog(rules, results, version);
}
