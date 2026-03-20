import { config as dotenvConfig } from 'dotenv';
import type { Options } from '@wdio/types';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp, stopApp } from './helpers/appLauncher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, '.env') });

const WEBDRIVER_PORT = 4445;

export const config: Options.Testrunner = {
  runner: 'local',

  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: resolve(__dirname, 'tsconfig.json'),
      transpileOnly: true,
      esm: true,
    },
  },

  specs: [resolve(__dirname, 'specs', '*.e2e.ts')],

  exclude: [],

  maxInstances: 1,

  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        // We don't actually use Chrome - WebdriverIO connects to our custom WebDriver server
      },
    },
  ],

  // Connect to our WebDriver server
  hostname: '127.0.0.1',
  port: WEBDRIVER_PORT,
  path: '/',

  logLevel: 'warn',

  bail: 0,

  waitforTimeout: 10000,

  connectionRetryTimeout: 120000,

  connectionRetryCount: 3,

  framework: 'mocha',

  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  // Hooks
  onPrepare: async function () {
    // Global setup before any workers are launched
  },

  onComplete: function () {
    // Global teardown after all workers are finished
  },

  beforeSession: async function (config, capabilities, specs) {
    if (specs && specs[0] && specs[0].includes('projects-reset.e2e.ts')) {
      const App = (await import('./pageobjects/App.js')).default;
      await App.clearAllData();
    }

    console.log('Starting Tauri application...');
    await startApp(WEBDRIVER_PORT);

    // Wait a bit for any lingering state to clear
    await new Promise((resolve) => setTimeout(resolve, 500));
  },

  afterSession: async function () {
    console.log('Stopping Tauri application...');
    stopApp(WEBDRIVER_PORT);
  },
};