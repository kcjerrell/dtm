import { spawn, spawnSync, ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Socket } from "node:net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let appProcess: ChildProcess | null = null;
let devProcess: ChildProcess | null = null;

function killProcessTree(proc: ChildProcess): void {
	if (!proc.pid) return;

	try {
		// Kill the full process group so tauri dev + vite subprocesses shut down too.
		process.kill(-proc.pid, "SIGTERM");
	} catch {
		try {
			proc.kill("SIGTERM");
		} catch {
			// Ignore shutdown errors during cleanup.
		}
	}
}

export function checkForAppInstance(appName: string): boolean {
	try {
		const result = spawnSync("pgrep", ["-x", appName]);
		return result.status === 0;
	} catch {
		return false;
	}
}

export function getAppPath(): string {
	const buildType = "debug";
	const base = resolve(__dirname, `../../src-tauri/target/${buildType}`);

	// Try bundled app first, fall back to unbundled binary (--no-bundle)
	const bundledPath = resolve(base, "bundle/macos/dtm.app/Contents/MacOS/dtm");

	if (!existsSync(bundledPath)) {
		throw new Error(`Could not find app at ${bundledPath}`);
	}

	return bundledPath;
}

export async function waitForServer(
	port: number,
	timeout: number = 30000,
): Promise<void> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/status`);
			if (response.ok) {
				console.log(`WebDriver server ready on port ${port}`);
				return;
			}
		} catch {
			// Server not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error(`WebDriver server did not start within ${timeout}ms`);
}

export async function startApp(
	port: number = 4445,
): Promise<ChildProcess | null> {
	const appPath = getAppPath();
	console.log(`Starting Tauri app: ${appPath}`);

	appProcess = spawn(appPath, [], {
		env: {
			...process.env,
			TAURI_WEBDRIVER_PORT: port.toString(),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	appProcess.stdout?.on("data", (data) => {
		console.log(`[app stdout]: ${data.toString().trim()}`);
	});

	appProcess.stderr?.on("data", (data) => {
		console.error(`[app stderr]: ${data.toString().trim()}`);
	});

	appProcess.on("error", (err) => {
		console.error("Failed to start app:", err);
	});

	appProcess.on("exit", (code, signal) => {
		console.log(`App exited with code ${code}, signal ${signal}`);
		appProcess = null;
	});

	await waitForServer(port);

	return appProcess;
}

export async function startDevServer(
	port: number = 4445,
): Promise<ChildProcess | null> {
	console.log("Starting dev server...");
	const repoRoot = resolve(__dirname, "../..");
	const viteServerRunning = await isPortOpen(1420);
	const commandArgs = viteServerRunning
		? ["run", "tauri", "--", "dev", "--no-dev-server"]
		: ["run", "dev"];

	if (viteServerRunning) {
		console.log(
			"Port 1420 is already in use. Reusing existing frontend dev server.",
		);
	}

	devProcess = spawn("npm", commandArgs, {
		env: {
			...process.env,
			TAURI_WEBDRIVER_PORT: port.toString(),
			TAURI_DEV_HOST: process.env.TAURI_DEV_HOST ?? "127.0.0.1",
		},
		stdio: "inherit", // Or pipe if we want to capture logs
		cwd: repoRoot,
		detached: true,
	});

	devProcess.on("error", (err) => {
		console.error("Failed to start dev server:", err);
	});

	devProcess.on("exit", (code, signal) => {
		console.log(`Dev server exited with code ${code}, signal ${signal}`);
		devProcess = null;
	});

	try {
		const exitedBeforeReady = new Promise<never>((_, reject) => {
			devProcess?.once("exit", (code, signal) => {
				reject(
					new Error(
						`Dev server exited before WebDriver was ready (code ${code}, signal ${signal})`,
					),
				);
			});
		});

		// Wait for the app to start and the WebDriver server to be ready.
		await Promise.race([waitForServer(port, 60000), exitedBeforeReady]);
	} catch (error) {
		if (devProcess) {
			killProcessTree(devProcess);
			devProcess = null;
		}
		throw error;
	}

	// await new Promise((res) => setTimeout(res, 5000));

	return devProcess;
}

async function isPortOpen(
	port: number,
	host: string = "127.0.0.1",
	timeoutMs: number = 1000,
): Promise<boolean> {
	return await new Promise((resolve) => {
		const socket = new Socket();

		const done = (result: boolean) => {
			socket.removeAllListeners();
			socket.destroy();
			resolve(result);
		};

		socket.setTimeout(timeoutMs);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
		socket.connect(port, host);
	});
}

export function stopApp(): void {
	// Desktop
	if (appProcess) {
		console.log("Stopping Tauri app...");
		killProcessTree(appProcess);
		appProcess = null;
	}
	if (devProcess) {
		console.log('Stopping dev server...');
		killProcessTree(devProcess);
		devProcess = null;
	}
}

export function getAppProcess(): ChildProcess | null {
	return appProcess;
}
