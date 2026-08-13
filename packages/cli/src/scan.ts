import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { detect, type Match } from "@arak/detect-th";

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

export function collectFiles(root: string, explicit: string[]): string[] {
  if (explicit.length > 0) {
    return explicit.map((p) => relative(root, join(root, p)).split(sep).join("/"));
  }

  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
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
        walk(full, depth + 1);
        continue;
      }
      if (stat.size > MAX_BYTES) continue;
      const dot = entry.lastIndexOf(".");
      const ext = dot === -1 ? "" : entry.slice(dot);
      if (!SCANNABLE.has(ext)) continue;
      found.push(relative(root, full).split(sep).join("/"));
    }
  };

  walk(root, 0);
  return found.sort();
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
