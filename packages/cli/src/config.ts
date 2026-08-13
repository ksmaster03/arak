import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";

export interface ArakConfig {
  /** พาธของแคตตาล็อก สัมพัทธ์กับรากโปรเจกต์ */
  catalog: string;
  sources: {
    prisma: string[];
  };
}

export const CONFIG_FILE = "arak.config.yaml";
export const DEFAULT_CATALOG = "pii-catalog.yaml";

/** โฟลเดอร์ที่ไม่มีวันมีสคีมาต้นฉบับอยู่ข้างใน */
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
  "generated",
  "migrations",
  "vendor",
  "tmp",
]);

const MAX_DEPTH = 6;

export function defaultConfig(prismaFiles: string[]): ArakConfig {
  return { catalog: DEFAULT_CATALOG, sources: { prisma: prismaFiles } };
}

export function loadConfig(root: string): ArakConfig {
  const path = join(root, CONFIG_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return defaultConfig(discoverPrismaSchemas(root));
  }

  const raw: unknown = parseYaml(text);
  const obj = (raw ?? {}) as Record<string, unknown>;
  const sources = (obj["sources"] ?? {}) as Record<string, unknown>;
  const prisma = Array.isArray(sources["prisma"]) ? sources["prisma"].map(String) : [];

  return {
    catalog: typeof obj["catalog"] === "string" ? obj["catalog"] : DEFAULT_CATALOG,
    sources: { prisma: prisma.length > 0 ? prisma : discoverPrismaSchemas(root) },
  };
}

/**
 * หาไฟล์ .prisma ในโปรเจกต์
 *
 * ข้ามโฟลเดอร์ `generated` โดยตั้งใจ เพราะ Prisma คัดลอกสคีมาไปไว้ที่นั่นตอน generate
 * ถ้านับด้วยจะได้ฟิลด์ซ้ำสองชุดและคนอ่านรายงานจะงงว่าทำไมจำนวนเป็นสองเท่า
 */
export function discoverPrismaSchemas(root: string): string[] {
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
      if (entry.startsWith(".") && entry !== ".") continue;
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (SKIP_DIRS.has(entry)) continue;
        walk(full, depth + 1);
      } else if (entry.endsWith(".prisma")) {
        found.push(relative(root, full).split(sep).join("/"));
      }
    }
  };

  walk(root, 0);
  return found.sort();
}

export function serializeConfig(config: ArakConfig): string {
  const lines = [
    "# ตั้งค่า Arak",
    "#",
    "# catalog — ไฟล์แคตตาล็อกข้อมูลส่วนบุคคลของโปรเจกต์นี้",
    "# sources — บอกว่าให้ไปอ่านความจริงจากที่ไหนบ้าง",
    "",
    `catalog: ${config.catalog}`,
    "",
    "sources:",
    "  prisma:",
  ];
  if (config.sources.prisma.length === 0) {
    lines.push("    [] # ยังไม่พบไฟล์ .prisma — ใส่พาธเองได้");
  } else {
    for (const file of config.sources.prisma) lines.push(`    - ${file}`);
  }
  return `${lines.join("\n")}\n`;
}
