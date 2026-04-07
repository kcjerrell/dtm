import App from "../pageobjects/App";
import {
	assertOsaScriptClipboardAvailable,
	copyFilePathTextToClipboard,
	getClipboardText,
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
		copyFilePathTextToClipboard(astroPath);
		try {
			await browser.waitUntil(() => getClipboardText() === astroPath, {
				timeout: 5000,
				interval: 250,
				timeoutMsg: "Expected astro.png path to be present in clipboard text.",
			});
		} catch (error) {
			const clipboardText = getClipboardText();
			throw new Error(
				`Clipboard check failed for "${astroPath}". Clipboard text: ${JSON.stringify(clipboardText)}. ${String(error)}`,
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
