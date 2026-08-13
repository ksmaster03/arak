import { describe, expect, it } from "vitest";
import { globToRegExp, matchesAny } from "../src/config.js";

describe("globToRegExp", () => {
  it("`*` ไม่ข้ามขีดแบ่งโฟลเดอร์", () => {
    expect(globToRegExp("src/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/deep/a.ts")).toBe(false);
  });

  it("`**/` ข้ามกี่ชั้นก็ได้ รวมถึงศูนย์ชั้น", () => {
    const re = globToRegExp("**/test/*.ts");
    expect(re.test("test/a.ts")).toBe(true);
    expect(re.test("packages/core/test/a.ts")).toBe(true);
    expect(re.test("packages/core/src/a.ts")).toBe(false);
  });

  it("จุดถูกตีความเป็นตัวอักษรจริง ไม่ใช่ตัวแทนอะไรก็ได้", () => {
    expect(globToRegExp("a.ts").test("axts")).toBe(false);
    expect(globToRegExp("a.ts").test("a.ts")).toBe(true);
  });

  it("`?` แทนอักษรเดียวที่ไม่ใช่ขีดแบ่ง", () => {
    expect(globToRegExp("a?.ts").test("ab.ts")).toBe(true);
    expect(globToRegExp("a?.ts").test("a/.ts")).toBe(false);
  });
});

describe("matchesAny", () => {
  it("รูปแบบที่ไม่มีตัวแทนถือเป็นพาธหรือโฟลเดอร์", () => {
    expect(matchesAny("README.md", ["README.md"])).toBe(true);
    expect(matchesAny("packages/core/test/a.ts", ["packages/core"])).toBe(true);
    expect(matchesAny("packages/core-extra/a.ts", ["packages/core"])).toBe(false);
  });

  it("ลิสต์ว่างไม่ข้ามอะไรเลย", () => {
    expect(matchesAny("a.ts", [])).toBe(false);
  });

  it("ตรงข้อไหนข้อหนึ่งก็พอ", () => {
    expect(matchesAny("packages/detect-th/test/detect.test.ts", ["docs/**", "**/test/**"])).toBe(
      true,
    );
  });
});
