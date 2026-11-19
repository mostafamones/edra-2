import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Small, original text-and-vector fixture; no third-party books or student data.
const pages = [
  [
    "Question 1: Using the bar chart, compare the two groups.",
    "2. Explain why the bar heights differ.",
  ],
  [
    "3. Worked example: Add 2 and 4.",
    "Solution: 2 + 4 = 6.",
  ],
  [
    "Question 4: Which number is even?",
    "A) 3",
    "B) 4",
    "C) 5",
    "Question 5: Explain how to check an answer.",
    "This question continues on the next page.",
  ],
  [
    "For Question 5, include one example and show your steps.",
  ],
  [
    "Answer key",
    "4. B",
  ],
];

export function makeQuestionImportPdf(pageCount) {
  if (pageCount !== undefined && (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 1_000)) {
    throw new Error("Choose a fixture size from 1 to 1000 pages.");
  }
  const fixturePages = pageCount === undefined ? pages : Array.from({ length: pageCount }, (_, index) => [
    `Question ${index + 1}: Explain the concept shown on page ${index + 1}.`,
  ]);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${fixturePages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${fixturePages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [index, lines] of fixturePages.entries()) {
    const stream = `BT /F1 14 Tf 50 720 Td 24 TL ${lines.map(line => `(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join(" T* ")} ET\n`
      + (index === 0 ? "50 485 m 50 620 l 200 620 m 200 485 l 50 485 l S 75 485 35 45 re f 135 485 35 95 re f\n" : "");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
  }

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file?.toLowerCase().endsWith(".pdf")) throw new Error("Pass an output PDF path.");
  await writeFile(file, makeQuestionImportPdf(process.argv[3] ? Number(process.argv[3]) : undefined), { flag: "wx" });
}
