import { guessCategory } from "./heuristic.js";
import {
  isKnownCategory,
  isSensitiveCategory,
  type Catalog,
  type CatalogField,
  type SourceField,
} from "./types.js";

export type ChangeKind =
  | "added"
  | "marked"
  | "unmarked"
  | "not-pii"
  | "reclassified"
  | "orphaned"
  | "restored";

export interface FieldChange {
  id: string;
  kind: ChangeKind;
  detail?: string;
}

export type ProblemLevel = "error" | "warning";

export interface Problem {
  level: ProblemLevel;
  id: string;
  message: string;
  file?: string;
  line?: number;
}

export interface ReconcileOptions {
  /** วันที่ในรูปแบบ YYYY-MM-DD ส่งเข้ามาเพื่อให้เทสต์ได้ผลคงที่ */
  today: string;
  /** ชนิดของตัวอ่านที่เพิ่งสแกน ใช้ตัดสินว่าฟิลด์ไหน "หายไป" ได้บ้าง */
  scannedKinds: string[];
  /** ปิดตัวเดาเมื่ออยากให้แคตตาล็อกมีเฉพาะสิ่งที่คนมาร์กเอง */
  useHeuristic?: boolean;
}

export interface ReconcileResult {
  catalog: Catalog;
  changes: FieldChange[];
  problems: Problem[];
}

/**
 * รวมสิ่งที่อ่านได้จากซอร์สเข้ากับแคตตาล็อกเดิม
 *
 * กฎการชี้ขาดมีสามข้อ และมีแค่สามข้อ
 * 1. ฟิลด์ที่มี `@pii(...)` ในโค้ด — คำอธิบายในโค้ดชนะ เพราะมันเดินทางไปพร้อมโค้ด
 * 2. ฟิลด์ที่ไม่มี annotation แต่มีอยู่ในแคตตาล็อกแล้ว — ของเดิมชนะ เพราะคนเป็นคนใส่ไว้
 * 3. ฟิลด์ที่ไม่มีทั้งสองอย่าง — ตัวเดาเสนอเข้ามาในสถานะ "ยังไม่ได้ตัดสิน"
 *
 * ฟังก์ชันนี้ไม่ลบอะไรทิ้งเลย ฟิลด์ที่หายไปจากซอร์สจะถูกทำเครื่องหมาย orphaned
 * เพราะการที่โค้ดลบคอลัมน์ไม่ได้แปลว่าข้อมูลในฐานถูกลบไปด้วย
 */
export function reconcile(
  existing: Catalog,
  sourceFields: SourceField[],
  options: ReconcileOptions,
): ReconcileResult {
  const useHeuristic = options.useHeuristic ?? true;
  const changes: FieldChange[] = [];
  const problems: Problem[] = [];

  const byId = new Map<string, CatalogField>();
  for (const f of existing.fields) byId.set(f.id, f);

  const purposeKeys = new Set(existing.purposes.map((p) => p.key));
  const seen = new Set<string>();
  const added: CatalogField[] = [];

  for (const src of sourceFields) {
    if (src.isRelation) continue;
    seen.add(src.id);

    const prev = byId.get(src.id);
    const ann = src.annotation ?? null;

    if (ann === null && prev === undefined) {
      if (!useHeuristic) continue;
      const hit = guessCategory(src);
      if (hit === null) continue;

      added.push({
        id: src.id,
        status: "unmarked",
        source: src.source,
        category: hit.category,
        detectedBy: [`heuristic:${hit.ruleId}`],
        confidence: hit.confidence,
        firstSeen: options.today,
      });
      changes.push({
        id: src.id,
        kind: "added",
        detail: `ตัวเดาเสนอว่าเป็น ${hit.category}`,
      });
      continue;
    }

    // ฟิลด์นี้อยู่ในแคตตาล็อกแล้ว หรือมี annotation ในโค้ด — เริ่มจากของเดิมเสมอ
    const next: CatalogField = prev
      ? { ...prev, source: src.source }
      : {
          id: src.id,
          status: "unmarked",
          source: src.source,
          firstSeen: options.today,
        };

    if (prev?.orphaned) {
      delete next.orphaned;
      changes.push({ id: src.id, kind: "restored", detail: "กลับมาอยู่ในซอร์สอีกครั้ง" });
    }

    if (ann !== null) {
      applyAnnotation(next, src, ann, problems, purposeKeys);
    }

    if (prev === undefined) {
      added.push(next);
      changes.push({
        id: src.id,
        kind: "added",
        detail: ann ? `มาร์กไว้ในโค้ดแล้ว (${next.status})` : undefined,
      });
    } else {
      recordDiff(prev, next, changes);
      byId.set(src.id, next);
    }
  }

  // ฟิลด์ที่แคตตาล็อกรู้จักแต่ซอร์สไม่มีแล้ว
  const scanned = new Set(options.scannedKinds);
  for (const [id, field] of byId) {
    if (seen.has(id)) continue;
    if (!scanned.has(field.source.kind)) continue;
    if (field.orphaned) continue;
    byId.set(id, { ...field, orphaned: true });
    changes.push({ id, kind: "orphaned", detail: "ไม่พบในซอร์สแล้ว" });
  }

  // คงลำดับเดิมไว้ ของใหม่ต่อท้ายแบบเรียงรหัสเพื่อให้ diff อ่านง่าย
  const merged: CatalogField[] = existing.fields.map((f) => byId.get(f.id) ?? f);
  added.sort((a, b) => a.id.localeCompare(b.id));
  merged.push(...added);

  for (const field of merged) {
    validateField(field, problems, purposeKeys);
  }

  return { catalog: { ...existing, fields: merged }, changes, problems };
}

function applyAnnotation(
  next: CatalogField,
  src: SourceField,
  ann: NonNullable<SourceField["annotation"]>,
  problems: Problem[],
  purposeKeys: Set<string>,
): void {
  if (ann.kind === "not-pii") {
    next.status = "not-pii";
    if (ann.reason !== undefined) next.reason = ann.reason;
    delete next.category;
    delete next.purposes;
    delete next.retention;
    delete next.detectedBy;
    delete next.confidence;
    if (next.reason === undefined) {
      problems.push({
        level: "warning",
        id: src.id,
        message: "@not-pii ไม่ได้ให้เหตุผลไว้ — ใส่ reason= เพื่อให้คนตรวจย้อนหลังได้",
        file: src.source.file,
        line: src.source.line,
      });
    }
    return;
  }

  next.status = "marked";
  delete next.reason;
  // ตัวเดาไม่มีน้ำหนักอีกแล้วเมื่อคนตัดสินด้วยมือ
  delete next.detectedBy;
  delete next.confidence;

  if (ann.category !== undefined) next.category = ann.category;
  if (ann.purposes !== undefined) next.purposes = ann.purposes;
  if (ann.retention !== undefined) next.retention = ann.retention;

  if (next.category === undefined) {
    problems.push({
      level: "warning",
      id: src.id,
      message: "@pii ไม่ได้ระบุ category",
      file: src.source.file,
      line: src.source.line,
    });
  }
  for (const key of next.purposes ?? []) {
    if (!purposeKeys.has(key)) {
      problems.push({
        level: "error",
        id: src.id,
        message: `อ้างวัตถุประสงค์ "${key}" ที่ไม่มีในแคตตาล็อก`,
        file: src.source.file,
        line: src.source.line,
      });
    }
  }
}

function validateField(
  field: CatalogField,
  problems: Problem[],
  purposeKeys: Set<string>,
): void {
  if (field.status !== "marked") return;
  if (field.category !== undefined && !isKnownCategory(field.category)) {
    problems.push({
      level: "warning",
      id: field.id,
      message: `หมวด "${field.category}" ไม่อยู่ในชุดมาตรฐาน`,
      file: field.source.file,
      line: field.source.line,
    });
  }
  if ((field.purposes ?? []).length === 0) {
    problems.push({
      level: "error",
      id: field.id,
      message: "มาร์กว่าเป็นข้อมูลส่วนบุคคลแล้วแต่ยังไม่มีวัตถุประสงค์ — ม.39(2) บังคับ",
      file: field.source.file,
      line: field.source.line,
    });
    return;
  }
  for (const key of field.purposes ?? []) {
    if (!purposeKeys.has(key)) {
      problems.push({
        level: "error",
        id: field.id,
        message: `อ้างวัตถุประสงค์ "${key}" ที่ไม่มีในแคตตาล็อก`,
        file: field.source.file,
        line: field.source.line,
      });
    }
  }
}

function recordDiff(prev: CatalogField, next: CatalogField, changes: FieldChange[]): void {
  if (prev.status !== next.status) {
    const kind: ChangeKind =
      next.status === "marked" ? "marked" : next.status === "not-pii" ? "not-pii" : "unmarked";
    changes.push({ id: next.id, kind, detail: `${prev.status} → ${next.status}` });
    return;
  }
  if (prev.category !== next.category) {
    changes.push({
      id: next.id,
      kind: "reclassified",
      detail: `${prev.category ?? "—"} → ${next.category ?? "—"}`,
    });
  }
}

export interface CatalogSummary {
  total: number;
  marked: number;
  unmarked: number;
  notPii: number;
  sensitive: number;
  orphaned: number;
}

export function summarize(catalog: Catalog): CatalogSummary {
  const summary: CatalogSummary = {
    total: 0,
    marked: 0,
    unmarked: 0,
    notPii: 0,
    sensitive: 0,
    orphaned: 0,
  };
  for (const f of catalog.fields) {
    summary.total += 1;
    if (f.orphaned) summary.orphaned += 1;
    if (f.status === "marked") summary.marked += 1;
    else if (f.status === "unmarked") summary.unmarked += 1;
    else summary.notPii += 1;
    if (f.status !== "not-pii" && isSensitiveCategory(f.category)) summary.sensitive += 1;
  }
  return summary;
}
