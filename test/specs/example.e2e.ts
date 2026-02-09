import AppPage from "../pageobjects/AppPage"

before(async () => {
    await AppPage.clearAllData()
})

describe('Hello Tauri', () => {
    it('should be the correct title', async () => {
        await expect(browser).toHaveTitle('DTM')
    })
})

describe('Basic', () => {
    it('can switch views', async () => {
        await new Promise(resolve => setTimeout(resolve, 2000))

        await AppPage.metadataButton.click();
        await expect(AppPage.metadataButton).toHaveAttribute("aria-selected", "true")

        await expect($("div*=Drop image here")).toBeDisplayedInViewport()

        await AppPage.projectsButton.click();
        await expect(AppPage.projectsButton).toHaveAttribute("aria-selected", "true")

        await expect($("aria/Projects")).toBeDisplayedInViewport()
    })
})