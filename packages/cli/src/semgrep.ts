import { isSensitiveCategory, type Catalog, type CatalogField } from "@arak/core";

/**
 * สร้างกฎ Semgrep จากแคตตาล็อก
 *
 * แคตตาล็อกรู้อยู่แล้วว่าฟิลด์ไหนเป็นข้อมูลส่วนบุคคล ความรู้ก้อนนั้นมีค่ามากกว่า
 * การเอาไว้ออกรายงาน — มันคือรายชื่อ source ที่พร้อมใช้ทำ taint analysis ทันที
 * ส่วน sink คือที่ที่ข้อมูลไม่ควรไปโผล่ ได้แก่ log, response ที่ส่งออกนอกระบบ
 * และเครื่องมือวิเคราะห์ของบุคคลที่สาม
 *
 * ต้องสร้างจากแคตตาล็อก ไม่ใช่เขียนกฎด้วยมือ เพราะกฎที่เขียนมือจะค้างอยู่กับสคีมา
 * เมื่อวันที่เขียน แล้วเงียบสนิทกับฟิลด์ที่เพิ่มเข้ามาทีหลัง
 *
 * ⚠️ ข้อจำกัดที่ต้องบอกให้ชัด กฎเหล่านี้จับจาก **ชื่อฟิลด์** ไม่ใช่ชนิดของค่า
 * `$X.email` จะตรงกับ property ชื่อ email ของอ็อบเจ็กต์อะไรก็ได้ ไม่ใช่เฉพาะของ Prisma
 * ผลบวกลวงจึงเป็นเรื่องปกติ และควรถูกปิดด้วย `// nosemgrep` พร้อมเหตุผล ไม่ใช่ปิดทั้งกฎ
 */

/**
 * ปลายทางที่ข้อมูลส่วนบุคคลไม่ควรไหลไปถึงโดยไม่ตั้งใจ
 *
 * เลือกเฉพาะที่พบบ่อยจริงและระบุได้แน่ชัด ไม่ใส่อะไรที่ต้องเดา
 * เพราะกฎที่ดังตลอดเวลาคือกฎที่ถูกปิดทิ้งภายในสัปดาห์เดียว
 */
const SINKS: { label: string; patterns: string[] }[] = [
  {
    label: "log ของแอป",
    patterns: [
      "console.log(...)",
      "console.info(...)",
      "console.warn(...)",
      "console.error(...)",
      "console.debug(...)",
      "logger.info(...)",
      "logger.warn(...)",
      "logger.error(...)",
      "logger.debug(...)",
    ],
  },
  {
    label: "คำตอบที่ส่งออกนอกระบบ",
    patterns: ["res.json(...)", "res.send(...)", "reply.send(...)"],
  },
  {
    label: "บริการของบุคคลที่สาม",
    patterns: [
      "analytics.track(...)",
      "mixpanel.track(...)",
      "posthog.capture(...)",
      "Sentry.captureException(...)",
      "Sentry.captureMessage(...)",
      "Sentry.setContext(...)",
    ],
  },
];

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function indent(lines: string[], spaces: number): string[] {
  const pad = " ".repeat(spaces);
  return lines.map((line) => (line === "" ? "" : pad + line));
}

interface Group {
  id: string;
  severity: "ERROR" | "WARNING";
  title: string;
  fields: CatalogField[];
}

function ruleFor(group: Group): string[] {
  // ชื่อฟิลด์ซ้ำได้หลายโมเดล — Semgrep สนใจแค่ชื่อ property จึงต้องยุบให้เหลือชุดเดียว
  const names = [...new Set(group.fields.map((f) => f.source.field))].sort();
  const examples = [...new Set(group.fields.map((f) => f.id))].sort().slice(0, 12);

  const message =
    `${group.title} — ค่าที่มาจากฟิลด์นี้กำลังไหลออกไปยัง log หรือปลายทางภายนอก\n` +
    `ฟิลด์ที่แคตตาล็อกระบุไว้ ${group.fields.length} รายการ เช่น ${examples.slice(0, 4).join(", ")}\n` +
    "ถ้าตั้งใจให้ออกจริง ให้ปิดบังค่าก่อน หรือใส่ // nosemgrep พร้อมเหตุผลกำกับไว้ในโค้ด";

  const lines: string[] = [
    `- id: ${group.id}`,
    "  mode: taint",
    "  languages: [typescript, javascript]",
    `  severity: ${group.severity}`,
    `  message: |`,
    ...indent(message.split("\n"), 4),
    "  metadata:",
    "    category: security",
    "    subcategory: [audit]",
    "    technology: [prisma]",
    "    generated-by: arak",
    `    arak-fields: ${group.fields.length}`,
    `    arak-field-names: ${names.length}`,
    "  pattern-sources:",
  ];

  for (const name of names) {
    lines.push(`    - pattern: $OBJ.${name}`);
    lines.push(`    - pattern: |`);
    lines.push(`        { ..., ${name}: $V, ... }`);
  }

  lines.push("  pattern-sinks:");
  for (const sink of SINKS) {
    for (const pattern of sink.patterns) {
      lines.push(`    - pattern: ${pattern}`);
    }
  }

  lines.push("  pattern-sanitizers:");
  lines.push("    # ค่าที่ผ่านการปิดบังหรือแฮชแล้วไม่ใช่ข้อมูลส่วนบุคคลอีกต่อไป");
  lines.push("    - pattern: mask(...)");
  lines.push("    - pattern: redact(...)");
  lines.push("    - pattern: anonymize(...)");
  lines.push("    - pattern: $X.hash(...)");

  return lines;
}

export interface SemgrepResult {
  yaml: string;
  rules: number;
  /** ฟิลด์ที่มาร์กแล้วและถูกใช้สร้างกฎ */
  covered: number;
  /** ฟิลด์ที่ยังไม่ตัดสิน จึงยังไม่มีกฎคุ้ม */
  uncovered: number;
}

export function buildSemgrep(catalog: Catalog): SemgrepResult {
  const marked = catalog.fields.filter((f) => f.status === "marked" && f.orphaned !== true);
  const sensitive = marked.filter((f) => isSensitiveCategory(f.category));
  const general = marked.filter((f) => !isSensitiveCategory(f.category));
  const uncovered = catalog.fields.filter(
    (f) => (f.status === "unmarked" || f.status === "deferred") && f.orphaned !== true,
  ).length;

  const groups: Group[] = [];
  if (sensitive.length > 0) {
    groups.push({
      id: "arak-sensitive-data-to-sink",
      severity: "ERROR",
      title: "ข้อมูลอ่อนไหวตามมาตรา 26 หลุดออกนอกระบบ",
      fields: sensitive,
    });
  }
  if (general.length > 0) {
    groups.push({
      id: "arak-personal-data-to-sink",
      severity: "WARNING",
      title: "ข้อมูลส่วนบุคคลหลุดออกนอกระบบ",
      fields: general,
    });
  }

  const header = [
    "# กฎ Semgrep ที่สร้างจาก pii-catalog.yaml ด้วย arak semgrep",
    "# อย่าแก้ไฟล์นี้ด้วยมือ — แก้แคตตาล็อกแล้วสร้างใหม่",
    "#",
    "# กฎเหล่านี้จับจากชื่อฟิลด์ ไม่ใช่ชนิดของค่า ผลบวกลวงจึงเป็นเรื่องปกติ",
    "# ปิดรายจุดด้วย // nosemgrep พร้อมเหตุผล อย่าปิดทั้งกฎ",
    "#",
    `# ครอบคลุมฟิลด์ที่ตัดสินแล้ว ${marked.length} รายการ` +
      (uncovered > 0 ? ` · ยังไม่มีกฎคุ้มอีก ${uncovered} รายการที่ยังไม่ถูกตัดสิน` : ""),
    "",
    "rules:",
  ];

  const body = groups.flatMap((group) => indent(ruleFor(group), 2));

  return {
    yaml: `${[...header, ...body].join("\n")}\n`,
    rules: groups.length,
    covered: marked.length,
    uncovered,
  };
}

export { SINKS as SEMGREP_SINKS };
