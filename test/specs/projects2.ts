import App from "../pageobjects/App";
import DTProjects from "../pageobjects/DTProjects";

describe("Projects 2", () => {
	it("can select an image", async () => {
		await App.selectView("projects");
		await browser.waitUntil(
			async () =>
				(await $('[data-testid="image-grid"]').getAttribute("aria-busy")) ===
				"false",
		);
		await DTProjects.images[0].click();
		await expect(DTImageDetail.image).toBeDisplayedInViewport();
	});
});
