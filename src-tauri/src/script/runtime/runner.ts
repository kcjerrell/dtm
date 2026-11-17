import { lstat, mkdir, mkdtemp, rename, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const [manifestPath, entryPath, resultPath, outputByteLimit] = process.argv.slice(2);
const temporaryResultPath = `${resultPath}.tmp`;
const outputDirectory = join(dirname(resultPath), "output");
const outputPath = join(outputDirectory, "result.bin");
const outputLimit = Number(outputByteLimit);

async function writeResult(result: unknown) {
  await Bun.write(temporaryResultPath, JSON.stringify(result));
  await rename(temporaryResultPath, resultPath);
}

async function renderSharp(value: unknown) {
  if (!value || typeof value !== "object" || !("toFile" in value)) return;
  // Resolve only when a Sharp result is possible and this run has the package.
  const localPackage = join(dirname(entryPath), "node_modules", "sharp");
  const installed = await lstat(localPackage).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!installed?.isDirectory()) return;

  // Sharp publishes separate ESM and CommonJS constructors. Check an already
  // loaded CommonJS module first, using the same project-local resolution.
  const require = createRequire(import.meta.url);
  const commonJs = require.cache[require.resolve("sharp")]?.exports;
  const sharp = typeof commonJs === "function" && value instanceof commonJs
    ? commonJs
    : (await import("sharp")).default;
  if (typeof sharp !== "function" || !(value instanceof sharp)) return;

  const directory = await mkdtemp(join(outputDirectory, "sharp-"));
  const pngPath = join(directory, "result.png");
  // Sharp encodes directly to disk. The extension is a PNG default; explicit
  // format settings on the pipeline take precedence.
  const { format } = await sharp.prototype.toFile.call(value, pngPath);
  const metadata = await lstat(pngPath);
  if (!metadata.isFile()) throw new Error("Sharp output is not a regular file");
  if (metadata.size > outputLimit) throw new Error(`output exceeds ${outputLimit} bytes`);
  if (format === "png") return { path: pngPath, mediaType: "image/png" };
  if (format === "jpeg") {
    const jpegPath = join(directory, "result.jpg");
    await rename(pngPath, jpegPath);
    return { path: jpegPath, mediaType: "image/jpeg" };
  }
  throw new Error("Sharp output must be PNG or JPEG. Use .png() or .jpeg() on the pipeline.");
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
    const trimmed = frame.trim();
    if (!trimmed.startsWith("at ")) continue;
    const offset = trimmed.indexOf(marker);
    if (offset < 0) continue;
    const prefix = trimmed.slice(0, offset);
    if (prefix !== "at " && !prefix.endsWith("(")) continue;
    const match = /^(\d+):(\d+)\)?$/.exec(trimmed.slice(offset + marker.length));
    if (match) return { file: entryPath, line: Number(match[1]), column: Number(match[2]) };
  }
  return undefined;
}

try {
  if (!Number.isSafeInteger(outputLimit) || outputLimit < 0) throw new Error("invalid output byte limit");
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
  let path = outputPath;
  let mediaType = "image/png";
  await mkdir(outputDirectory, { recursive: true });
  const outputMetadata = await lstat(outputDirectory);
  if (!outputMetadata.isDirectory() || outputMetadata.isSymbolicLink()) {
    throw new Error("run output directory must be a real directory");
  }
  if (value instanceof Uint8Array) {
    if (value.byteLength > outputLimit) throw new Error(`output exceeds ${outputLimit} bytes`);
    await Bun.write(outputPath, value);
  } else {
    const sourcePath = typeof value === "string" ? value : value?.path;
    if (typeof sourcePath !== "string") {
      const output = await renderSharp(value);
      if (!output) throw new Error("process must return a path, image input, or Uint8Array, or an installed Sharp pipeline");
      ({ path, mediaType } = output);
    } else {
      const sourceMetadata = await stat(sourcePath);
      if (!sourceMetadata.isFile()) throw new Error("returned output path is not a regular file");
      if (sourceMetadata.size > outputLimit) throw new Error(`output exceeds ${outputLimit} bytes`);
      const copied = new Uint8Array(await Bun.file(sourcePath).slice(0, outputLimit + 1).arrayBuffer());
      if (copied.byteLength > outputLimit) throw new Error(`output exceeds ${outputLimit} bytes`);
      await Bun.write(outputPath, copied);
      mediaType = value?.mediaType ?? mediaType;
    }
  }
  await writeResult({ status: "success", output: { path, mediaType } });
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
