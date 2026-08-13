import type { Problem, SourceField } from "@arak/core";
import { parseAnnotation } from "./annotation.js";
import {
  isRelationType,
  parsePrismaSchema,
  relationScalarNames,
  type BlockKind,
} from "./parse.js";

export * from "./parse.js";
export { parseAnnotation, type AnnotationResult } from "./annotation.js";

/** ตัวอ่านนี้ประกาศตัวเองว่าเป็นชนิดอะไรในแคตตาล็อก */
export const SOURCE_KIND = "prisma";

export interface SchemaInput {
  /** พาธสัมพัทธ์กับรากโปรเจกต์ — ค่านี้จะถูกเก็บลงแคตตาล็อก */
  file: string;
  text: string;
}

export interface PrismaReadResult {
  fields: SourceField[];
  problems: Problem[];
}

/**
 * อ่านสคีมา Prisma หนึ่งหรือหลายไฟล์ให้กลายเป็นรายการฟิลด์ที่พร้อมนำไปเทียบกับแคตตาล็อก
 *
 * รับหลายไฟล์พร้อมกันเพราะโปรเจกต์ที่ใช้ `prismaSchemaFolder` จะแยกสคีมาเป็นหลายไฟล์
 * และการรู้จักชื่อ model ครบทุกไฟล์คือสิ่งเดียวที่ทำให้แยกออกว่าฟิลด์ไหนเป็นความสัมพันธ์
 */
export function readPrismaSchemas(inputs: SchemaInput[]): PrismaReadResult {
  const schemas = inputs.map((input) => parsePrismaSchema(input.text, input.file));

  const blockKinds = new Map<string, BlockKind>();
  for (const schema of schemas) {
    for (const block of schema.blocks) blockKinds.set(block.name, block.kind);
  }

  const fields: SourceField[] = [];
  const problems: Problem[] = [];

  for (const schema of schemas) {
    for (const block of schema.blocks) {
      if (block.kind === "enum") continue;
      const foreignKeys = relationScalarNames(block);

      for (const field of block.fields) {
        const id = `${SOURCE_KIND}:${block.name}.${field.name}`;
        const { annotation, errors } = parseAnnotation(field.doc);

        for (const message of errors) {
          problems.push({
            level: "error",
            id,
            message,
            file: schema.file,
            line: field.line,
          });
        }

        const isRelation =
          isRelationType(field.typeName, blockKinds) || foreignKeys.has(field.name);
        if (isRelation && annotation !== null) {
          problems.push({
            level: "warning",
            id,
            message:
              "ฟิลด์นี้เป็นความสัมพันธ์ ไม่ใช่ตัวข้อมูล — ให้มาร์กที่ฟิลด์ปลายทางแทน",
            file: schema.file,
            line: field.line,
          });
        }

        fields.push({
          id,
          isRelation,
          annotation,
          ...(field.doc.length > 0 ? { doc: field.doc.join(" ") } : {}),
          source: {
            kind: SOURCE_KIND,
            file: schema.file,
            line: field.line,
            container: block.name,
            field: field.name,
            type: field.isList ? `${field.typeName}[]` : field.typeName,
          },
        });
      }
    }
  }

  return { fields, problems };
}
