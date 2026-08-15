import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * ของใช้ร่วมของฮุกทุกตัว
 *
 * หลักที่ยึดไว้ตลอดไฟล์นี้: **ฮุกต้องไม่ทำให้เซสชันของคนใช้พัง**
 * ถ้าอ่านอะไรไม่ได้หรือเกิดข้อผิดพลาด ให้บอกเป็นข้อความเตือนแล้วปล่อยผ่าน
 * ไม่ใช่คืนรหัสที่บล็อก
 */

export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw.length === 0 ? {} : JSON.parse(raw);
}

export function emit(payload) {
  process.stdout.write(JSON.stringify(payload));
}

/** จบแบบไม่มีอะไรจะบอก */
export function quiet() {
  process.exit(0);
}

/** บอกผู้ใช้ว่าฮุกมีปัญหา แต่ไม่ขวางงาน */
export function warn(message) {
  emit({ systemMessage: `Arak: ${message}` });
  process.exit(0);
}

const CONFIG_NAME = "arak.config.yaml";

/**
 * โปรเจกต์นี้ใช้ Arak อยู่หรือเปล่า
 * ถ้าไม่มีไฟล์ตั้งค่า แปลว่าเจ้าของยังไม่ได้เลือกใช้ ฮุกต้องเงียบสนิท
 */
export function isArakProject(root) {
  return existsSync(join(root, CONFIG_NAME));
}

/**
 * หาไฟล์ตั้งค่าที่ใกล้ที่สุดโดยไล่ขึ้นจากไฟล์ที่เพิ่งถูกแก้
 *
 * โครงแบบ monorepo วางสคีมาไว้ที่ `apps/api/` แล้วเปิด Claude Code ที่รากเสมอ
 * ถ้าดูแต่ราก ฮุกจะเงียบตลอดกาลกับโปรเจกต์ส่วนใหญ่ที่มีอยู่จริง
 * คืน null เมื่อไม่เจอภายในขอบเขตของ cwd
 */
export function findProjectRoot(filePath, cwd) {
  const boundary = resolve(cwd);
  let dir = resolve(dirname(filePath));

  while (dir.startsWith(boundary)) {
    if (existsSync(join(dir, CONFIG_NAME))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return existsSync(join(boundary, CONFIG_NAME)) ? boundary : null;
}

/**
 * ตอนเปิดเซสชันยังไม่มีไฟล์ให้ยึด จึงมองจาก cwd ลงไปตื้น ๆ
 * เจอมากกว่าหนึ่งชุดแล้วเดาไม่ได้ว่าอันไหน จึงคืนทั้งหมดให้ผู้เรียกตัดสิน
 */
export function discoverProjectRoots(cwd, maxDepth = 3) {
  const found = [];
  const skip = new Set(["node_modules", "dist", "build", ".git", ".scratch", "coverage"]);

  const walk = (dir, depth) => {
    if (existsSync(join(dir, CONFIG_NAME))) found.push(dir);
    if (depth >= maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || skip.has(entry)) continue;
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1);
      } catch {
        /* ข้ามไฟล์ที่อ่านไม่ได้ */
      }
    }
  };

  walk(resolve(cwd), 0);
  return found;
}

/** แปลงพาธให้อยู่ในรูปเดียวกับที่แคตตาล็อกเก็บไว้ */
export function toRepoPath(root, filePath) {
  return relative(root, filePath).split(sep).join("/");
}

export async function loadArak() {
  return import("@arak/cli/project");
}

/** รายการวัตถุประสงค์ในรูปแบบที่อ่านแล้วเลือกได้ทันที */
export function describePurposes(catalog) {
  if (catalog.purposes.length === 0) {
    return "  (ยังไม่มีวัตถุประสงค์ในแคตตาล็อกเลย — ต้องให้เจ้าของระบบเพิ่มก่อน)";
  }
  return catalog.purposes
    .map((p) => `  - ${p.key} — ${p.label} (ฐานทางกฎหมาย: ${p.legalBasis}, เก็บ ${p.retention})`)
    .join("\n");
}
