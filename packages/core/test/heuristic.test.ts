import { describe, expect, it } from "vitest";
import { guessCategory } from "../src/heuristic.js";
import type { SourceField } from "../src/types.js";

function field(container: string, name: string, type = "String", isRelation = false): SourceField {
  return {
    id: `prisma:${container}.${name}`,
    isRelation,
    source: { kind: "prisma", file: "schema.prisma", line: 1, container, field: name, type },
  };
}

describe("guessCategory", () => {
  it("จับเลขบัตรประชาชนไม่ว่าจะเขียนแบบไหน", () => {
    for (const name of ["citizenId", "citizen_id", "nationalId", "idCard", "thai_id"]) {
      expect(guessCategory(field("Customer", name))?.category).toBe("government_id");
    }
  });

  it("จับอีเมลและเบอร์โทร", () => {
    expect(guessCategory(field("Driver", "email"))?.category).toBe("contact");
    expect(guessCategory(field("Driver", "phoneNumber"))?.category).toBe("contact");
  });

  it("จับข้อมูลอ่อนไหวตามมาตรา 26", () => {
    expect(guessCategory(field("Employee", "bloodType"))?.category).toBe("health");
    expect(guessCategory(field("Employee", "religion"))?.category).toBe("belief_religion");
    expect(guessCategory(field("Employee", "disabilityType"))?.category).toBe("disability");
  });

  it("จับชื่อฟิลด์ภาษาไทย", () => {
    expect(guessCategory(field("Order", "ชื่อผู้รับ"))?.category).toBe("identity");
  });

  it("ข้ามฟิลด์ที่เป็นความสัมพันธ์", () => {
    expect(guessCategory(field("Booking", "customer", "Customer", true))).toBeNull();
  });

  it("เลือกกฎที่มั่นใจที่สุดเมื่อเข้าหลายกฎ", () => {
    const hit = guessCategory(field("User", "passportNumber"));
    expect(hit?.category).toBe("government_id");
    expect(hit?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("ไม่เดามั่วกับฟิลด์ที่ไม่เกี่ยวกับคน", () => {
    for (const name of ["dockCount", "slotMinutes", "createdAt", "status", "totalWeightKg"]) {
      expect(guessCategory(field("Booking", name))).toBeNull();
    }
  });

  describe("ชื่อกว้าง ๆ ต้องดูว่า container คือคนจริงไหม", () => {
    it("`name` ยิงเมื่อตารางนั้นคือคน", () => {
      expect(guessCategory(field("User", "name"))?.category).toBe("identity");
      expect(guessCategory(field("EmergencyContact", "name"))?.category).toBe("identity");
    });

    it("`name` ไม่ยิงกับตารางที่ไม่ใช่คน", () => {
      expect(guessCategory(field("Tenant", "name"))).toBeNull();
      expect(guessCategory(field("Dock", "name"))).toBeNull();
    });

    it("`name` ไม่ยิงกับตารางที่แค่เกี่ยวกับคนแต่ไม่ใช่คน", () => {
      // ชื่อของใบรับรอง ไม่ใช่ชื่อของพนักงาน — เจอจากสคีมาระบบบุคคลจริง
      expect(guessCategory(field("EmployeeCertificate", "name"))).toBeNull();
    });

    it("ชื่อแบบประกอบยิงได้โดยไม่ต้องดู container", () => {
      expect(guessCategory(field("Shipment", "receiverFullName"))?.category).toBe("identity");
    });

    it("พิกัดของสถานที่ไม่ใช่ข้อมูลส่วนบุคคล", () => {
      expect(guessCategory(field("Tenant", "gateLat"))).toBeNull();
      expect(guessCategory(field("Driver", "lat"))?.category).toBe("location");
    });
  });

  describe("เคสที่เจอตอนรันกับสคีมาจริง", () => {
    it("ธงและตัวนับไม่ใช่ข้อมูล แม้ชื่อจะมีคำที่เข้ากฎ", () => {
      // payrollLocked เคยถูกจับว่าเป็นข้อมูลการเงินเพราะมีคำว่า payroll
      expect(guessCategory(field("DailyAttendance", "payrollLocked"))).toBeNull();
      expect(guessCategory(field("User", "emailVerified"))).toBeNull();
      expect(guessCategory(field("User", "isDriver"))).toBeNull();
      expect(guessCategory(field("Payslip", "salaryCount"))).toBeNull();
    });

    it("รหัสพนักงานแบบย่อ", () => {
      expect(guessCategory(field("Employee", "empCode"))?.category).toBe("employment");
      expect(guessCategory(field("Employee", "empId"))?.category).toBe("employment");
    });

    it("ตัวระบุจากผู้ให้บริการล็อกอินภายนอกคือนามแฝงที่ยังชี้กลับหาคนได้", () => {
      expect(guessCategory(field("Employee", "googleSub"))?.category).toBe("identity");
      expect(guessCategory(field("Employee", "lineSub"))?.category).toBe("identity");
    });

    it("หลักฐานความยินยอมเป็นข้อมูลที่ต้องบันทึก", () => {
      expect(guessCategory(field("Employee", "pdpaAcceptedAt"))?.category).toBe("behavioral");
    });

    it("วันเริ่มและวันสิ้นสุดนับเป็นข้อมูลการจ้างงานเมื่ออยู่บนตารางของคน", () => {
      expect(guessCategory(field("Employee", "startDate"))?.category).toBe("employment");
      expect(guessCategory(field("Booking", "startDate"))).toBeNull();
    });

    it("ก้อน Json บนตารางของคนถูกเสนอด้วยความเชื่อมั่นต่ำ เพราะไม่มีใครรู้ว่าข้างในมีอะไร", () => {
      const hit = guessCategory(field("Employee", "taxProfile", "Json"));
      expect(hit).not.toBeNull();
      expect(hit?.ruleId).toBe("opaque-json");
      expect(hit?.confidence).toBeLessThan(0.5);
    });

    it("ก้อน Json บนตารางที่ไม่เกี่ยวกับคนถูกปล่อยผ่าน", () => {
      expect(guessCategory(field("Dock", "settings", "Json"))).toBeNull();
    });

    it("นิติบุคคลไม่ใช่เจ้าของข้อมูลส่วนบุคคล จึงถูกลดความเชื่อมั่นลง", () => {
      const company = guessCategory(field("Company", "taxId"));
      const person = guessCategory(field("Customer", "taxId"));
      expect(company?.category).toBe("government_id");
      expect(company?.confidence).toBeLessThan(person?.confidence ?? 1);
    });
  });
});
