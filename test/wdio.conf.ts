import type { Options } from "@wdio/types";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";
import {
	startApp,
	stopApp,
	checkForAppInstance,
	startDevServer,
	waitForServer,
} from "./util/appLauncher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, ".env"), override: false });
dotenvConfig({ path: resolve(__dirname, "dev.env"), override: false });

let isAppRunning = false;
const useDev = process.env.DTM_USE_DEV !== "false";

const WEBDRIVER_PORT = 4445;

export const config: Options.Testrunner = {
	runner: "local",

	autoCompileOpts: {
		autoCompile: true,
		tsNodeOpts: {
			project: resolve(__dirname, "tsconfig.json"),
			transpileOnly: true,
			esm: true,
		},
	},

	specs: [resolve(__dirname, "specs", "**/*.e2e.ts")],

	exclude: [],

	maxInstances: 1,

	capabilities: [
		{
			browserName: "chrome",
			"goog:chromeOptions": {
				// We don't actually use Chrome - WebdriverIO connects to our custom WebDriver server
			},
		},
	],

	// Connect to our WebDriver server
	hostname: "127.0.0.1",
	port: WEBDRIVER_PORT,
	path: "/",

	logLevel: "warn",

	bail: 0,

	waitforTimeout: 10000,

	connectionRetryTimeout: 120000,

	connectionRetryCount: 3,

	framework: "mocha",

	reporters: ["spec"],

	mochaOpts: {
		ui: "bdd",
		timeout: 60000,
	},

	// Hooks
	onPrepare: async function () {
	},

	onComplete: function () {
		// Global teardown after all workers are finished
	},

	beforeSession: async function (config, capabilities, specs) {
		isAppRunning = false;

		if (checkForAppInstance("DTM") || checkForAppInstance("dtm")) {
			// use existing app
			isAppRunning = true;
			console.log(`App is already running. Connecting to existing session...`);
			await waitForServer(WEBDRIVER_PORT, 10000);
			return;
		}
		if (useDev) {
			console.log("Starting app in dev mode...");
			await startDevServer(WEBDRIVER_PORT);
			return;
		}
		console.log("Starting debug build...");
		await startApp(WEBDRIVER_PORT);
	},

	afterSession: async function () {
		if (isAppRunning) return;
		console.log("Stopping Tauri application...");
		stopApp();
	},
};
