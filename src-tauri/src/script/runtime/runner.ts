import { lstat, mkdir, rename, stat } from "node:fs/promises";
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

let phase: "runner" | "import" | "userRuntime" = "runner";

function errorLocation(error: any) {
  // Bun runtime frames carry instrumented entry positions. Preserve raw locations;
  // the service/controller applies the analyzer's source map, not this bootstrap.
  const position = error?.position;
  if (position?.file === entryPath && Number.isInteger(position.line) && position.line > 0 && Number.isInteger(position.column) && position.column > 0) {
    return { file: entryPath, line: position.line, column: position.column };
  }
  if (error?.sourceURL === entryPath && Number.isInteger(error.line) && error.line > 0 && Number.isInteger(error.column) && error.column > 0) {
    return { file: entryPath, line: error.line, column: error.column };
  }
  const stack = typeof error?.stack === "string" ? error.stack : "";
  const marker = `${entryPath}:`;
  for (const frame of stack.split("\n")) {
    const offset = frame.indexOf(marker);
    if (offset < 0) continue;
    const match = /^(\d+):(\d+)/.exec(frame.slice(offset + marker.length));
    if (match) return { file: entryPath, line: Number(match[1]), column: Number(match[2]) };
  }
  return undefined;
}

try {
  const manifest = await Bun.file(manifestPath).json();
  const registrations: Array<(dtm: unknown) => unknown> = [];
  Object.defineProperty(globalThis, "createImageProcess", {
    value: (process: (dtm: unknown) => unknown) => registrations.push(process),
    configurable: false,
    writable: false,
  });
  phase = "import";
  await import(`${pathToFileURL(entryPath).href}?run=${encodeURIComponent(manifest.identity.runId)}`);
  phase = "runner";
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
  phase = "userRuntime";
  const value: any = await registrations[0](dtm);
  phase = "runner";
  let mediaType = "image/png";
  await mkdir(outputDirectory, { recursive: true });
  const outputMetadata = await lstat(outputDirectory);
  if (!outputMetadata.isDirectory() || outputMetadata.isSymbolicLink()) {
    throw new Error("run output directory must be a real directory");
  }
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
  // Bun compilation failures are AggregateErrors containing BuildMessages. Their
  // position is already one-based; legacy line/column fields on them are not.
  const detail = phase === "import" && error instanceof AggregateError ? error.errors[0] : error;
  const message = typeof detail?.message === "string" ? detail.message : String(error);
  const stack = error instanceof Error && typeof error.stack === "string" ? error.stack : undefined;
  console.error(error);
  // Keep the structured manifest below the host cap, even for huge thrown values.
  await writeResult({ status: "failure", failure: {
    phase,
    message: message.slice(0, 1024),
    stack: stack?.slice(0, 4096),
    location: errorLocation(detail) ?? errorLocation(error),
  } });
  process.exitCode = 1;
}
