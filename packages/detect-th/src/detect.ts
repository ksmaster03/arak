import { DETECTORS, type Detector, type DetectorType } from "./detectors.js";

export interface Match {
  type: DetectorType;
  category: string;
  /** ตำแหน่งเริ่มในข้อความต้นฉบับ */
  start: number;
  /** ตำแหน่งถัดจากตัวสุดท้าย */
  end: number;
  value: string;
  confidence: number;
  /** เจอคำบริบทอยู่ใกล้หรือไม่ */
  hasContext: boolean;
}

export interface DetectOptions {
  /** ตัดผลที่มั่นใจต่ำกว่านี้ทิ้ง ค่าเริ่มต้น 0.5 */
  minConfidence?: number;
  /** จำกัดว่าจะใช้ตัวตรวจชนิดไหนบ้าง */
  only?: DetectorType[];
  /** ปิดตัวตรวจบางชนิด */
  exclude?: DetectorType[];
  /** ระยะที่ถือว่าคำบริบท "อยู่ใกล้" หน่วยเป็นตัวอักษร ค่าเริ่มต้น 64 */
  contextWindow?: number;
  detectors?: Detector[];
}

/**
 * หาข้อมูลส่วนบุคคลไทยในข้อความ
 *
 * ตัวตรวจแต่ละตัวยิงอิสระกัน แล้วค่อยตัดสินตอนท้ายว่าช่วงที่ทับกันจะเก็บอันไหน
 * เพราะเลข 13 หลักหนึ่งชุดอาจถูกทั้งตัวตรวจบัตรประชาชนและตัวตรวจบัตรเครดิตจับพร้อมกัน
 */
export function detect(text: string, options: DetectOptions = {}): Match[] {
  const minConfidence = options.minConfidence ?? 0.5;
  const window = options.contextWindow ?? 64;
  const pool = options.detectors ?? DETECTORS;

  const active = pool.filter((d) => {
    if (options.only !== undefined && !options.only.includes(d.type)) return false;
    if (options.exclude !== undefined && options.exclude.includes(d.type)) return false;
    return true;
  });

  const found: Match[] = [];

  for (const detector of active) {
    const pattern = new RegExp(detector.pattern.source, detector.pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const value = match[0];
      // ป้องกันวนไม่รู้จบเมื่อ pattern จับความยาวศูนย์
      if (value.length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      if (detector.validate !== undefined && !detector.validate(value)) continue;

      const start = match.index;
      const end = start + value.length;
      const hasContext =
        detector.context !== undefined &&
        detector.context.test(
          text.slice(Math.max(0, start - window), Math.min(text.length, end + window)),
        );

      if (detector.requiresContext === true && !hasContext) continue;

      const confidence = hasContext
        ? (detector.contextConfidence ?? detector.baseConfidence)
        : detector.baseConfidence;
      if (confidence < minConfidence) continue;

      found.push({
        type: detector.type,
        category: detector.category,
        start,
        end,
        value,
        confidence,
        hasContext,
      });
    }
  }

  const gaps = new Map<DetectorType, number>();
  for (const d of active) {
    if (d.mergeGap !== undefined) gaps.set(d.type, d.mergeGap);
  }

  return mergeAdjacent(resolveOverlaps(found), text, gaps);
}

/** รวมช่วงชนิดเดียวกันที่ติดกันพอ ให้กลายเป็นช่วงเดียว */
function mergeAdjacent(
  matches: Match[],
  text: string,
  gaps: Map<DetectorType, number>,
): Match[] {
  if (gaps.size === 0) return matches;

  const out: Match[] = [];
  for (const match of matches) {
    const previous = out[out.length - 1];
    const gap = gaps.get(match.type);

    if (
      previous !== undefined &&
      gap !== undefined &&
      previous.type === match.type &&
      match.start - previous.end <= gap
    ) {
      out[out.length - 1] = {
        ...previous,
        end: match.end,
        value: text.slice(previous.start, match.end),
        confidence: Math.max(previous.confidence, match.confidence),
        hasContext: previous.hasContext || match.hasContext,
      };
      continue;
    }
    out.push(match);
  }
  return out;
}

/**
 * ช่วงที่ทับกันเก็บได้อันเดียว เลือกจากความเชื่อมั่นก่อน ถ้าเท่ากันเลือกอันที่ยาวกว่า
 * เพราะช่วงที่ยาวกว่ามักคือค่าที่สมบูรณ์กว่า ไม่ใช่เศษของมัน
 */
function resolveOverlaps(matches: Match[]): Match[] {
  const sorted = [...matches].sort(
    (a, b) => b.confidence - a.confidence || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );

  const kept: Match[] = [];
  for (const candidate of sorted) {
    const clashes = kept.some((k) => candidate.start < k.end && k.start < candidate.end);
    if (!clashes) kept.push(candidate);
  }

  return kept.sort((a, b) => a.start - b.start);
}
