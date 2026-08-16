#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  applyBaseline,
  exportFideslang,
  isSensitiveCategory,
  serializeCatalog,
  starterCatalog,
  summarize,
  type CatalogField,
  type Problem,
} from "@arak/core";
import {
  CONFIG_FILE,
  defaultConfig,
  discoverPrismaSchemas,
  loadConfig,
  matchesAny,
  serializeConfig,
} from "./config.js";
import { loadProject, ProjectError, today, type ProjectRun } from "./project.js";
import { buildRopa } from "./ropa.js";
import { scanToSarif, statusToSarif } from "./sarif.js";
import { collectFiles, scanFiles } from "./scan.js";
import { buildSemgrep } from "./semgrep.js";
import { blue, bold, capped, dim, green, heading, pad, red, yellow } from "./ui.js";
import { buildXlsx } from "./xlsx.js";

const VERSION = "0.1.0";

const FORMATS = ["text", "json", "sarif", "fideslang", "semgrep"] as const;
type Format = (typeof FORMATS)[number];

interface Flags {
  root: string;
  check: boolean;
  force: boolean;
  json: boolean;
  heuristic: boolean;
  minConfidence: number;
  /** พาธที่ระบุมาตรง ๆ สำหรับคำสั่ง scan */
  paths: string[];
  /** รูปแบบไฟล์ที่ scan ต้องข้าม เพิ่มจากที่ตั้งไว้ในไฟล์ตั้งค่า */
  ignore: string[];
  /** ให้ status นับหนี้เก่าเป็นความล้มเหลวด้วย */
  strict: boolean;
  /** รูปแบบผลลัพธ์ */
  format: Format;
  /** ไฟล์ปลายทาง — ถ้าไม่ระบุจะพิมพ์ออก stdout ยกเว้นผลลัพธ์ที่เป็นไบนารี */
  out?: string;
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
    ignore: [],
    strict: false,
    format: "text",
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
        flags.format = "json";
        break;
      case "--format": {
        const value = argv[i + 1];
        if (value === undefined) fail(`--format ต้องตามด้วยหนึ่งใน ${FORMATS.join(" ")}`);
        if (!(FORMATS as readonly string[]).includes(value)) {
          fail(`ไม่รู้จักรูปแบบ "${value}" — เลือกจาก ${FORMATS.join(" ")}`);
        }
        flags.format = value as Format;
        if (value === "json") flags.json = true;
        i += 1;
        break;
      }
      case "--out": {
        const value = argv[i + 1];
        if (value === undefined) fail("--out ต้องตามด้วยพาธไฟล์");
        flags.out = isAbsolute(value) ? value : resolve(process.cwd(), value);
        i += 1;
        break;
      }
      case "--no-heuristic":
        flags.heuristic = false;
        break;
      case "--strict":
        flags.strict = true;
        break;
      case "--ignore": {
        const value = argv[i + 1];
        if (value === undefined) fail("--ignore ต้องตามด้วยรูปแบบพาธ");
        flags.ignore.push(value);
        i += 1;
        break;
      }
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
  arak baseline        ยกฟิลด์ที่ยังไม่ตัดสินทั้งหมดไปเป็นหนี้เก่า เพื่อเริ่มนับจากศูนย์
  arak scan [paths]    หาข้อมูลส่วนบุคคลของจริงที่ปนอยู่ในไฟล์ เช่น seed หรือ fixture
  arak ropa            ออกบันทึกรายการกิจกรรมการประมวลผลตามมาตรา 39 เป็น .xlsx
  arak semgrep         สร้างกฎ Semgrep จากแคตตาล็อก เพื่อจับข้อมูลที่ไหลออกไป log
  arak export          ส่งแคตตาล็อกออกเป็นรูปแบบที่เครื่องมืออื่นอ่านได้

ตัวเลือก
  --root <path>        รากโปรเจกต์ (ค่าเริ่มต้นคือโฟลเดอร์ปัจจุบัน)
  --check              ใช้กับ sync — ไม่เขียนไฟล์ ถ้ามีอะไรต้องเปลี่ยนจะคืนค่า 1
  --no-heuristic       ให้แคตตาล็อกมีเฉพาะสิ่งที่คนมาร์กเอง ไม่ต้องเดา
  --strict             ใช้กับ status — ให้หนี้เก่าทำให้ตกด้วย
  --min-confidence <n> ใช้กับ scan — เกณฑ์ความเชื่อมั่น 0 ถึง 1 (ค่าเริ่มต้น 0.7)
  --ignore <glob>      ใช้กับ scan — ข้ามไฟล์ที่ตรงรูปแบบ ใส่ซ้ำได้
  --format <fmt>       text (ค่าเริ่มต้น) · json · sarif · fideslang · semgrep
  --out <path>         เขียนผลลงไฟล์แทนการพิมพ์ออกจอ
  --json               ทางลัดของ --format json
  --force              ใช้กับ init — เขียนทับไฟล์เดิม

รูปแบบผลลัพธ์
  sarif      ใช้กับ status และ scan — อัปเข้า GitHub ด้วย codeql-action/upload-sarif
             แล้วผลจะไปโผล่เป็นคอมเมนต์ในบรรทัดที่มีปัญหาใน pull request
  fideslang  ใช้กับ export — อนุกรมวิธานกลางของ ethyca/fideslang (CC BY 4.0)
             ทำให้แคตตาล็อกไหลเข้า Fides, DataHub และ OpenMetadata ได้

รหัสจบการทำงาน
  0  ผ่าน
  1  มีฟิลด์ที่ยังไม่ได้ตัดสิน มีข้อผิดพลาดในแคตตาล็อก หรือ scan เจอข้อมูลจริง
  2  เรียกใช้ผิด หรืออ่านไฟล์ไม่ได้

หมายเหตุ  scan จะไม่พิมพ์ค่าจริงออกมาเด็ดขาด แสดงเฉพาะค่าที่ปิดบังแล้ว
          เพราะ log ของ CI อยู่นานกว่าไฟล์ที่ถูกสแกนเสียอีก
          ข้อบังคับเดียวกันนี้ใช้กับผลลัพธ์ SARIF ด้วย
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
    case "baseline":
      return commandBaseline(flags);
    case "ropa":
      return commandRopa(flags);
    case "semgrep":
      return commandSemgrep(flags);
    case "export":
      return commandExport(flags);
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

function run(flags: Flags): ProjectRun {
  try {
    return loadProject(flags.root, { today: today(), useHeuristic: flags.heuristic });
  } catch (error) {
    if (error instanceof ProjectError) {
      fail(`${error.message} — ระบุพาธใน ${CONFIG_FILE} หรือรัน arak init ก่อน`);
    }
    throw error;
  }
}

function commandBaseline(flags: Flags): void {
  const result = run(flags);
  const { catalog, moved } = applyBaseline(result.catalog, new Date().toISOString().slice(0, 10));
  const text = serializeCatalog(catalog, result.previousText);
  writeFileSync(result.catalogPath, text, "utf8");

  const out = process.stdout;
  if (moved.length === 0) {
    out.write(`${dim("ไม่มีฟิลด์ที่ต้องยกไปเป็นหนี้เก่า")}
`);
    process.exit(0);
  }

  out.write(`${green("ยกไปเป็นหนี้เก่าแล้ว")} ${moved.length} ฟิลด์
`);
  for (const line of capped(moved, 10, (id) => `  ${dim(id)}`)) out.write(`${line}
`);
  out.write(
    `
ตั้งแต่นี้ไป ฮุกจะเตือนเฉพาะฟิลด์ที่เขียนใหม่
` +
      `${dim("ของเก่ายังอยู่ในแคตตาล็อกและยังนับเป็นหนี้ — ดูด้วย arak status")}
`,
  );
  process.exit(0);
}

function commandSync(flags: Flags, readOnly: boolean): void {
  const result = run(flags);
  const summary = summarize(result.catalog);
  const errors = result.problems.filter((p) => p.level === "error");
  const warnings = result.problems.filter((p) => p.level === "warning");
  const changed = result.nextText !== result.previousText;

  if (flags.format === "sarif") {
    emit(statusToSarif(result.catalog.fields, result.problems, VERSION), flags);
  } else if (flags.format === "json") {
    emit(
      `${JSON.stringify(
        { summary, changes: result.changes, problems: result.problems, changed },
        null,
        2,
      )}\n`,
      flags,
    );
  }

  if (!readOnly && !flags.check && changed) {
    writeFileSync(result.catalogPath, result.nextText, "utf8");
  }

  if (flags.format === "text") {
    report(result, summary, errors, warnings, changed, readOnly, flags);
  }

  if (errors.length > 0) process.exit(1);
  if (readOnly && summary.unmarked > 0) process.exit(1);
  if (readOnly && flags.strict && summary.deferred > 0) process.exit(1);
  if (flags.check && changed) process.exit(1);
  process.exit(0);
}

function report(
  result: ProjectRun,
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
  if (summary.deferred > 0) {
    out.write(`  ${pad("หนี้เก่าที่พักไว้", 19)} ${blue(String(summary.deferred))}\n`);
  }
  out.write(`  ${pad("ระบุว่าไม่ใช่", 21)} ${String(summary.notPii)}\n`);
  if (sensitive.length > 0) {
    out.write(`  ${pad("ข้อมูลอ่อนไหว ม.26", 18)} ${red(String(sensitive.length))}\n`);
  }
  if (summary.orphaned > 0) {
    out.write(`  ${pad("หายไปจากซอร์ส", 21)} ${yellow(String(summary.orphaned))}\n`);
  }

  out.write("\n");
  if (readOnly) {
    if (summary.unmarked > 0) {
      out.write(`${yellow("ยังไม่ผ่าน")} — เหลือ ${summary.unmarked} ฟิลด์ใหม่ที่ยังไม่ได้ตัดสิน\n`);
    } else if (flags.strict && summary.deferred > 0) {
      out.write(`${yellow("ยังไม่ผ่าน")} — โหมดเข้ม เหลือหนี้เก่า ${summary.deferred} ฟิลด์\n`);
    } else if (summary.deferred > 0) {
      out.write(
        `${green("ผ่าน")} — ของใหม่ตัดสินครบ ` +
          `${dim(`(ยังมีหนี้เก่าค้างอยู่ ${summary.deferred} ฟิลด์ — ดูด้วย arak status --strict)`)}\n`,
      );
    } else {
      out.write(`${green("ผ่าน")} — ทุกฟิลด์ถูกตัดสินแล้ว\n`);
    }
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
  const ignore = [...loadConfig(flags.root).scan.ignore, ...flags.ignore];
  const collected = collectFiles(flags.root, flags.paths);

  // พาธที่สั่งมาแล้วไม่มีอยู่จริงคือการเรียกใช้ผิด ไม่ใช่ผลลัพธ์ "สะอาด"
  // ถ้าปล่อยผ่านเป็นรหัส 0 ด่าน CI ที่เขียน `arak scan src/` ผิดพาธจะเขียวตลอดไป
  if (collected.unresolved.length > 0) {
    fail(`ไม่มีไฟล์ให้สแกนที่ ${collected.unresolved.join(", ")}`);
  }

  const all = collected.files;
  const files = all.filter((file) => !matchesAny(file, ignore));
  const ignored = all.length - files.length;
  const { findings, scanned, skipped } = scanFiles(flags.root, files, flags.minConfidence);

  if (flags.format === "sarif") {
    emit(scanToSarif(findings, VERSION), flags);
    process.exit(findings.length > 0 ? 1 : 0);
  }

  if (flags.format === "json") {
    emit(
      `${JSON.stringify(
        {
          scanned,
          ignored,
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
      flags,
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

/**
 * ส่งผลลัพธ์ที่เป็นข้อความออกไป
 *
 * ข้อความยืนยันไปทาง stderr เสมอ เพื่อให้ `arak status --format sarif > out.sarif`
 * ได้ไฟล์ที่ parse ได้จริง ไม่ใช่ไฟล์ที่มีบรรทัดภาษาคนปนอยู่ข้างบน
 */
function emit(text: string, flags: Flags): void {
  if (flags.out === undefined) {
    process.stdout.write(text);
    return;
  }
  writeFileSync(flags.out, text, "utf8");
  process.stderr.write(`${green("เขียนแล้ว")} ${flags.out}\n`);
}

function commandRopa(flags: Flags): void {
  const result = run(flags);
  const generatedOn = today();
  const ropa = buildRopa(result.catalog, generatedOn);
  const target = flags.out ?? join(flags.root, "arak-ropa.xlsx");

  writeFileSync(target, buildXlsx(ropa.sheets));

  const out = process.stdout;
  out.write(`${green("เขียนแล้ว")} ${target}\n`);
  out.write(
    `${dim("วัตถุประสงค์")} ${ropa.purposes} รายการ  ${dim("ฟิลด์")} ${ropa.fields} รายการ  ${dim("ณ วันที่")} ${generatedOn}\n`,
  );

  if (ropa.purposes === 0) {
    out.write(
      `\n${yellow("ยังไม่มีวัตถุประสงค์ในแคตตาล็อก")} — บันทึกตามมาตรา 39 ยังไม่มีเนื้อหา\n` +
        `${dim("เติม purposes ใน")} ${result.config.catalog} ${dim("ก่อน")}\n`,
    );
    process.exit(1);
  }

  if (ropa.undecided > 0) {
    // เอกสารยังถูกเขียนออกไป เพราะการมีร่างที่บอกตรง ๆ ว่าตรงไหนยังไม่เสร็จ
    // มีประโยชน์กว่าการไม่มีอะไรเลย แต่รหัสจบต้องไม่บอกว่าผ่าน
    out.write(
      `\n${yellow("บันทึกยังไม่ครบ")} — เหลือ ${ropa.undecided} ฟิลด์ที่ยังไม่ถูกตัดสิน\n` +
        `${dim("ฟิลด์เหล่านี้ปรากฏในเอกสารแล้วภายใต้หัวข้อ ยังไม่ได้ผูกกับวัตถุประสงค์ใด")}\n` +
        `${dim("ปิดงานให้ครบด้วย arak status แล้วออกเอกสารใหม่ก่อนนำไปใช้จริง")}\n`,
    );
    process.exit(1);
  }

  out.write(`\n${green("ครบตามมาตรา 39")} — ทุกฟิลด์ถูกตัดสินและผูกกับวัตถุประสงค์แล้ว\n`);
  process.exit(0);
}

function commandSemgrep(flags: Flags): void {
  const result = run(flags);
  const built = buildSemgrep(result.catalog);

  if (built.rules === 0) {
    process.stderr.write(
      `${yellow("ยังไม่มีฟิลด์ที่ตัดสินแล้ว")} — ไม่มีอะไรให้สร้างกฎ ลอง arak status ก่อน\n`,
    );
    process.exit(1);
  }

  emit(built.yaml, flags);

  const note = process.stderr;
  note.write(
    `${dim("สร้างกฎ")} ${built.rules} ข้อ ${dim("ครอบฟิลด์")} ${built.covered} ${dim("รายการ")}\n`,
  );
  if (built.uncovered > 0) {
    note.write(
      `${yellow("ยังไม่มีกฎคุ้ม")} ${built.uncovered} ฟิลด์ที่ยังไม่ถูกตัดสิน — กฎครอบเฉพาะสิ่งที่แคตตาล็อกรู้จัก\n`,
    );
  }
  process.exit(0);
}

function commandExport(flags: Flags): void {
  if (flags.format !== "fideslang") {
    fail("export รองรับ --format fideslang เท่านั้นในตอนนี้");
  }

  const result = run(flags);
  const exported = exportFideslang(result.catalog, { systemName: basename(flags.root) });
  emit(exported.yaml, flags);

  const note = process.stderr;
  if (exported.approximations.length > 0) {
    note.write(
      `${yellow("เทียบได้ไม่ตรง")} ${exported.approximations.length} หมวด — Fideslang เขียนรอบ GDPR ไม่ใช่ ม.26\n`,
    );
    for (const item of exported.approximations) {
      note.write(`  ${dim(pad(item.category, 20))} → ${item.fides}\n    ${dim(item.note)}\n`);
    }
  }
  if (exported.undecided > 0) {
    note.write(
      `${yellow("ไม่ได้ส่งออก")} ${exported.undecided} ฟิลด์ที่ยังไม่ถูกตัดสิน — ` +
        `${dim("ปลายทางจะไม่รู้ว่ามีอยู่ อย่าถือว่าผลนี้ครบ")}\n`,
    );
  }
  process.exit(0);
}

function formatProblem(problem: Problem, color: (s: string) => string): string {
  const where =
    problem.file !== undefined ? dim(` ${problem.file}:${problem.line ?? 0}`) : "";
  return `  ${color("×")} ${problem.id}${where}\n    ${problem.message}`;
}

main();
