# 📍 จุดกลับมาทำต่อ

สถานะ ณ 13 ส.ค. 2569 · `771dc27` · **139 เทสต์ผ่าน · typecheck สะอาด · ยังไม่ push ขึ้น remote**

## ทำอะไรไปแล้ว

| | |
|---|---|
| `packages/core` | โครงแคตตาล็อกตาม ม.39 · กฎการชี้ขาดสามข้อ · อ่าน/เขียน YAML โดยคอมเมนต์ของคนไม่หาย · ตัวเดาจากชื่อฟิลด์ 35 กฎ |
| `packages/prisma` | ตัวอ่าน `.prisma` ที่ให้เลขบรรทัดจริง · แยกกุญแจนอกออกจากตัวข้อมูล · อ่าน `@pii` / `@not-pii` |
| `packages/detect-th` | ตัวตรวจค่าจริงของไทย 12 ชนิด · `Redactor` ที่ให้ตัวแทนคงที่และแปลงกลับได้ · ไม่มี dependency |
| `packages/cli` | `arak init` / `sync` / `status` / `scan` (มี `--ignore`) |

ทดสอบกับสคีมาจริงสามชุดแล้ว — DockSync 27 ฟิลด์ · FixFlow 27 · SCHEM 43
และสแกน DockSync API เจอข้อมูลใน seed 129 จุด

## ทำต่อได้ทันที

1. **ฮุก Claude Code — นี่คือหัวใจของโปรเจกต์ที่ยังไม่ได้ทำ**
   `PostToolUse` matcher `Edit|Write` → สแกนเฉพาะไฟล์ที่เพิ่งแก้ →
   ถ้าเจอฟิลด์ใหม่ที่ยังไม่มีในแคตตาล็อก ส่ง `additionalContext` บอกให้เติม annotation ในเทิร์นนั้น
   - ต้องเขียนด้วย Node ไม่ใช่ bash+jq เพราะเครื่องที่พัฒนาเป็น Windows
   - รหัสออกต้องเป็น **2** ไม่ใช่ 1 ถึงจะบล็อก และ stdout ต้องเป็น JSON ล้วน
   - ต้อง incremental จริง ๆ ไม่งั้นช้าจนคนปิดทิ้ง
   - แพ็กเป็น plugin: `.claude-plugin/plugin.json` + `hooks/hooks.json` + `skills/`

2. **ตัวสร้าง RoPA** — `arak ropa` ออก .docx/.xlsx ตาม ม.39 ทั้งเจ็ดหัวข้อ
   ใช้แนวทางเดียวกับที่เคยทำ proposal ด้วย python-docx (ดู memory `ref_docx_proposal_build`)

3. **กฎ Semgrep** — source = ฟิลด์ที่มาร์กแล้วในแคตตาล็อก, sink = `console.log` / `res.json` / analytics
   ต้อง generate กฎจากแคตตาล็อก ไม่ใช่เขียนมือ

## ค้างที่การตัดสินใจ

- **ยังไม่ push ขึ้น GitHub** — ยังไม่ได้ตกลงว่า repo จะเป็น public ตั้งแต่แรกหรือ private ก่อน
  ถ้า public ต้องเช็คให้แน่ว่าไม่มีอะไรของลูกค้าหลุดไปใน git history (ตอนนี้สะอาด สแกนแล้ว)
- **ชื่อแพ็กเกจบน npm** — ตอนนี้ใช้ scope `@arak/*` ในเวิร์กสเปซ ยังไม่ได้จอง scope จริง
  ถ้าจองไม่ได้ให้เปลี่ยนเป็น `arak-core` `arak-detect-th` แบบไม่มี scope
- **โดเมน `arak.growgenius.co.th`** ยังไม่ได้ตั้ง

## กับดักที่เจอมาแล้ว อย่าเหยียบซ้ำ

- **แคตตาล็อกเคยถูกเขียนเป็นบรรทัดเดียว** เพราะ `fields: []` ที่ว่างทำให้ yaml ใช้ flow style
  แล้วของที่ต่อท้ายสืบทอดมาด้วย → `blockify()` ใน `catalog.ts` แก้ไว้แล้ว **ห้ามถอด**
- **กุญแจนอกทำให้ `empId` โผล่ซ้ำ 21 ตาราง** ในสคีมาระบบบุคคล → ต้องอ่าน `@relation(fields: [...])`
- **เลขผู้เสียภาษี 13 หลักผ่าน Luhn ได้ราวหนึ่งในสิบ** จึงเคยถูกจับเป็นบัตรเครดิต
- **หลักตรวจสอบบัตรประชาชนมีจุดบอด** หลักที่สามน้ำหนัก 11 → แก้แล้วสูตรจับไม่ได้เลย
  ห้ามเคลมว่า "ผ่าน checksum แปลว่าเลขมีอยู่จริง"
- **`scan` ห้ามพิมพ์ค่าจริงลง stdout** log ของ CI อยู่นานกว่าไฟล์ที่ถูกสแกน
- ตอนรัน CLI ข้ามโปรเจกต์ **cwd ของเชลล์ค้างจากคำสั่งก่อนหน้า** ให้ `cd` กลับรากทุกครั้ง

## วิธีลองเร็ว ๆ

```bash
cd D:/Project/arak
pnpm install && pnpm run build && pnpm test

mkdir -p .scratch/try/prisma
cp <schema ของโปรเจกต์ไหนก็ได้> .scratch/try/prisma/
node packages/cli/dist/index.js init --root .scratch/try
node packages/cli/dist/index.js sync --root .scratch/try
```

`.scratch/` อยู่ใน `.gitignore` แล้ว ใช้ลองกับ repo อื่นได้โดยไม่เขียนอะไรลง repo นั้น
