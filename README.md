# Arak — อารักษ์

**มาร์กข้อมูลส่วนบุคคลตั้งแต่ตอนที่โค้ดกำลังถูกเขียน แล้วออกเป็นบันทึกรายการกิจกรรมการประมวลผลตาม PDPA**

> Arak marks personal data while the code is being written, not months later in a CI report
> nobody reads. It keeps a reviewable catalog of every field that holds personal data — with its
> purpose, legal basis and retention — and turns that into a Thai PDPA Record of Processing
> Activities. Apache-2.0.

---

## ปัญหา

เครื่องมือความเป็นส่วนตัวทุกวันนี้เป็นการ **สแกนย้อนหลัง** โค้ดขึ้นไปอยู่บน CI แล้ว
รายงานโผล่มาทีหลัง ตอนนั้นฟิลด์นั้นถูกใช้งานไปทั่วระบบแล้วและไม่มีใครกลับไปแก้

จังหวะที่ถูกคือ **ตอนที่ฟิลด์เพิ่งถูกเขียนเสร็จ** ซึ่งเป็นจังหวะที่คนเขียน (หรือผู้ช่วย AI ที่เขียนแทน)
ยังจำได้ว่าฟิลด์นี้มีไว้ทำอะไร

และไม่มีเครื่องมือเจ้าไหนรู้จักกฎหมายไทย — มาตรา 39 บังคับให้บันทึกครบเจ็ดหัวข้อ
ตั้งแต่ข้อมูลที่เก็บ วัตถุประสงค์ ผู้ควบคุม ระยะเวลาเก็บรักษา สิทธิและวิธีเข้าถึง
ไปจนถึงเงื่อนไขการปฏิเสธคำขอ บวกคำอธิบายมาตรการความมั่นคงปลอดภัยตามมาตรา 37

## เริ่มใช้

```bash
pnpm install
pnpm run build

node packages/cli/dist/index.js init     # สร้าง arak.config.yaml + pii-catalog.yaml
node packages/cli/dist/index.js sync     # อ่านสคีมา แล้วปรับแคตตาล็อกให้ตรง
node packages/cli/dist/index.js status   # ด่านสำหรับ CI — คืนค่า 1 ถ้ายังมีฟิลด์ที่ไม่ได้ตัดสิน
```

`sync` ครั้งแรกจะเสนอรายการที่ *น่าจะ* เป็นข้อมูลส่วนบุคคลมาให้ตัดสิน

```
ยังไม่ได้ตัดสิน  เติม /// @pii(...) หรือ /// @not-pii(reason=...) ไว้เหนือฟิลด์
  ? prisma:Customer.taxId       prisma/schema.prisma:1115 น่าจะเป็น government_id
  ? prisma:Customer.email       prisma/schema.prisma:1117 น่าจะเป็น contact
  ? prisma:LoginLog.ip          prisma/schema.prisma:173  น่าจะเป็น device
```

## การมาร์ก

เขียนไว้ในคอมเมนต์เอกสารของ Prisma ตรงเหนือฟิลด์ คำอธิบายภาษาคนที่มีอยู่แล้วไม่ต้องย้ายไปไหน

```prisma
model Customer {
  /// เลขประจำตัวผู้เสียภาษี ใช้ออกใบกำกับ
  /// @pii(category=government_id, purposes=tax_invoice)
  taxId String?

  /// @pii(category=contact, purposes=delivery;tax_invoice)
  email String?

  /// @pii(contact)
  phone String?

  /// @not-pii(reason="รหัสอ้างอิงภายใน สร้างแบบสุ่ม ไม่ผูกกับตัวบุคคล")
  refCode String
}
```

| คีย์ | ความหมาย |
|---|---|
| `category` | หมวดข้อมูล — ใส่เป็นค่าเดี่ยวแบบทางลัดก็ได้ `@pii(contact)` |
| `purposes` | อ้าง key ใน `purposes` ของแคตตาล็อก คั่นหลายอันด้วย `;` `\|` หรือ `+` |
| `retention` | ISO-8601 duration เช่น `P5Y` — ใส่เมื่อฟิลด์นี้ต่างจากค่าของวัตถุประสงค์ |
| `reason` | ใช้กับ `@not-pii` เท่านั้น |

หมวดที่รองรับแบ่งเป็นสองชุด — ชุดทั่วไป (`identity` `government_id` `contact` `financial`
`employment` `education` `location` `device` `behavioral` `media` `family` `vehicle` `credential`)
และ **ชุดอ่อนไหวตามมาตรา 26** (`health` `disability` `belief_religion` `race_ethnicity`
`political_opinion` `sexual_behavior` `criminal_record` `union` `genetic` `biometric`)
ซึ่งจะถูกนับแยกในรายงานเพราะต้องได้ความยินยอมโดยชัดแจ้ง

## แคตตาล็อก

`pii-catalog.yaml` คือแหล่งความจริงเพียงที่เดียว และเป็นไฟล์ที่ commit เข้า git

```yaml
purposes:
  - key: tax_invoice
    label: ออกใบกำกับภาษีตามที่กฎหมายกำหนด
    legalBasis: legal_obligation   # ม.24(6)
    retention: P5Y                 # ม.39(4)

fields:
  - id: prisma:Customer.taxId
    status: marked
    category: government_id
    purposes:
      - tax_invoice
    source:
      kind: prisma
      file: prisma/schema.prisma
      line: 1117
      container: Customer
      field: taxId
```

สองส่วนนี้เจ้าของต่างกัน และเครื่องมือเคารพเส้นแบ่งนี้เคร่งครัด

- `controller` `purposes` `access` `securityMeasures` — **เป็นของคน** เครื่องมือไม่แตะ
  และคอมเมนต์ที่เขียนไว้จะไม่หายตอน sync
- `fields` — เครื่องมือดูแลให้ตรงกับซอร์สเสมอ แต่ **ไม่ลบอะไรทิ้งเอง**
  ฟิลด์ที่หายจากโค้ดจะถูกทำเครื่องหมาย `orphaned` เพราะการที่โค้ดลบคอลัมน์
  ไม่ได้แปลว่าข้อมูลในฐานถูกลบไปด้วย

## กฎการชี้ขาด

มีสามข้อ และมีแค่สามข้อ

1. ฟิลด์ที่มี `@pii(...)` ในโค้ด — **คำอธิบายในโค้ดชนะ** เพราะมันเดินทางไปพร้อมโค้ด
2. ฟิลด์ที่ไม่มี annotation แต่มีอยู่ในแคตตาล็อกแล้ว — **ของเดิมชนะ** เพราะคนเป็นคนใส่ไว้
3. ไม่มีทั้งสองอย่าง — ตัวเดาเสนอเข้ามาในสถานะ `unmarked` ให้คนตัดสิน

เมื่อคนตัดสินแล้ว ผลของตัวเดา (`confidence` / `detectedBy`) จะถูกลบทิ้ง ไม่ค้างไว้ให้สับสน

## ด่าน CI

```yaml
- run: node packages/cli/dist/index.js status
```

- `0` — ทุกฟิลด์ถูกตัดสินแล้ว
- `1` — ยังมีฟิลด์ที่ไม่ได้ตัดสิน หรือแคตตาล็อกมีข้อผิดพลาด เช่น มาร์กว่าเป็น PII แล้วแต่ไม่ระบุวัตถุประสงค์ (ม.39(2) บังคับ)
- `2` — เรียกใช้ผิด หรืออ่านไฟล์ไม่ได้

ใช้ `sync --check` เมื่ออยากบังคับว่าแคตตาล็อกที่ commit ไว้ต้องตรงกับสคีมาเสมอ

## สถานะ

รองรับ **TypeScript + Prisma** เป็นชุดแรก

| ทำแล้ว | ยังไม่ทำ |
|---|---|
| สคีมาแคตตาล็อกครบตาม ม.39 | ตัวตรวจไทยของจริง (เลขบัตร 13 หลัก + หลักตรวจสอบ, ชื่อไทย) |
| ตัวอ่านสคีมา Prisma + `@pii` | ฮุก Claude Code ที่ปิดวงในเทิร์นเดียว |
| เขียนแคตตาล็อกกลับโดยคอมเมนต์ไม่หาย | ตัวสร้างเอกสาร RoPA (.docx/.xlsx) |
| ตัวเดาตั้งต้น 35 กฎ | กฎ Semgrep ห้าม PII ไหลลง log |
| `arak init` / `sync` / `status` | ตัวอ่าน OpenAPI และ TypeScript type |

ตัวเดาในตอนนี้เดาจากชื่อฟิลด์และชนิดข้อมูลเท่านั้น เป็นของชั่วคราวเพื่อให้มีของให้ตัดสินตั้งแต่วันแรก
ทุกกฎถูกปรับจากการรันกับสคีมาจริงสามชุด — ระบบคลังสินค้า ระบบซ่อมบำรุง และระบบบุคคล

## พัฒนา

```bash
pnpm test          # 81 เทสต์
pnpm run build
pnpm run typecheck
```

โครงสร้าง

```
packages/core     โครงแคตตาล็อก · กฎการชี้ขาด · อ่าน/เขียน YAML · ตัวเดาตั้งต้น
packages/prisma   ตัวอ่านสคีมา Prisma และ @pii ในคอมเมนต์
packages/cli      คำสั่ง arak
```

มี dependency ตอนรันจริงตัวเดียวคือ [`yaml`](https://github.com/eemeli/yaml)
สำหรับเครื่องมือที่ต้องอ่านสคีมาของคนอื่น จำนวน dependency คือส่วนหนึ่งของความน่าเชื่อถือ

## สัญญาอนุญาต

Apache-2.0 — ดู [LICENSE](LICENSE)
