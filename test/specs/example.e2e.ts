import App from "../pageobjects/App"

before(async () => {
    await App.clearAllData()
    await browser.url("tauri://localhost")
    // Wait for hydration/loading
    await new Promise(resolve => setTimeout(resolve, 3000))
})

describe('Hello Tauri', () => {
    it('should be the correct title', async () => {
        await expect(browser).toHaveTitle('DTM')
    })
})

describe('Basic', () => {
    it('can switch views', async () => {
        await new Promise(resolve => setTimeout(resolve, 2000))

        await App.metadataButton.click();
        await expect(App.metadataButton).toHaveAttribute("aria-current", "page")

        await expect($("div*=Drop image here")).toBeDisplayedInViewport()

        await App.projectsButton.click();
        await expect(App.projectsButton).toHaveAttribute("aria-current", "page")

        await expect($("aria/Projects")).toBeDisplayedInViewport()
    })
})