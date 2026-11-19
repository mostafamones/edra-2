import type { SourcePage } from "./parser";

export const sampleBook: SourcePage[] = [
  { number: 1, mode: "text", text: "Algebra\n1. Factorise the expression x² − 9.\nA) (x − 3)(x + 3)\nB) (x − 9)(x + 9)\nC) (x − 3)²\nD) x(x − 9)" },
  { number: 2, mode: "text", text: "التفاضل والتكامل\n١. أوجد مشتقة الدالة y = x³.\nأ) x²\nب) 3x\nج) 3x²\nد) x⁴" },
  { number: 3, mode: "scan", text: "", error: "The scan could not be read" },
  { number: 4, mode: "text", text: "Reading comprehension\n1. Why did the school replace its lights?\n2. What did the students record every Friday?" },
];

export const sampleKey: SourcePage[] = [
  { number: 1, mode: "text", text: "Algebra\n1. A\nCalculus\n1. C" },
];
