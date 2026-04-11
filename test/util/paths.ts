import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testRoot = path.resolve(__dirname, "..");

function resolveFromTestRoot(envValue: string | undefined, fallback: string): string {
	const value = envValue?.trim() ? envValue : fallback;
	return path.isAbsolute(value) ? value : path.resolve(testRoot, value);
}

export function getTestDataPath(...parts: string[]): string {
	return path.join(getTestDataRootDir(), ...parts);
}

export function getTestDataRootDir(): string {
	return resolveFromTestRoot(process.env.TEST_DATA_DIR, "../test_data");
}

export function getAppDataDir(): string {
	return path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"com.kcjer.dtm",
	);
}