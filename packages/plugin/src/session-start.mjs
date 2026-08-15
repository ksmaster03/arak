#!/usr/bin/env node
import {
  describePurposes,
  discoverProjectRoots,
  emit,
  loadArak,
  quiet,
  readInput,
  warn,
} from "./lib.mjs";

/**
 * ยัดสิ่งที่ต้องรู้เข้าบริบทตั้งแต่ต้นเซสชัน
 *
 * ที่ต้องมีเพราะการเลือก `purposes` ให้ถูกต้องอ่านจากโค้ดไม่ได้
 * ถ้าไม่บอกรายการไว้ก่อน ตอนฮุกหลังแก้ไฟล์เตือน จะได้คำตอบที่เดาเอาเองแทน
 * ตั้งใจให้สั้น เพราะบริบททุกบรรทัดมีต้นทุน
 */
async function main() {
  const input = await readInput();
  const cwd = input.cwd;
  if (typeof cwd !== "string") quiet();

  const roots = discoverProjectRoots(cwd);
  if (roots.length === 0) quiet();

  const { loadProject, today } = await loadArak();
  const { summarize } = await import("@arak/core");

  // เซสชันหนึ่งดูแลได้หลายชุดในเวลาเดียวกัน แต่บอกรายละเอียดชุดแรกก็พอสำหรับตั้งต้น
  const root = roots[0];
  const run = loadProject(root, { today: today() });
  const summary = summarize(run.catalog);

  const where = roots.length > 1 ? `${root} (และอีก ${roots.length - 1} ชุดในโปรเจกต์นี้)` : root;

  const context = [
    `[Arak] โปรเจกต์ที่ ${where} เก็บบันทึกข้อมูลส่วนบุคคลไว้ที่ ` + run.config.catalog,
    "ทุกฟิลด์ที่เก็บข้อมูลของคน ต้องมีคอมเมนต์ /// @pii(...) หรือ /// @not-pii(reason=...) กำกับในสคีมา",
    "",
    `สถานะตอนนี้ — มาร์กแล้ว ${summary.marked} · ยังไม่ตัดสิน ${summary.unmarked} · พักไว้ ${summary.deferred} · ไม่ใช่ ${summary.notPii}`,
    "",
    "วัตถุประสงค์ที่ใช้ได้",
    describePurposes(run.catalog),
    "",
    "เวลาจะมาร์กฟิลด์ ให้เลือก purposes จากรายการข้างบนเท่านั้น",
    "ถ้าไม่มีอันไหนตรง ให้ถามผู้ใช้ก่อน อย่าเพิ่มวัตถุประสงค์ใหม่เอง",
  ].join("\n");

  emit({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  });
}

main().catch((error) => warn(`ฮุกตอนเปิดเซสชันทำงานไม่สำเร็จ — ${error.message}`));
