import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testRoot = path.resolve(__dirname, "..");

function resolveFromTestRoot(envValue: string | undefined, fallback: string): string {
	const value = envValue?.trim() ? envValue : fallback;
	return path.isAbsolute(value) ? value : path.resolve(testRoot, value);
}

export function getTestDataStorageDir(): string {
	return resolveFromTestRoot(process.env.TEST_DATA_STORAGE, "../test_data/projects");
}

export function getDtpTestDir(): string {
	return resolveFromTestRoot(process.env.DTP_TEST_DIR, "../test_data/temp");
}

export function getTestDataRootDir(): string {
	return resolveFromTestRoot(process.env.TEST_DATA_DIR, "../test_data");
}

