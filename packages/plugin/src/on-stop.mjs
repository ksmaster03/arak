#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { discoverProjectRoots, emit, loadArak, quiet, readInput, warn } from "./lib.mjs";

/**
 * เขียนแคตตาล็อกให้ตรงกับซอร์ส หนึ่งครั้งต่อเทิร์น
 *
 * ตั้งใจไม่เขียนตอนแก้ไฟล์แต่ละครั้ง เพราะเทิร์นหนึ่งอาจแก้สคีมาห้ารอบ
 * แล้วจะได้ diff ของแคตตาล็อกที่กระพริบไปมาโดยไม่มีประโยชน์
 *
 * ฮุกนี้ไม่ขวางการจบเทิร์น ตามที่ตกลงไว้ว่า "บอกได้ แต่ต้องจบงานได้"
 */
async function main() {
  const input = await readInput();
  const cwd = input.cwd;
  if (typeof cwd !== "string") quiet();

  const roots = discoverProjectRoots(cwd);
  if (roots.length === 0) quiet();

  const { loadProject, today } = await loadArak();
  const notes = [];

  for (const root of roots) {
    const run = loadProject(root, { today: today() });
    if (run.nextText === run.previousText) continue;

    writeFileSync(run.catalogPath, run.nextText, "utf8");

    const marked = run.changes.filter((c) => c.kind === "marked").length;
    const added = run.changes.filter((c) => c.kind === "added").length;
    const parts = [];
    if (marked > 0) parts.push(`มาร์กเพิ่ม ${marked}`);
    if (added > 0) parts.push(`พบใหม่ ${added}`);
    notes.push(parts.length > 0 ? `${run.config.catalog} — ${parts.join(" · ")}` : run.config.catalog);
  }

  if (notes.length === 0) quiet();
  emit({ systemMessage: `Arak: อัปเดต ${notes.join(" | ")}` });
}

main().catch((error) => warn(`ฮุกตอนจบเทิร์นทำงานไม่สำเร็จ — ${error.message}`));
