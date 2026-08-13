#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  emptyCatalog,
  isSensitiveCategory,
  parseCatalog,
  reconcile,
  serializeCatalog,
  starterCatalog,
  summarize,
  type Catalog,
  type CatalogField,
  type Problem,
} from "@arak/core";
import { readPrismaSchemas, SOURCE_KIND, type SchemaInput } from "@arak/prisma";
import {
  CONFIG_FILE,
  defaultConfig,
  discoverPrismaSchemas,
  loadConfig,
  serializeConfig,
  type ArakConfig,
} from "./config.js";
import { collectFiles, scanFiles } from "./scan.js";
import { blue, bold, capped, dim, green, heading, pad, red, yellow } from "./ui.js";

const VERSION = "0.1.0";

interface Flags {
  root: string;
  check: boolean;
  force: boolean;
  json: boolean;
  heuristic: boolean;
  minConfidence: number;
  /** พาธที่ระบุมาตรง ๆ สำหรับคำสั่ง scan */
  paths: string[];
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    root: process.cwd(),
    check: false,
    force: false,
    json: false,
    heuristic: true,
    minConfidence: 0.7,
    paths: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--root": {
        const value = argv[i + 1];
        if (value === undefined) fail("--root ต้องตามด้วยพาธ");
        flags.root = isAbsolute(value) ? value : resolve(process.cwd(), value);
        i += 1;
        break;
      }
      case "--check":
        flags.check = true;
        break;
      case "--force":
        flags.force = true;
        break;
      case "--json":
        flags.json = true;
        break;
      case "--no-heuristic":
        flags.heuristic = false;
        break;
      case "--min-confidence": {
        const value = Number(argv[i + 1]);
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          fail("--min-confidence ต้องเป็นตัวเลขระหว่าง 0 ถึง 1");
        }
        flags.minConfidence = value;
        i += 1;
        break;
      }
      default:
        if (arg === undefined) break;
        if (arg.startsWith("-")) fail(`ไม่รู้จักตัวเลือก ${arg}`);
        flags.paths.push(arg);
    }
  }
  return flags;
}

function fail(message: string): never {
  process.stderr.write(`${red("arak:")} ${message}\n`);
  process.exit(2);
}

const HELP = `${bold("arak")} — มาร์กข้อมูลส่วนบุคคลตั้งแต่ตอนเขียนโค้ด

การใช้งาน
  arak init            สร้าง ${CONFIG_FILE} และแคตตาล็อกตั้งต้น
  arak sync            อ่านซอร์ส แล้วปรับแคตตาล็อกให้ตรง
  arak status          รายงานสถานะโดยไม่แก้ไฟล์ (ใช้เป็นด่านใน CI)
  arak scan [paths]    หาข้อมูลส่วนบุคคลของจริงที่ปนอยู่ในไฟล์ เช่น seed หรือ fixture

ตัวเลือก
  --root <path>        รากโปรเจกต์ (ค่าเริ่มต้นคือโฟลเดอร์ปัจจุบัน)
  --check              ใช้กับ sync — ไม่เขียนไฟล์ ถ้ามีอะไรต้องเปลี่ยนจะคืนค่า 1
  --no-heuristic       ให้แคตตาล็อกมีเฉพาะสิ่งที่คนมาร์กเอง ไม่ต้องเดา
  --min-confidence <n> ใช้กับ scan — เกณฑ์ความเชื่อมั่น 0 ถึง 1 (ค่าเริ่มต้น 0.7)
  --json               พิมพ์ผลเป็น JSON
  --force              ใช้กับ init — เขียนทับไฟล์เดิม

รหัสจบการทำงาน
  0  ผ่าน
  1  มีฟิลด์ที่ยังไม่ได้ตัดสิน มีข้อผิดพลาดในแคตตาล็อก หรือ scan เจอข้อมูลจริง
  2  เรียกใช้ผิด หรืออ่านไฟล์ไม่ได้

หมายเหตุ  scan จะไม่พิมพ์ค่าจริงออกมาเด็ดขาด แสดงเฉพาะค่าที่ปิดบังแล้ว
          เพราะ log ของ CI อยู่นานกว่าไฟล์ที่ถูกสแกนเสียอีก
`;

function main(): void {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "help";
  const flags = parseFlags(argv.slice(1));

  switch (command) {
    case "init":
      return commandInit(flags);
    case "sync":
      return commandSync(flags, false);
    case "status":
      return commandSync(flags, true);
    case "scan":
      return commandScan(flags);
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return;
    case "--version":
    case "-v":
      process.stdout.write(`${VERSION}\n`);
      return;
    default:
      fail(`ไม่รู้จักคำสั่ง "${command}" — ลอง arak help`);
  }
}

function commandInit(flags: Flags): void {
  const configPath = join(flags.root, CONFIG_FILE);
  const discovered = discoverPrismaSchemas(flags.root);
  const config = defaultConfig(discovered);
  const catalogPath = join(flags.root, config.catalog);

  if (existsSync(configPath) && !flags.force) {
    fail(`${CONFIG_FILE} มีอยู่แล้ว — ใช้ --force ถ้าต้องการเขียนทับ`);
  }
  if (existsSync(catalogPath) && !flags.force) {
    fail(`${config.catalog} มีอยู่แล้ว — ใช้ --force ถ้าต้องการเขียนทับ`);
  }

  writeFileSync(configPath, serializeConfig(config), "utf8");
  writeFileSync(
    catalogPath,
    serializeCatalog(starterCatalog(basename(flags.root))),
    "utf8",
  );

  process.stdout.write(`${green("สร้างแล้ว")} ${CONFIG_FILE}\n`);
  process.stdout.write(`${green("สร้างแล้ว")} ${config.catalog}\n`);
  if (discovered.length === 0) {
    process.stdout.write(
      `${yellow("ยังไม่พบไฟล์ .prisma")} — เติมพาธเองใน ${CONFIG_FILE} แล้วรัน arak sync\n`,
    );
  } else {
    process.stdout.write(`${dim("พบสคีมา")} ${discovered.length} ไฟล์\n`);
    process.stdout.write(`\nรันต่อ: ${bold("arak sync")}\n`);
  }
}

interface RunResult {
  catalog: Catalog;
  problems: Problem[];
  changes: ReturnType<typeof reconcile>["changes"];
  nextText: string;
  previousText: string | undefined;
  catalogPath: string;
  config: ArakConfig;
}

function run(flags: Flags): RunResult {
  const config = loadConfig(flags.root);
  const catalogPath = join(flags.root, config.catalog);

  if (config.sources.prisma.length === 0) {
    fail(`ไม่พบสคีมา Prisma เลย — ระบุพาธใน ${CONFIG_FILE} หรือรัน arak init ก่อน`);
  }

  const inputs: SchemaInput[] = [];
  for (const file of config.sources.prisma) {
    const full = join(flags.root, file);
    try {
      inputs.push({ file, text: readFileSync(full, "utf8") });
    } catch {
      fail(`อ่านไฟล์ไม่ได้: ${file}`);
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
    today: new Date().toISOString().slice(0, 10),
    scannedKinds: [SOURCE_KIND],
    useHeuristic: flags.heuristic,
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

function commandSync(flags: Flags, readOnly: boolean): void {
  const result = run(flags);
  const summary = summarize(result.catalog);
  const errors = result.problems.filter((p) => p.level === "error");
  const warnings = result.problems.filter((p) => p.level === "warning");
  const changed = result.nextText !== result.previousText;

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        { summary, changes: result.changes, problems: result.problems, changed },
        null,
        2,
      )}\n`,
    );
  }

  if (!readOnly && !flags.check && changed) {
    writeFileSync(result.catalogPath, result.nextText, "utf8");
  }

  if (!flags.json) {
    report(result, summary, errors, warnings, changed, readOnly, flags);
  }

  if (errors.length > 0) process.exit(1);
  if (readOnly && summary.unmarked > 0) process.exit(1);
  if (flags.check && changed) process.exit(1);
  process.exit(0);
}

function report(
  result: RunResult,
  summary: ReturnType<typeof summarize>,
  errors: Problem[],
  warnings: Problem[],
  changed: boolean,
  readOnly: boolean,
  flags: Flags,
): void {
  const out = process.stdout;

  out.write(
    `${dim("สคีมา")} ${result.config.sources.prisma.length} ไฟล์  ${dim("แคตตาล็อก")} ${result.config.catalog}\n`,
  );

  if (result.changes.length > 0) {
    out.write(heading("สิ่งที่เปลี่ยน"));
    out.write("\n");
    for (const line of capped(result.changes, 15, (c) => {
      const label =
        c.kind === "added"
          ? green("เพิ่ม  ")
          : c.kind === "orphaned"
            ? yellow("หายไป ")
            : c.kind === "marked"
              ? green("มาร์ก ")
              : blue(pad(c.kind, 6));
      return `  ${label} ${c.id}${c.detail ? dim(`  ${c.detail}`) : ""}`;
    })) {
      out.write(`${line}\n`);
    }
  }

  const unmarked = result.catalog.fields.filter((f) => f.status === "unmarked" && !f.orphaned);
  if (unmarked.length > 0) {
    out.write(heading("ยังไม่ได้ตัดสิน"));
    out.write(dim("  เติม /// @pii(...) หรือ /// @not-pii(reason=...) ไว้เหนือฟิลด์\n"));
    for (const line of capped(unmarked, 15, (f: CatalogField) => {
      const where = `${f.source.file}:${f.source.line}`;
      const guess = f.category ? dim(` น่าจะเป็น ${f.category}`) : "";
      return `  ${yellow("?")} ${pad(f.id, 44)} ${dim(where)}${guess}`;
    })) {
      out.write(`${line}\n`);
    }
  }

  if (errors.length > 0) {
    out.write(heading("ข้อผิดพลาด"));
    out.write("\n");
    for (const line of capped(errors, 15, (p) => formatProblem(p, red))) out.write(`${line}\n`);
  }
  if (warnings.length > 0) {
    out.write(heading("คำเตือน"));
    out.write("\n");
    for (const line of capped(warnings, 10, (p) => formatProblem(p, yellow))) {
      out.write(`${line}\n`);
    }
  }

  const sensitive = result.catalog.fields.filter(
    (f) => f.status !== "not-pii" && isSensitiveCategory(f.category),
  );

  out.write(heading("สรุป"));
  out.write("\n");
  out.write(`  ${pad("มาร์กแล้ว", 22)} ${green(String(summary.marked))}\n`);
  out.write(
    `  ${pad("ยังไม่ได้ตัดสิน", 20)} ${summary.unmarked > 0 ? yellow(String(summary.unmarked)) : String(summary.unmarked)}\n`,
  );
  out.write(`  ${pad("ระบุว่าไม่ใช่", 21)} ${String(summary.notPii)}\n`);
  if (sensitive.length > 0) {
    out.write(`  ${pad("ข้อมูลอ่อนไหว ม.26", 18)} ${red(String(sensitive.length))}\n`);
  }
  if (summary.orphaned > 0) {
    out.write(`  ${pad("หายไปจากซอร์ส", 21)} ${yellow(String(summary.orphaned))}\n`);
  }

  out.write("\n");
  if (readOnly) {
    out.write(
      summary.unmarked > 0
        ? `${yellow("ยังไม่ผ่าน")} — เหลือ ${summary.unmarked} ฟิลด์ที่ยังไม่ได้ตัดสิน\n`
        : `${green("ผ่าน")} — ทุกฟิลด์ถูกตัดสินแล้ว\n`,
    );
  } else if (flags.check) {
    out.write(
      changed
        ? `${yellow("แคตตาล็อกไม่ตรงกับซอร์ส")} — รัน arak sync แล้ว commit ผลลัพธ์\n`
        : `${green("แคตตาล็อกตรงกับซอร์สแล้ว")}\n`,
    );
  } else if (changed) {
    out.write(`${green("เขียนแล้ว")} ${result.config.catalog}\n`);
  } else {
    out.write(`${dim("ไม่มีอะไรเปลี่ยน")}\n`);
  }
}

function commandScan(flags: Flags): void {
  const files = collectFiles(flags.root, flags.paths);
  const { findings, scanned, skipped } = scanFiles(flags.root, files, flags.minConfidence);

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          scanned,
          skipped,
          findings: findings.map((f) => ({
            file: f.file,
            line: f.line,
            column: f.column,
            type: f.match.type,
            category: f.match.category,
            confidence: f.match.confidence,
            preview: f.preview,
          })),
        },
        null,
        2,
      )}\n`,
    );
    process.exit(findings.length > 0 ? 1 : 0);
  }

  const out = process.stdout;
  out.write(`${dim("สแกน")} ${scanned} ไฟล์  ${dim("เกณฑ์ความเชื่อมั่น")} ${flags.minConfidence}\n`);

  for (const file of skipped) {
    out.write(`${yellow("อ่านไม่ได้")} ${file}\n`);
  }

  if (findings.length === 0) {
    out.write(`\n${green("ไม่พบข้อมูลส่วนบุคคลในไฟล์ที่สแกน")}\n`);
    process.exit(0);
  }

  const byType = new Map<string, number>();
  for (const f of findings) byType.set(f.match.type, (byType.get(f.match.type) ?? 0) + 1);

  out.write(heading("ที่พบ"));
  out.write("\n");
  for (const line of capped(findings, 30, (f) => {
    const where = `${f.file}:${f.line}:${f.column}`;
    return `  ${red(pad(f.match.type, 20))} ${pad(f.preview, 16)} ${dim(where)}`;
  })) {
    out.write(`${line}\n`);
  }

  out.write(heading("สรุป"));
  out.write("\n");
  for (const [type, count] of [...byType].sort((a, b) => b[1] - a[1])) {
    out.write(`  ${pad(type, 22)} ${String(count)}\n`);
  }
  out.write(`\n${red("พบข้อมูลจริงในไฟล์")} ${findings.length} จุด — ย้ายออกหรือแทนด้วยข้อมูลสมมติ\n`);
  process.exit(1);
}

function formatProblem(problem: Problem, color: (s: string) => string): string {
  const where =
    problem.file !== undefined ? dim(` ${problem.file}:${problem.line ?? 0}`) : "";
  return `  ${color("×")} ${problem.id}${where}\n    ${problem.message}`;
}

main();
