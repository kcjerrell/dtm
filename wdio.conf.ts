import type { Options } from '@wdio/types'
import os from 'os'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'

// keep track of the `tauri-driver` process
let tauriDriver: ChildProcess | undefined

export const config: WebdriverIO.Config = {
  specs: ['./test/specs/example.e2e.ts', './test/specs/projects.e2e.ts'],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: 4444,
  path: '/',
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': {
        application:
          process.env.USE_RELEASE === 'true' ?
            './src-tauri/target/release/dtm'
          : './src-tauri/target/debug/dtm',
      },
    },
  ],
  logLevel: 'info',
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
    parallel: false,
  },
  services: [
    [
      'native-driver',
      {
        binaryPath: process.env.TAURI_DRIVER_PATH || '/home/runner/.cargo/bin/tauri-driver',
      },
    ],
  ],

  // ensure the rust project is built since we expect this binary to exist for the webdriver sessions
  onPrepare: async () => {
    if (process.env.USE_RELEASE !== 'true') {
      // start vite server
      const vite = spawn('npm', ['run', 'dev:vite'], { stdio: 'ignore', cwd: process.cwd() })
      ;(global as any).vite = vite

      // give vite some time to start
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    tauriDriver = spawn(
      // path.resolve(os.homedir(), '.cargo/bin/tauri-driver'),
      'tauri-driver',
      [],
      { stdio: [null, process.stdout, process.stderr] },
    )
  },

  // ensure we are not leaving the `tauri-driver` process running
  onComplete: () => {
    if (tauriDriver) {
      tauriDriver.kill()
    }
    if ((global as any).vite) {
      ;(global as any).vite.kill()
    }
  },
}
