import App from "../pageobjects/App";
import { copyFileToClipboard } from "../util/helpers";
import { getFile } from "../util/testData";

describe("Metadata", () => {
	it("loads image from clipboard", async () => {
		// go to metadata tab
		await App.selectView("metadata");

		// clear images if there any
		if (await $("aria/Clear unpinned images").isExisting()) {
			await $("aria/Clear unpinned images").click();
		}

		// copy file to clipboard
		copyFileToClipboard(getFile("astro.png"));
		await new Promise((resolve) => setTimeout(resolve, 1000));

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
