import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { detect, type Match } from "@arak/detect-th";
import { globToRegExp } from "./config.js";

/** ไฟล์ข้อมูลที่คนมักลืมว่ามีของจริงอยู่ข้างใน */
const SCANNABLE = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".sql",
  ".csv",
  ".tsv",
  ".yaml",
  ".yml",
  ".md",
  ".txt",
  ".log",
  ".env",
  ".http",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "vendor",
]);

/** ไฟล์ใหญ่กว่านี้ข้ามไป — เกือบทั้งหมดเป็นไฟล์ที่เครื่องสร้าง ไม่ใช่ข้อมูลที่คนใส่ */
const MAX_BYTES = 2_000_000;
const MAX_DEPTH = 8;

export interface Finding {
  file: string;
  line: number;
  column: number;
  match: Match;
  /** ค่าที่ปิดบังแล้ว ปลอดภัยพอจะพิมพ์ลง log ของ CI */
  preview: string;
}

/**
 * ปิดบังค่าให้เหลือแค่หัวกับท้าย
 *
 * เครื่องมือที่ไล่จับข้อมูลส่วนบุคคลแล้วพิมพ์ค่าจริงออกมาทาง log ของ CI
 * คือช่องรั่วเสียเอง — log ของ CI เก็บนานกว่าไฟล์ที่ถูกสแกนเสียอีก
 */
export function maskValue(value: string): string {
  const visible = value.length <= 6 ? 1 : 2;
  if (value.length <= visible * 2) return "•".repeat(value.length);
  return `${value.slice(0, visible)}${"•".repeat(Math.min(8, value.length - visible * 2))}${value.slice(-visible)}`;
}

function positionOf(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < offset; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      lastBreak = i;
    }
  }
  return { line, column: offset - lastBreak };
}

export function scanText(text: string, file: string, minConfidence: number): Finding[] {
  return detect(text, { minConfidence }).map((match) => {
    const { line, column } = positionOf(text, match.start);
    return { file, line, column, match, preview: maskValue(match.value) };
  });
}

const toPosix = (path: string): string => path.split(sep).join("/");

/** ไล่โฟลเดอร์เก็บเฉพาะไฟล์ที่ควรสแกน คืนพาธสัมพัทธ์กับ `root` */
function walkDir(root: string, dir: string, depth: number, found: string[]): void {
  if (depth > MAX_DEPTH) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(".") && entry !== ".env") continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walkDir(root, full, depth + 1, found);
      continue;
    }
    if (stat.size > MAX_BYTES) continue;
    const dot = entry.lastIndexOf(".");
    const ext = dot === -1 ? "" : entry.slice(dot);
    if (!SCANNABLE.has(ext)) continue;
    found.push(toPosix(relative(root, full)));
  }
}

export interface Collected {
  files: string[];
  /**
   * พาธที่ผู้ใช้สั่งมาแต่ชี้ไปที่ไม่มีอะไรอยู่
   *
   * ต้องแยกออกมาเพราะการเงียบแล้วบอกว่า "ไม่พบข้อมูลส่วนบุคคล" ทั้งที่ไม่ได้อ่านอะไรเลย
   * คือคำตอบที่ผิดชนิดที่อันตรายที่สุดของเครื่องมือแบบนี้ — ด่าน CI จะเขียวตลอดกาล
   */
  unresolved: string[];
}

/**
 * หาไฟล์ที่จะสแกน
 *
 * ไม่ระบุพาธ = ไล่ทั้งโปรเจกต์ · ระบุพาธได้ทั้งไฟล์ โฟลเดอร์ และ glob
 * ไฟล์ที่ระบุมาตรง ๆ จะถูกสแกนแม้นามสกุลจะไม่อยู่ในรายการปกติ เพราะผู้ใช้สั่งมาเอง
 */
export function collectFiles(root: string, explicit: string[]): Collected {
  if (explicit.length === 0) {
    const found: string[] = [];
    walkDir(root, root, 0, found);
    return { files: found.sort(), unresolved: [] };
  }

  const files = new Set<string>();
  const unresolved: string[] = [];
  let tree: string[] | undefined;

  for (const raw of explicit) {
    const pattern = toPosix(raw);

    if (/[*?]/.test(pattern)) {
      tree ??= (() => {
        const found: string[] = [];
        walkDir(root, root, 0, found);
        return found.sort();
      })();
      const re = globToRegExp(pattern);
      const hits = tree.filter((file) => re.test(file));
      if (hits.length === 0) unresolved.push(raw);
      for (const hit of hits) files.add(hit);
      continue;
    }

    const full = join(root, pattern);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      unresolved.push(raw);
      continue;
    }

    if (stat.isDirectory()) {
      const found: string[] = [];
      walkDir(root, full, 0, found);
      if (found.length === 0) unresolved.push(raw);
      for (const file of found) files.add(file);
      continue;
    }

    files.add(toPosix(relative(root, full)));
  }

  return { files: [...files].sort(), unresolved };
}

export function scanFiles(
  root: string,
  files: string[],
  minConfidence: number,
): { findings: Finding[]; scanned: number; skipped: string[] } {
  const findings: Finding[] = [];
  const skipped: string[] = [];
  let scanned = 0;

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      skipped.push(file);
      continue;
    }
    scanned += 1;
    findings.push(...scanText(text, file, minConfidence));
  }

  return { findings, scanned, skipped };
}
