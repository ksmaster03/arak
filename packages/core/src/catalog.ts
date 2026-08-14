import {
  Document,
  isCollection,
  isMap,
  isSeq,
  parseDocument,
  visit,
  YAMLMap,
  YAMLSeq,
  type Node,
} from "yaml";
import {
  emptyCatalog,
  LEGAL_BASES,
  type Catalog,
  type CatalogField,
  type LegalBasis,
  type Purpose,
} from "./types.js";
import type { Problem } from "./reconcile.js";

const HEADER = `# แคตตาล็อกข้อมูลส่วนบุคคล (Arak)
#
# ไฟล์นี้คือแหล่งความจริงเพียงที่เดียวว่าระบบนี้เก็บข้อมูลส่วนบุคคลอะไรบ้าง
# เพื่ออะไร ด้วยฐานทางกฎหมายใด และเก็บไว้นานเท่าไร
# เนื้อหาที่นี่คือสิ่งที่ใช้ออกบันทึกรายการกิจกรรมการประมวลผล (RoPA) ตามมาตรา 39
#
# ส่วน controller / purposes / access / securityMeasures เป็นของคนล้วน ๆ
# เครื่องมือจะไม่แก้ให้ และคอมเมนต์ที่เขียนไว้จะไม่หาย
# ส่วน fields เครื่องมือดูแลให้ตรงกับซอร์สเสมอ แต่จะไม่ลบอะไรทิ้งเอง
`;

/** ลำดับคีย์ตอนเขียนรายการฟิลด์ใหม่ ให้ diff อ่านง่ายและคงที่ */
const FIELD_KEYS: (keyof CatalogField)[] = [
  "id",
  "status",
  "category",
  "purposes",
  "retention",
  "reason",
  "notes",
  "confidence",
  "detectedBy",
  "orphaned",
  "firstSeen",
  "deferredOn",
  "source",
];

export interface LoadResult {
  catalog: Catalog;
  problems: Problem[];
}

/** อ่านแคตตาล็อกจากข้อความ YAML พร้อมรายงานสิ่งที่ผิดรูป */
export function parseCatalog(text: string): LoadResult {
  const problems: Problem[] = [];
  const raw: unknown = parseDocument(text).toJS({ maxAliasCount: 100 });

  if (raw === null || typeof raw !== "object") {
    return { catalog: emptyCatalog(), problems };
  }
  const obj = raw as Record<string, unknown>;

  if (obj["version"] !== 1) {
    problems.push({
      level: "error",
      id: "catalog",
      message: `รองรับ version: 1 เท่านั้น พบ ${JSON.stringify(obj["version"])}`,
    });
  }

  const catalog: Catalog = {
    version: 1,
    purposes: readPurposes(obj["purposes"], problems),
    fields: readFields(obj["fields"], problems),
  };

  if (obj["controller"] !== undefined) catalog.controller = obj["controller"] as Catalog["controller"];
  if (obj["access"] !== undefined) catalog.access = obj["access"] as Catalog["access"];
  if (Array.isArray(obj["securityMeasures"])) {
    catalog.securityMeasures = obj["securityMeasures"].map(String);
  }

  return { catalog, problems };
}

function readPurposes(value: unknown, problems: Problem[]): Purpose[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    problems.push({ level: "error", id: "purposes", message: "purposes ต้องเป็นลิสต์" });
    return [];
  }
  const out: Purpose[] = [];
  const legal = new Set<string>(LEGAL_BASES);
  for (const [i, item] of value.entries()) {
    if (item === null || typeof item !== "object") {
      problems.push({ level: "error", id: `purposes[${i}]`, message: "รายการต้องเป็น object" });
      continue;
    }
    const p = item as Record<string, unknown>;
    const key = typeof p["key"] === "string" ? p["key"] : undefined;
    if (key === undefined) {
      problems.push({ level: "error", id: `purposes[${i}]`, message: "ต้องมี key" });
      continue;
    }
    if (typeof p["legalBasis"] !== "string" || !legal.has(p["legalBasis"])) {
      problems.push({
        level: "error",
        id: `purposes.${key}`,
        message: `legalBasis ต้องเป็นหนึ่งใน ${LEGAL_BASES.join(", ")}`,
      });
    }
    if (typeof p["retention"] !== "string" || p["retention"].length === 0) {
      problems.push({
        level: "error",
        id: `purposes.${key}`,
        message: "ต้องมี retention — ม.39(4) บังคับให้ระบุระยะเวลาเก็บรักษา",
      });
    }
    out.push({
      key,
      label: typeof p["label"] === "string" ? p["label"] : key,
      legalBasis: (p["legalBasis"] as LegalBasis) ?? "consent",
      retention: typeof p["retention"] === "string" ? p["retention"] : "",
      ...(Array.isArray(p["recipients"]) ? { recipients: p["recipients"].map(String) } : {}),
      ...(typeof p["description"] === "string" ? { description: p["description"] } : {}),
    });
  }
  return out;
}

function readFields(value: unknown, problems: Problem[]): CatalogField[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    problems.push({ level: "error", id: "fields", message: "fields ต้องเป็นลิสต์" });
    return [];
  }
  const out: CatalogField[] = [];
  const seen = new Set<string>();
  for (const [i, item] of value.entries()) {
    if (item === null || typeof item !== "object") {
      problems.push({ level: "error", id: `fields[${i}]`, message: "รายการต้องเป็น object" });
      continue;
    }
    const f = item as Record<string, unknown>;
    const id = typeof f["id"] === "string" ? f["id"] : undefined;
    if (id === undefined) {
      problems.push({ level: "error", id: `fields[${i}]`, message: "ต้องมี id" });
      continue;
    }
    if (seen.has(id)) {
      problems.push({ level: "error", id, message: "id ซ้ำในแคตตาล็อก" });
      continue;
    }
    seen.add(id);
    const source = f["source"];
    if (source === null || typeof source !== "object") {
      problems.push({ level: "error", id, message: "ต้องมี source บอกว่าฟิลด์นี้อยู่ที่ไหน" });
      continue;
    }
    out.push({ ...(f as unknown as CatalogField), id });
  }
  return out;
}

/**
 * เขียนแคตตาล็อกกลับเป็น YAML
 *
 * ถ้ามีข้อความเดิมส่งเข้ามา จะแก้เฉพาะจุดที่เปลี่ยนจริงในลิสต์ fields
 * เพื่อไม่ให้คอมเมนต์ที่คนเขียนไว้หายไปทุกครั้งที่รัน sync
 */
export function serializeCatalog(catalog: Catalog, previous?: string): string {
  const doc =
    previous !== undefined && previous.trim().length > 0
      ? parseDocument(previous)
      : freshDocument(catalog);

  if (doc.get("version") === undefined) doc.set("version", 1);
  writeFields(doc, catalog.fields);

  let text = doc.toString({ lineWidth: 0 });
  if (!text.startsWith("#")) text = `${HEADER}\n${text}`;
  return text;
}

function freshDocument(catalog: Catalog): Document {
  const doc = new Document({
    version: 1,
    ...(catalog.controller ? { controller: catalog.controller } : {}),
    purposes: catalog.purposes,
    ...(catalog.access ? { access: catalog.access } : {}),
    ...(catalog.securityMeasures ? { securityMeasures: catalog.securityMeasures } : {}),
    fields: [],
  });
  blockify(doc);
  return doc;
}

/**
 * บังคับให้ทุก collection ที่มีของอยู่เขียนแบบบล็อก ไม่ใช่แบบ `{a: 1, b: 2}` บรรทัดเดียว
 *
 * ถ้าปล่อยให้เป็นแบบบรรทัดเดียว ทั้งลิสต์ฟิลด์จะกลายเป็นบรรทัดยาวเส้นเดียว
 * ซึ่งทำให้ diff อ่านไม่ได้ และเหตุผลทั้งหมดที่แคตตาล็อกอยู่ใน git ก็หายไป
 */
function blockify(node: Document | Node): void {
  visit(node, {
    Collection(_key, item) {
      if (isCollection(item) && item.items.length > 0) item.flow = false;
    },
  });
}

function writeFields(doc: Document, fields: CatalogField[]): void {
  let seq = doc.get("fields", true);
  if (!isSeq(seq)) {
    seq = new YAMLSeq();
    doc.set("fields", seq);
  }
  const list = seq as YAMLSeq;

  const nodeById = new Map<string, YAMLMap>();
  for (const item of list.items) {
    if (!isMap(item)) continue;
    const id = item.get("id");
    if (typeof id === "string") nodeById.set(id, item);
  }

  const desired = new Map(fields.map((f) => [f.id, f]));

  for (const [id, node] of nodeById) {
    const field = desired.get(id);
    if (field === undefined) continue;
    updateNode(doc, node, field);
  }

  // ฟิลด์ที่ไม่มีในผลลัพธ์แล้วจริง ๆ ค่อยตัดออก (reconcile ปกติจะไม่ลบอะไรเลย)
  list.items = list.items.filter((item) => {
    if (!isMap(item)) return true;
    const id = item.get("id");
    return typeof id !== "string" || desired.has(id);
  });

  for (const field of fields) {
    if (nodeById.has(field.id)) continue;
    const node = doc.createNode(compact(field));
    blockify(node);
    list.items.push(node);
  }

  if (list.items.length > 0) list.flow = false;
}

function updateNode(doc: Document, node: YAMLMap, field: CatalogField): void {
  const current = node.toJSON() as Record<string, unknown>;
  for (const key of FIELD_KEYS) {
    const value = field[key];
    if (value === undefined) {
      if (node.has(key)) node.delete(key);
      continue;
    }
    // แตะเฉพาะคีย์ที่ค่าต่างจริง เพื่อให้โหนดที่ไม่เปลี่ยนคงคอมเมนต์ของมันไว้
    if (JSON.stringify(current[key]) === JSON.stringify(value)) continue;
    const created = doc.createNode(value);
    blockify(created);
    node.set(key, created);
  }
}

/** ตัดคีย์ที่เป็น undefined ออก และเรียงคีย์ให้คงที่ */
function compact(field: CatalogField): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FIELD_KEYS) {
    const value = field[key];
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/** แคตตาล็อกตั้งต้นที่ `arak init` เขียนออกไป */
export function starterCatalog(projectName: string): Catalog {
  return {
    version: 1,
    controller: {
      name: projectName,
      contact: "dpo@example.com",
    },
    purposes: [
      {
        key: "account",
        label: "สร้างและดูแลบัญชีผู้ใช้",
        legalBasis: "contract",
        retention: "P1Y",
        description: "ใช้ยืนยันตัวตนและให้บริการตามสัญญาที่ทำกับผู้ใช้",
      },
    ],
    access: {
      requestChannel: "dpo@example.com",
      whoCanAccess: ["ทีมที่ดูแลระบบนี้เท่านั้น"],
    },
    securityMeasures: [
      "เข้ารหัสระหว่างส่ง (TLS) และเข้ารหัสข้อมูลที่พักอยู่",
      "จำกัดสิทธิ์เข้าถึงตามหน้าที่ และบันทึกการเข้าถึง",
    ],
    fields: [],
  };
}
