#!/usr/bin/env node
import {
  describePurposes,
  emit,
  findProjectRoot,
  loadArak,
  quiet,
  readInput,
  toRepoPath,
  warn,
} from "./lib.mjs";

/**
 * ฮุกหลักของโปรเจกต์ — ยิงหลังจากไฟล์ถูกแก้เสร็จ
 *
 * หน้าที่เดียวคือ ถ้าฟิลด์ที่เพิ่งเขียนน่าจะเป็นข้อมูลส่วนบุคคลแต่ยังไม่มีใครตัดสิน
 * ให้บอกทันทีในเทิร์นนั้น ตอนที่ยังจำได้ว่าฟิลด์นี้มีไว้ทำอะไร
 *
 * ฮุกนี้บล็อกไม่ได้อยู่แล้วตามการออกแบบของ Claude Code (เครื่องมือทำงานไปแล้ว)
 * ซึ่งตรงกับที่ต้องการ — เตือนให้ปิดงาน ไม่ใช่ขวางงาน
 */
async function main() {
  const input = await readInput();
  const cwd = input.cwd;
  const filePath = input.tool_input?.file_path;

  if (typeof cwd !== "string" || typeof filePath !== "string") quiet();

  // สนใจเฉพาะไฟล์ที่เป็นแหล่งความจริงจริง ๆ ไม่ใช่ทุกไฟล์ที่ถูกแก้
  if (!filePath.endsWith(".prisma")) quiet();

  const root = findProjectRoot(filePath, cwd);
  if (root === null) quiet();

  const repoPath = toRepoPath(root, filePath);

  const { loadProject, today } = await loadArak();
  const run = loadProject(root, { today: today() });

  if (!run.config.sources.prisma.includes(repoPath)) quiet();

  const pending = run.catalog.fields.filter(
    (field) =>
      field.status === "unmarked" && field.orphaned !== true && field.source.file === repoPath,
  );
  if (pending.length === 0) quiet();

  const lines = pending
    .sort((a, b) => a.source.line - b.source.line)
    .map((field) => {
      const guess =
        field.category === undefined
          ? ""
          : ` — ตัวเดาว่าน่าจะเป็น ${field.category}` +
            (field.confidence === undefined ? "" : ` (เชื่อมั่น ${field.confidence})`);
      return `  ${field.source.container}.${field.source.field}  บรรทัด ${field.source.line}${guess}`;
    })
    .join("\n");

  const context = [
    `[Arak] ฟิลด์ต่อไปนี้ใน ${repoPath} น่าจะเป็นข้อมูลส่วนบุคคล แต่ยังไม่มีใครตัดสิน`,
    "",
    lines,
    "",
    "ให้เติมคอมเมนต์เอกสารเหนือฟิลด์นั้นก่อนไปทำอย่างอื่นต่อ",
    "  /// @pii(category=<หมวด>, purposes=<คีย์วัตถุประสงค์>)",
    "หรือถ้าพิจารณาแล้วไม่ใช่ข้อมูลส่วนบุคคล",
    '  /// @not-pii(reason="เหตุผลที่คนอ่านย้อนหลังแล้วเข้าใจ")',
    "",
    "วัตถุประสงค์ที่ประกาศไว้แล้วในแคตตาล็อก — เลือกจากรายการนี้เท่านั้น",
    describePurposes(run.catalog),
    "",
    "⚠️ category เดาจากโค้ดได้ แต่ purposes เป็นการตัดสินใจทางธุรกิจ ไม่ใช่เรื่องที่อ่านจากโค้ดแล้วรู้",
    "ฟิลด์ email ที่เก็บไว้ส่งใบเสร็จ (ฐาน: สัญญา) กับที่เก็บไว้ส่งโปรโมชัน (ฐาน: ความยินยอม)",
    "หน้าตาในโค้ดเหมือนกันทุกประการ แต่ผลทางกฎหมายคนละเรื่อง",
    "",
    "ถ้าไม่มีวัตถุประสงค์ไหนในรายการที่ตรงกับการใช้งานจริงของฟิลด์นี้",
    "ให้หยุดแล้วถามผู้ใช้ อย่าเดา และอย่าเพิ่มวัตถุประสงค์ใหม่เข้าแคตตาล็อกเอง",
  ].join("\n");

  emit({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: context,
    },
  });
}

main().catch((error) => warn(`ฮุกหลังแก้ไฟล์ทำงานไม่สำเร็จ — ${error.message}`));
