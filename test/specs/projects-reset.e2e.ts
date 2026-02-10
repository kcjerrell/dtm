
import path from "path";
import App from "../pageobjects/App";
import DTProjects from "../pageobjects/DTProjects";

const testProjectsDir = path.join(process.env.DTP_TEST_DIR, "projects")

// these tests will have the app data cleared before running
// so there will be no watched folders set up already

beforeEach(async () => {
  App.clearAllData()
  await DTProjects.helpers.checkProjectFiles()
})

describe('Projects', () => {
  it('can add a watchfolder', async () => {
    await App.projectsButton.click();
    await expect(App.projectsButton).toHaveAttribute("aria-selected", "true")

    const settingsHeader = $("p=Settings")
    await expect(settingsHeader).toBeDisplayedInViewport()

    await browser.execute((folderPath) => {
      (window as any).__E2E_FILE_PATH__ = folderPath
    }, testProjectsDir);

    // the progress bar goes by fast so we start waiting before adding the folder
    const progressBarWait = $("div*=images scanned").waitForDisplayed({ timeout: 5000 })

    await $("aria/add folder").click()

    // make sure progress appeared...
    await progressBarWait
    // ...and then went away
    await $("div*=images scanned").waitForDisplayed({ timeout: 5000, reverse: true })

    await expect($(`div=${testProjectsDir}`)).toBeDisplayedInViewport()

    await $('button[aria-label="close settings"]').click()

    await expect($("div=test-project-a")).toBeDisplayedInViewport()
    await expect($("div=test-project-b")).toBeDisplayedInViewport()
  })
})