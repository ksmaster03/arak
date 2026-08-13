import type { PiiAnnotation } from "@arak/core";

/**
 * อ่าน `@pii(...)` และ `@not-pii(...)` ออกจากคอมเมนต์ ///
 *
 * รูปแบบที่รองรับ
 *   /// @pii(identity)
 *   /// @pii(category=contact, purposes=account;marketing)
 *   /// @pii(category=health, retention=P5Y)
 *   /// @not-pii(reason="รหัสภายใน ไม่ผูกกับตัวบุคคล")
 *
 * ประโยคอธิบายอื่นในคอมเมนต์ก้อนเดียวกันจะถูกปล่อยผ่าน เพราะสคีมาจริง
 * มักมีคำอธิบายภาษาคนอยู่ก่อนแล้ว
 */

const TAG = /@(not-)?pii\b\s*(?:\(([\s\S]*?)\))?/;

const KNOWN_KEYS = new Set(["category", "purpose", "purposes", "retention", "reason"]);

export interface AnnotationResult {
  annotation: PiiAnnotation | null;
  errors: string[];
}

export function parseAnnotation(docLines: string[]): AnnotationResult {
  const errors: string[] = [];
  const text = docLines.join("\n");
  const match = TAG.exec(text);
  if (match === null) return { annotation: null, errors };

  const kind = match[1] === "not-" ? "not-pii" : "pii";
  const body = match[2] ?? "";
  const raw = match[0];

  const annotation: PiiAnnotation = { kind, raw };
  const tokens = splitTop(body);

  for (const [index, token] of tokens.entries()) {
    const trimmed = token.trim();
    if (trimmed.length === 0) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      // ทางลัด `@pii(identity)` — โทเคนเปล่าตัวแรกถือเป็นหมวด
      if (index === 0 && kind === "pii") {
        annotation.category = unquote(trimmed);
        continue;
      }
      errors.push(`อ่าน "${trimmed}" ไม่ออก — ต้องเขียนเป็น key=value`);
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    const value = unquote(trimmed.slice(eq + 1).trim());

    if (!KNOWN_KEYS.has(key)) {
      errors.push(`ไม่รู้จักคีย์ "${key}" — ใช้ได้เฉพาะ ${[...KNOWN_KEYS].join(", ")}`);
      continue;
    }
    if (value.length === 0) {
      errors.push(`คีย์ "${key}" ไม่มีค่า`);
      continue;
    }

    switch (key) {
      case "category":
        annotation.category = value;
        break;
      case "purpose":
      case "purposes":
        annotation.purposes = value
          .split(/[;|+]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        break;
      case "retention":
        annotation.retention = value;
        break;
      case "reason":
        annotation.reason = value;
        break;
    }
  }

  if (kind === "not-pii" && (annotation.category !== undefined || annotation.purposes !== undefined)) {
    errors.push("@not-pii ไม่ควรมี category หรือ purposes");
  }

  return { annotation, errors };
}

/** แยกด้วยคอมมาโดยไม่ตัดคอมมาที่อยู่ในเครื่องหมายคำพูด */
function splitTop(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote !== null) {
      if (ch === quote && body[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}
