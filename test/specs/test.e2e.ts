import path from "node:path"
import AppPage from "../pageobjects/AppPage"
import os from "node:os"

const testProjectsDir = path.join(os.homedir(), "dtm-test-data/projects")

before(() => {
  AppPage.clearAllData()
})

afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 200000))
})

describe('Test setup', () => {
  it('should be cordial', async () => {
    console.log("hello")
    await new Promise(resolve => setTimeout(resolve, 2000))

    // await expect(AppPage.projectsButton).not.toHaveAttribute("aria-selected", "true")

    await AppPage.projectsButton.click();
    await expect(AppPage.projectsButton).toHaveAttribute("aria-selected", "true")

    const settingsHeader = $("p=Settings")
    await expect(settingsHeader).toBeDisplayedInViewport()

    // await $("aria/settings").click()
    await browser.execute((folderPath) => {
      window.__E2E_FILE_PATH__ = folderPath
    }, testProjectsDir);
    await $("aria/add folder").click()

    await new Promise(resolve => setTimeout(resolve, 20000))
  })
})

