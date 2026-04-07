import App from "../pageobjects/App";
import {
	assertOsaScriptClipboardAvailable,
	clipboardHasFile,
	clipboardHasFilePayload,
	copyFileToClipboard,
	getClipboardInfoTypes,
	getClipboardFilePaths,
} from "../util/helpers";
import { getFile } from "../util/testData";

describe("Metadata", () => {
	it("loads image from clipboard", async () => {
		assertOsaScriptClipboardAvailable();

		// go to metadata tab
		await App.selectView("metadata");

		// clear images if there any
		if (await $("aria/Clear unpinned images").isExisting()) {
			await $("aria/Clear unpinned images").click();
		}

		// copy file to clipboard
		const astroPath = getFile("astro.png");
		copyFileToClipboard(astroPath);
		try {
			await browser.waitUntil(() => clipboardHasFile(astroPath), {
				timeout: 5000,
				interval: 250,
				timeoutMsg: "Expected astro.png to be present on the system clipboard.",
			});
		} catch (error) {
			const clipboardPaths = getClipboardFilePaths();
			const clipboardTypes = getClipboardInfoTypes();
			const hasFilePayload = clipboardHasFilePayload();
			throw new Error(
				`Clipboard check failed for "${astroPath}". hasFilePayload=${hasFilePayload}. Clipboard types: ${JSON.stringify(clipboardTypes)}. Clipboard paths: ${JSON.stringify(clipboardPaths)}. ${String(error)}`,
			);
		}

		// paste file into metadata tab
		await $("aria/Load image from clipboard").click();

		// // verify image is loaded
		await $(
			`//dt[.='Location']/following-sibling::dd[contains(., 'astro.png')]`
		).waitForDisplayed();

		// // confirm config was load
		await $("aria/Config tab").click();
		await expect($("aria/Config tab")).toHaveAttribute("aria-selected", "true");

		await expect($("body")).toHaveText(
			expect.stringContaining("A lone astronaut"),
		);
		await expect($("body")).toHaveText(
			expect.stringContaining("z_image_turbo"),
		);
	});
});
