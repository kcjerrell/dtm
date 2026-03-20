import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let appProcess: ChildProcess | null = null;

type Platform = 'desktop'

function getPlatform(): Platform {
  return 'desktop';
}

export function getAppPath(): string {
  const base = resolve(__dirname, '../../src-tauri/target/release');

  switch (process.platform) {
    case 'darwin': {
      // Try bundled app first, fall back to unbundled binary (--no-bundle)
      const bundledPath = resolve(base, 'bundle/macos/dtm.app/Contents/MacOS/dtm');
      const unbundledPath = resolve(base, 'dtm');
      return existsSync(bundledPath) ? bundledPath : unbundledPath;
    }
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export function getDevAppPath(): string {
  const base = resolve(__dirname, '../../src-tauri/target/debug');

  switch (process.platform) {
    case 'darwin': {
      // Try bundled app first, fall back to unbundled binary
      // const bundledPath = resolve(base, 'bundle/macos/dtm.app/Contents/MacOS/dtm');
      const unbundledPath = resolve(base, 'dtm');
      // return existsSync(bundledPath) ? bundledPath : unbundledPath;
      return unbundledPath;
    }
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export async function waitForServer(port: number, timeout: number = 30000): Promise<void> {
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
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`WebDriver server did not start within ${timeout}ms`);
}

export async function startApp(port: number = 4445): Promise<ChildProcess | null> {
  // Desktop - spawn app
  const appPath = getDevAppPath();
  console.log(`Starting Tauri app: ${appPath}`);

  appProcess = spawn(appPath, [], {
    env: {
      ...process.env,
      TAURI_WEBDRIVER_PORT: port.toString(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  appProcess.stdout?.on('data', (data) => {
    console.log(`[app stdout]: ${data.toString().trim()}`);
  });

  appProcess.stderr?.on('data', (data) => {
    console.error(`[app stderr]: ${data.toString().trim()}`);
  });

  appProcess.on('error', (err) => {
    console.error('Failed to start app:', err);
  });

  appProcess.on('exit', (code, signal) => {
    console.log(`App exited with code ${code}, signal ${signal}`);
    appProcess = null;
  });

  await waitForServer(port);

  return appProcess;
}

export function stopApp(port: number = 4445): void {
  // Desktop
  if (appProcess) {
    console.log('Stopping Tauri app...');
    appProcess.kill('SIGTERM');
    appProcess = null;
  }
}

export function getAppProcess(): ChildProcess | null {
  return appProcess;
}