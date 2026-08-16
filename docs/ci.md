# เอา Arak ไปไว้ในสายพานงาน

รหัสจบการทำงานเห็นได้แค่คนที่เปิดเทอร์มินัลดู ทีมที่เหลือไม่เห็นอะไรเลย
สามท่าข้างล่างนี้ทำให้ผลของ Arak ไปโผล่ในที่ที่คนกำลังตัดสินใจอยู่จริง

---

## GitHub Actions — ผลไปเป็นคอมเมนต์ในบรรทัดที่ผิด

```yaml
name: privacy

on:
  pull_request:
  push:
    branches: [main]

jobs:
  arak:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write   # จำเป็นสำหรับอัป SARIF
    steps:
      - uses: actions/checkout@v4

      - id: arak
        uses: ksmaster03/arak@v0.1.0
        with:
          command: status

      # ต้องมี if: always() ไม่งั้นตอน arak ตก ผลจะไม่ถูกอัปเลย
      # ซึ่งกลับหัวกลับหางกับสิ่งที่ต้องการ — ยิ่งตกยิ่งต้องเห็น
      - if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ steps.arak.outputs.sarif-file }}
          category: arak-status
```

เพิ่มด่านหาข้อมูลจริงที่ปนอยู่ในไฟล์ด้วยอีก job

```yaml
  arak-scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - id: arak
        uses: ksmaster03/arak@v0.1.0
        with:
          command: scan
          sarif-file: arak-scan.sarif
      - if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ steps.arak.outputs.sarif-file }}
          category: arak-scan
```

### ตัวเลือกของ action

| input | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `command` | `status` | `status` หรือ `scan` |
| `root` | `.` | รากโปรเจกต์ที่มี `arak.config.yaml` |
| `paths` | — | เฉพาะ `scan` — พาธหรือ glob คั่นด้วยช่องว่าง |
| `sarif-file` | `arak.sarif` | ไฟล์ผลลัพธ์ |
| `strict` | `false` | เฉพาะ `status` — ให้หนี้เก่าทำให้ตกด้วย |
| `min-confidence` | `0.7` | เฉพาะ `scan` |
| `fail` | `true` | ตั้งเป็น `false` ถ้าอยากเห็นผลก่อนโดยยังไม่ให้ job แดง |

**ท่าที่แนะนำสำหรับรีโปที่เพิ่งเริ่มใช้** — รัน `arak baseline` หนึ่งครั้งเพื่อยกของเก่าเป็นหนี้
แล้วเปิด action ด้วย `fail: true` ได้เลย เพราะจะเหลือแต่ของใหม่ที่คนเขียนยังจำได้ว่าทำไมถึงเพิ่มเข้ามา

> ตัว action ใช้ bundle ที่ไม่มี dependency และถูก commit ไว้ในรีโปนี้แล้ว
> ระหว่างรันจึงไม่มี `npm install` ไม่มีขั้น build และไม่มีแพ็กเกจใหม่ไหลเข้ามาในสายพาน

---

## pre-commit — ถามตั้งแต่ก่อนโค้ดออกจากเครื่อง

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/ksmaster03/arak
    rev: v0.1.0
    hooks:
      - id: arak-status            # ฟิลด์ใหม่ต้องถูกตัดสิน — ยิงเมื่อแตะ .prisma
      - id: arak-scan              # ห้ามมีข้อมูลจริงในไฟล์ที่ staged
      - id: arak-catalog-in-sync   # แคตตาล็อกต้องตรงกับสคีมา
```

```bash
pre-commit install
```

`arak-scan` รับเฉพาะไฟล์ที่ staged ไม่ใช่ทั้งโปรเจกต์ จึงเร็วพอจะอยู่ในขั้นตอน commit ได้จริง

---

## GitLab CI

```yaml
arak:
  image: node:20-alpine
  script:
    - node packages/plugin/bin/arak.mjs status --format sarif --out arak.sarif
  artifacts:
    when: always
    paths: [arak.sarif]
```

---

## เอกสารกับกฎที่งอกจากแคตตาล็อก

สองคำสั่งนี้ไม่ควรอยู่ในด่าน CI แต่ควรมีคนสั่งเองเป็นรอบ ๆ

```bash
arak ropa                          # บันทึกรายการกิจกรรมการประมวลผล ม.39 เป็น .xlsx
arak semgrep --out .semgrep/arak.yml   # กฎ Semgrep ที่งอกจากแคตตาล็อก
arak export --format fideslang --out fides.yml
```

`arak ropa` จบด้วยรหัส 1 เมื่อยังมีฟิลด์ที่ไม่ถูกตัดสิน **แต่ยังเขียนไฟล์ออกมาให้อยู่ดี**
โดยยกฟิลด์เหล่านั้นไว้ใต้หัวข้อ "ยังไม่ได้ผูกกับวัตถุประสงค์ใด"
ร่างที่บอกตรง ๆ ว่าตรงไหนยังไม่เสร็จ ใช้งานได้จริงกว่าการไม่มีอะไรเลย
และปลอดภัยกว่าเอกสารที่ดูเรียบร้อยแต่ไม่ครบ

`arak semgrep` จับจาก **ชื่อฟิลด์** ไม่ใช่ชนิดของค่า `$X.email` จึงตรงกับ property ชื่อ `email`
ของอ็อบเจ็กต์อะไรก็ได้ ผลบวกลวงเป็นเรื่องปกติและควรปิดรายจุดด้วย `// nosemgrep` พร้อมเหตุผล
ไม่ใช่ปิดทั้งกฎ
