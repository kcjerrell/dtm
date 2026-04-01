import App from "../pageobjects/App";

async function clickFilterPopupOption(label: string) {
	const option = await $(
		`//div[@data-filter-popup]//*[@role="option" and (normalize-space()="${label}" or .//*[normalize-space()="${label}"])]`,
	);
	await option.waitForDisplayed({ timeout: 10000 });
	await option.click();
}

async function openModelList() {
	await $('[aria-label="models filter value selector"]').click();
	await $('[data-testid="model-version-item"]').waitForDisplayed({
		timeout: 15000,
	});
}

async function expectModelListOpen() {
	await expect($('[data-testid="model-version-item"]')).toBeDisplayed();
}

async function expectModelListClosed() {
	await $('[data-testid="model-version-item"]').waitForExist({
		reverse: true,
		timeout: 10000,
	});
}

async function openOperatorSelect() {
	await $(
		'[aria-label="Search filter operator 0"] [data-part="trigger"]',
	).click();
}

describe("Model Selector Popup", () => {
	it("keeps model selector open for related form interactions", async () => {
		await App.selectView("projects");
		await $("aria/Search tab").click();
		await $("aria/Reset search").click();

		await $("aria/Add search filter").click();
		await $(
			'[aria-label="Search filter target 0"] [data-part="trigger"]',
		).click();
		await clickFilterPopupOption("Model");

		await openModelList();
		await expectModelListOpen();

		// set version and pick a couple models
		const versionItem = $('[aria-label*="Model version Wan 2.1 14b"]');
		await versionItem.waitForDisplayed({ timeout: 15000 });
		await versionItem.click();

		const modelA = $('[aria-label*="Model item Wan 2.1 T2V 14B"]');
		await modelA.waitForDisplayed({ timeout: 15000 });
		await modelA.click();

		const modelB = $('[aria-label*="Model item Wan 2.1 I2V 14B"]');
		if (await modelB.isExisting()) {
			await modelB.click();
		}
		await expectModelListOpen();

		// interacting with operator should keep model list open consistently
		for (const op of ["is", "is not", "is"] as const) {
			await openOperatorSelect();
			await expectModelListOpen();
			await clickFilterPopupOption(op);
			await expectModelListOpen();
		}

		// clicking selected-model value area should not close/reopen (stays open)
		await $('[data-testid="model-value-selector"]').click();
		await expectModelListOpen();

		// removing selected models should keep list open
		const removeButtons = await $$(
			'[aria-label^="Remove selected model "]',
		).getElements();
		for (const btn of removeButtons.slice(0, 2)) {
			await btn.click();
			await expectModelListOpen();
		}

		// changing target should close due selector remount
		await $(
			'[aria-label="Search filter target 0"] [data-part="trigger"]',
		).click();
		await clickFilterPopupOption("Sampler");
		await expectModelListClosed();
	});

	it("closes model selector on outside interaction", async () => {
		await App.selectView("projects");
		await $("aria/Search tab").click();
		await $("aria/Reset search").click();

		await $("aria/Add search filter").click();
		await $(
			'[aria-label="Search filter target 0"] [data-part="trigger"]',
		).click();
		await clickFilterPopupOption("Model");

		await openModelList();
		await expectModelListOpen();

		// outside interaction: tab to settings and activate
		await $("aria/Settings").click();
		await expectModelListClosed();
	});
});
