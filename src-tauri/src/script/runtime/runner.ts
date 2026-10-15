import { mkdir, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const [manifestPath, entryPath, resultPath] = process.argv.slice(2);
const temporaryResultPath = `${resultPath}.tmp`;
const outputDirectory = join(dirname(resultPath), "output");
const outputPath = join(outputDirectory, "result.bin");
const OUTPUT_LIMIT = 64 * 1024 * 1024;

async function writeResult(result: unknown) {
  await Bun.write(temporaryResultPath, JSON.stringify(result));
  await rename(temporaryResultPath, resultPath);
}

try {
  const manifest = await Bun.file(manifestPath).json();
  const registrations: Array<(dtm: unknown) => unknown> = [];
  Object.defineProperty(globalThis, "createImageProcess", {
    value: (process: (dtm: unknown) => unknown) => registrations.push(process),
    configurable: false,
    writable: false,
  });
  await import(`${pathToFileURL(entryPath).href}?run=${encodeURIComponent(manifest.identity.runId)}`);
  if (registrations.length !== 1) {
    throw new Error(`expected exactly one createImageProcess registration, received ${registrations.length}`);
  }
  const inputs = new Map(manifest.inputs.map((input: any) => [input.inputId, input]));
  const dtm = {
    __param(id: string, fallback: unknown) { return manifest.values[id]?.value ?? fallback; },
    async __input(id: string) {
      const input: any = inputs.get(id);
      if (!input) throw new Error(`no materialized input for ${id}`);
      return { path: join(dirname(manifestPath), "inputs", input.fileName), mediaType: input.mediaType };
    },
  };
  const value: any = await registrations[0](dtm);
  let mediaType = "image/png";
  await mkdir(outputDirectory);
  if (value instanceof Uint8Array) {
    if (value.byteLength > OUTPUT_LIMIT) throw new Error(`output exceeds ${OUTPUT_LIMIT} bytes`);
    await Bun.write(outputPath, value);
  } else {
    const sourcePath = typeof value === "string" ? value : value?.path;
    if (typeof sourcePath !== "string") {
      throw new Error("process must return a path, image input, or Uint8Array");
    }
    const sourceMetadata = await stat(sourcePath);
    if (!sourceMetadata.isFile()) throw new Error("returned output path is not a regular file");
    if (sourceMetadata.size > OUTPUT_LIMIT) throw new Error(`output exceeds ${OUTPUT_LIMIT} bytes`);
    const copied = new Uint8Array(await Bun.file(sourcePath).slice(0, OUTPUT_LIMIT + 1).arrayBuffer());
    if (copied.byteLength > OUTPUT_LIMIT) throw new Error(`output exceeds ${OUTPUT_LIMIT} bytes`);
    await Bun.write(outputPath, copied);
    mediaType = value?.mediaType ?? mediaType;
  }
  await writeResult({ status: "success", output: { path: outputPath, mediaType } });
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await writeResult({ status: "failure", message });
  process.exitCode = 1;
}
