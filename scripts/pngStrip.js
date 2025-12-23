import { readFileSync, writeFileSync } from "fs"
import { join, dirname, basename } from "path"

// ===== CONFIG =====
const INPUT_PATH = './temp/dtm.png'
// ==================

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

const input = readFileSync(INPUT_PATH);

if (!input.slice(0, 8).equals(PNG_SIGNATURE)) {
  throw new Error("Not a PNG file");
}

let offset = 8;
const output = [PNG_SIGNATURE];

while (offset < input.length) {
  const length = input.readUInt32BE(offset);
  const type = input.slice(offset + 4, offset + 8).toString("ascii");
  const chunkEnd = offset + 12 + length;

  if (type !== "IDAT") {
    output.push(input.slice(offset, chunkEnd));
  }

  offset = chunkEnd;
}

const outPath =
  join(
    dirname(INPUT_PATH),
    basename(INPUT_PATH, ".png") + ".dat"
  );

writeFileSync(outPath, Buffer.concat(output));

console.log(`Wrote metadata-only PNG container: ${outPath}`);