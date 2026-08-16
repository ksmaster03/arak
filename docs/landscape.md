# ภูมิทัศน์เครื่องมือใกล้เคียง และสิ่งที่ควรหยิบมาปรับปรุง

สำรวจ 15 ส.ค. 2569 · เทียบ Arak กับโครงการโอเพนซอร์สที่แก้ปัญหาใกล้กัน
ตัวเลขดาว/วันที่ push ดึงจาก GitHub API วันเดียวกัน

---

## ใครอยู่ตรงไหน

| โครงการ | ดาว | push ล่าสุด | ใบอนุญาต | ทำอะไร |
|---|---:|---|---|---|
| [gitleaks](https://github.com/gitleaks/gitleaks) | 28.7k | 2026-07-29 | MIT | หา secret ใน git — **ต้นแบบเรื่อง baseline + pre-commit + SARIF** |
| [OpenMetadata](https://github.com/open-metadata/OpenMetadata) | 14.9k | 2026-08-15 | Apache-2.0 | data catalog + PII tag |
| [DataHub](https://github.com/datahub-project/datahub) | 12.5k | 2026-08-15 | Apache-2.0 | data catalog + glossary + lineage |
| [Presidio](https://github.com/microsoft/presidio) | 10.5k | 2026-08-11 | MIT | ตรวจ/ปิดบังค่า PII ใน text — คู่เทียบตรงของ `detect-th` |
| [detect-secrets](https://github.com/Yelp/detect-secrets) | 4.6k | 2026-04-02 | Apache-2.0 | baseline + audit workflow |
| [Bearer](https://github.com/Bearer/bearer) | 2.7k | 2026-08-03 | **Elastic-2.0 (ไม่ใช่ OSI)** | SAST ตาม data flow → ออกรายงาน privacy/RoPA |
| [Privado](https://github.com/Privado-Inc/privado) | 651 | **2025-11-10** | LGPL-3.0 | สแกนโค้ดหา data flow → sink (log, third party) |
| [Fides](https://github.com/ethyca/fides) | 476 | 2026-08-06 | Apache-2.0 | privacy-as-code platform + export RoPA (Excel) |
| [fideslang](https://github.com/ethyca/fideslang) | 4 | 2026-08-14 | **CC-BY-4.0** | taxonomy กลาง — เป็นฐานของ IAB Tech Lab Privacy Taxonomy |
| [piicatcher](https://github.com/tokern/piicatcher) | 346 | 2024-01-05 | Apache-2.0 | **archived** — สแกน DB แล้วติดแท็กเข้า catalog |
| [django-gdpr-assist](https://github.com/wildfish/django-gdpr-assist) | 176 | 2025-05-21 | **archived** | ประกาศ `PrivacyMeta.fields` ใน Django model |

---

## ข้อสรุปสำคัญ 4 ข้อ

### 1. ช่องที่ Arak ยืนอยู่ ยังว่างจริง

ค้นแล้วไม่พบเครื่องมือโอเพนซอร์สตัวไหนที่ทำ **PDPA ไทย ระดับ developer tooling**
ที่มีอยู่คือแพลตฟอร์มเชิงพาณิชย์ของไทย (pdpa-thai.com, icomply.tools, Netka NDPP)
กับคอร์สอบรม RoPA — ไม่มีอะไรที่นักพัฒนา `npm install` แล้วใช้ได้

และไม่พบตัวไหนที่ถามเรื่องข้อมูลส่วนบุคคล **ในลูปของ AI coding agent**
Bearer/Privado เป็นสแกนเนอร์หลังบ้าน Fides เป็นแพลตฟอร์ม — ทุกตัวมาทีหลังทั้งสิ้น
ตำแหน่ง "ถามตอนเขียน" ของ Arak ไม่ซ้ำใคร นี่คือคูเมือง ไม่ใช่ฟีเจอร์

### 2. สองโครงการที่ตายแล้ว บอกอะไรบางอย่าง

`piicatcher` archived ปี 2024 · `django-gdpr-assist` archived ปี 2025
ทั้งคู่คือ "ประกาศ PII แล้วมีเครื่องมือช่วย" เหมือน Arak

จุดร่วมของทั้งคู่คือ **ต้องเปิดเครื่องมือแยกอีกตัวถึงจะได้ประโยชน์** —
piicatcher ต้องต่อ Amundsen/DataHub, gdpr-assist ต้องเข้า Django admin
พอ workflow หลักไม่บังคับให้แตะ มันก็ถูกลืม แล้วก็ตาย

Arak รอดข้อนี้ได้เพราะฮุกอยู่ในลูปที่คนทำงานอยู่แล้ว
**แต่ต้องระวังไม่ให้การติดตั้งเรียกร้อง pnpm/monorepo/ขั้นตอนพิเศษ** — bundle ไร้ dependency คือการตัดสินใจที่ถูก อย่าถอย

### 3. สิ่งที่ Arak มี แล้วคนอื่นก็มี = ยืนยันว่าคิดถูก

| แนวคิด | ใครทำ | สรุป |
|---|---|---|
| `baseline` ยกหนี้เก่า | gitleaks, detect-secrets | มาตรฐานของวงการ ทำถูกแล้ว |
| annotation อยู่ในสคีมา | ZenStack (triple-slash hack), PostgreSQL Anonymizer (`SECURITY LABEL`), dbt (`meta:`) | ที่ ZenStack เรียกว่า "triple slash hack" คือสิ่งเดียวกับที่ Arak ใช้ — เป็นทางเดียวที่ Prisma เปิดให้ |
| ไม่พิมพ์ค่าจริงลง log | Presidio, Bearer | ถูกต้อง |
| catalog อยู่ใน git ให้เถียงกันใน PR | Fides (fideslang YAML) | ถูกต้อง |

### 4. สิ่งที่คนอื่นมี แล้ว Arak ยังไม่มี = ช่องว่างจริง

เรียงตาม (คุณค่า ÷ แรง)

---

## ข้อเสนอ เรียงตามความคุ้ม

### A. SARIF + GitHub Action + pre-commit — คุ้มที่สุด แรงน้อยที่สุด

gitleaks, semgrep, Bearer ออก SARIF ได้หมด แล้วอัปผ่าน `github/codeql-action/upload-sarif`
ผลไปโผล่ในแท็บ Security และ **เป็นคอมเมนต์ในบรรทัดที่ผิดใน PR**

ตอนนี้ Arak มีแค่ exit code — ทีมที่ไม่ได้เปิดเทอร์มินัลดูจะไม่เห็นอะไรเลย

- `arak status --format sarif` และ `arak scan --format sarif`
- `action.yml` ในรากรีโป ให้ใช้ `uses: ksmaster03/arak@v1`
- `.pre-commit-hooks.yaml` ให้ติดตั้งผ่าน pre-commit framework ได้

### B. `arak ropa` — เอาต์พุตที่ทำให้ catalog มีค่ากับคนที่ไม่ใช่ dev

Fides ขายตัวเองด้วยข้อนี้ (`fides export` → Excel ตาม template Article 30)
Arak เก็บข้อมูลครบ ม.39 อยู่แล้วแต่ยังออกเอกสารไม่ได้ — DPO/ผู้ตรวจยังต้องพิมพ์มือ

อยู่ใน `NEXT.md` ข้อ 2 แล้ว · ยืนยันว่าควรทำ · แนะนำออก **.xlsx ก่อน .docx**
เพราะ Fides เลือก Excel ด้วยเหตุผลที่ถูก — RoPA คือตาราง ไม่ใช่ prose

### C. map หมวดของ Arak ↔ fideslang — ถูกมาก ได้ interop ฟรี

fideslang เป็น **CC-BY-4.0** จึง map ได้โดยไม่ติดข้อกฎหมาย
และเป็นฐานของ IAB Tech Lab Privacy Taxonomy = ภาษากลางที่คนอื่นอ่านออก

ตรงกัน 18 หมวด เทียบได้ไม่ตรง 5 หมวด (ตรวจกับ `data_files/data_categories.csv` แล้ว)

```
identity        → user.name                    ตรง
government_id   → user.government_id           ตรง
contact         → user.contact                 ตรง
health          → user.health_and_medical      ตรง
biometric       → user.biometric               ตรง
criminal_record → user.criminal_history        ตรง
vehicle         → user.government_id.vehicle_registration   ไม่ตรง
sexual_behavior → user.demographic.sexual_orientation       ไม่ตรง
union           → user.demographic             ไม่ตรง (Fideslang ไม่มีสหภาพแรงงานเลย)
```

จุดสำคัญคือ **ต้องทำเครื่องหมายว่าช่องไหนไม่ตรง ไม่ใช่แกล้งว่าตรง** —
Fideslang เขียนรอบ GDPR ส่วนหมวดของ Arak เขียนรอบ ม.26

ได้ตารางเดียวจบ แล้ว `arak export --format fideslang` ทำให้ catalog ไหลเข้า
Fides / DataHub / OpenMetadata ได้ — และเปิดทางออกรายงาน GDPR Art.30 ด้วยข้อมูลชุดเดิม

### D. `--since <ref>` — ตรวจเฉพาะที่เปลี่ยน

Bearer มี diff scan สำหรับ CI โดยเฉพาะ
ตรงกับปรัชญา "เตือนเฉพาะของใหม่" ของ Arak เป๊ะ และทำให้ CI ของรีโปใหญ่ไม่ช้า

### E. อ่านซอร์สได้มากกว่า Prisma

`sources:` ในคอนฟิกออกแบบเป็น map ตาม `kind` อยู่แล้ว ต่อได้ทันที
ลำดับที่แนะนำ **SQL DDL → Drizzle → TypeORM** (SQL ก่อน เพราะรับ legacy ได้กว้างสุด)

เสริม: piicatcher (แม้ archived) ทำสิ่งที่ Arak ยังทำไม่ได้ — **introspect ตัว DB จริง**
คอลัมน์ที่มีในโปรดักชันแต่ไม่มีในสคีมา ตอนนี้ Arak มองไม่เห็นเลย

### F. sink analysis — ช่องว่างเชิงฟังก์ชันที่ใหญ่สุด

Bearer และ Privado ทำสิ่งเดียวกัน คือไล่จาก **source → sink**
(`console.log`, `res.json`, third party อย่าง Sentry/analytics)

Bearer มีฐานข้อมูล third party ชื่อ *Recipes* ที่ชุมชนช่วยเติมได้
ซึ่งตรงกับฟิลด์ `recipients` ใน catalog ของ Arak ที่ตอนนี้ **คนกรอกเอง ไม่มีอะไรตรวจว่าจริงไหม**

`NEXT.md` ข้อ 3 (generate กฎ Semgrep จาก catalog) คือทางลัดที่ถูกต้อง —
ได้ 80% ของคุณค่าโดยไม่ต้องเขียน dataflow engine เอง

### G. ปล่อย `detect-th` เป็น Presidio recognizer

Presidio มี 10.5k ดาว MIT และรับ custom recognizer ได้
`detect-th` (12 ชนิด ไร้ dependency ตรวจ checksum บัตรประชาชนถูกต้อง) เป็นของดีที่ควรไปให้ไกลกว่า Arak
เป็นช่องทางให้คนรู้จักโครงการโดยไม่ต้องขายทั้งชุด

---

## บั๊กที่เจอระหว่างทดสอบ (ควรแก้ก่อนทำข้อไหนก็ตาม)

`arak scan` รับเฉพาะพาธไฟล์ตรง ๆ ใส่โฟลเดอร์หรือ glob จะพิมพ์ `อ่านไม่ได้ <path>`
แล้ว **คืน exit 0 พร้อมข้อความ "ไม่พบข้อมูลส่วนบุคคล"**

```
arak scan prisma/seed.ts    → เจอ 5 จุด · exit 1   ถูก
arak scan prisma            → อ่านไม่ได้ · exit 0   ผิด
arak scan "prisma/**/*.ts"  → อ่านไม่ได้ · exit 0   ผิด
```

เอาไปวางใน CI เป็น `arak scan src/` จะผ่านตลอดทั้งที่ไม่ได้สแกนอะไรเลย
ตาม contract ที่ README ประกาศไว้เอง กรณีอ่านไฟล์ไม่ได้ต้องเป็น **exit 2**
และควร expand โฟลเดอร์/glob ให้ได้ด้วย

---

## สิ่งที่ยืนยันว่า **ไม่ควร** ทำตามคนอื่น

- **ไม่ต้องรองรับ 7 ภาษาแบบ Bearer** — ความลึกในโลก TypeScript/Prisma + ไทย มีค่ากว่าความกว้างที่ตื้น
- **ไม่ต้องมี dashboard/cloud แบบ Privado** — catalog ใน git คือคำตอบที่ดีกว่าสำหรับทีมเล็ก
- **ไม่ต้องเลียนแบบ Elastic License ของ Bearer** — ใบอนุญาตที่ไม่ใช่ OSI ทำให้องค์กรตรวจสอบแล้วปัดตก
