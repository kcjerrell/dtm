
import path from "path";
import App from "../pageobjects/App";
import DTProjects from "../pageobjects/DTProjects";

const testProjectsDir = process.env.DTP_TEST_DIR

// these tests will have the app data cleared before running
// so there will be no watched folders set up already

before(async () => {
  await App.clearAllData()
})


describe('Projects', () => {
  it('can add a watchfolder', async () => {
    await App.selectView("projects")

    const settingsHeader = $("p=Settings")
    await expect(settingsHeader).toBeDisplayedInViewport()

    const projectsAPath = path.resolve(path.join(testProjectsDir, "folder-a"))
    console.log("projectsAPath", projectsAPath)

    await browser.execute((folderPath) => {
      (window as any).__E2E_FILE_PATH__ = folderPath
    }, projectsAPath);
    
    // the progress bar goes by too fast, we'll comment out for now
    // const progressBarWait = $("div*=images scanned").waitForDisplayed({ timeout: 5000 })
    
    await $("aria/Add folder").click()
    
    // await progressBarWait
    // await $("div*=images scanned").waitForDisplayed({ timeout: 5000, reverse: true })

    await expect($(`div=${projectsAPath}`)).toBeDisplayedInViewport()

    await $('aria/Close dialog').scrollIntoView({scrollableElement: $("div[role='dialog']")})
    await $('aria/Close dialog').click()

    await expect($("div=test-project-a2")).toBeDisplayedInViewport()
    await expect($("div=test-project-c-9")).toBeDisplayedInViewport()
  })
})