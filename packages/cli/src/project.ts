import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyCatalog,
  parseCatalog,
  reconcile,
  serializeCatalog,
  type Catalog,
  type FieldChange,
  type Problem,
} from "@arak/core";
import { readPrismaSchemas, SOURCE_KIND, type SchemaInput } from "@arak/prisma";
import { loadConfig, type ArakConfig } from "./config.js";

/**
 * อ่านโปรเจกต์หนึ่งชุดแล้วเทียบกับแคตตาล็อก โดยไม่เขียนอะไรลงดิสก์
 *
 * แยกออกมาจากตัวคำสั่งเพราะทั้ง CLI และฮุกของ Claude Code ต้องใช้ขั้นตอนเดียวกันเป๊ะ
 * ถ้าปล่อยให้มีสองชุด วันหนึ่งฮุกจะรายงานคนละอย่างกับ `arak status` แล้วไม่มีใครเชื่อทั้งคู่
 */
export interface ProjectRun {
  catalog: Catalog;
  problems: Problem[];
  changes: FieldChange[];
  /** ข้อความแคตตาล็อกหลังปรับแล้ว ยังไม่ได้เขียนลงไฟล์ */
  nextText: string;
  previousText: string | undefined;
  catalogPath: string;
  config: ArakConfig;
}

export class ProjectError extends Error {}

export interface LoadOptions {
  today: string;
  useHeuristic?: boolean;
}

export function loadProject(root: string, options: LoadOptions): ProjectRun {
  const config = loadConfig(root);
  const catalogPath = join(root, config.catalog);

  if (config.sources.prisma.length === 0) {
    throw new ProjectError("ไม่พบสคีมา Prisma เลย");
  }

  const inputs: SchemaInput[] = [];
  for (const file of config.sources.prisma) {
    const full = join(root, file);
    try {
      inputs.push({ file, text: readFileSync(full, "utf8") });
    } catch {
      throw new ProjectError(`อ่านไฟล์ไม่ได้: ${file}`);
    }
  }

  const read = readPrismaSchemas(inputs);

  let previousText: string | undefined;
  let existing: Catalog = emptyCatalog();
  const problems: Problem[] = [...read.problems];

  if (existsSync(catalogPath)) {
    previousText = readFileSync(catalogPath, "utf8");
    const loaded = parseCatalog(previousText);
    existing = loaded.catalog;
    problems.push(...loaded.problems);
  }

  const result = reconcile(existing, read.fields, {
    today: options.today,
    scannedKinds: [SOURCE_KIND],
    useHeuristic: options.useHeuristic ?? true,
  });
  problems.push(...result.problems);

  return {
    catalog: result.catalog,
    problems,
    changes: result.changes,
    nextText: serializeCatalog(result.catalog, previousText),
    previousText,
    catalogPath,
    config,
  };
}

/** วันนี้ในรูปแบบ YYYY-MM-DD ตามเวลาเครื่อง */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
