
import path from "path";
import App from "../pageobjects/App";
import DTProjects from "../pageobjects/DTProjects";
import { Key } from "webdriverio"
import { cmdClick, shiftClick } from '../helpers/interaction';

const testProjectsDir = process.env.DTP_TEST_DIR

describe('Projects', () => {
  let failed = false

  afterEach(function () {
    if (this.currentTest?.state === 'failed') {
      failed = true
    }
  })
  beforeEach(function () {
    if (failed) {
      this.skip()
    }
  })

  it('can add a watchfolder', async () => {
    // reset data
    await App.clearAllData()

    // go to projects view
    await App.selectView("projects")

    // assert settings panel appears
    const settingsHeader = $("p*=Settings")
    await expect(settingsHeader).toBeDisplayedInViewport()

    // add a watchfolder
    const projectsAPath = path.resolve(path.join(testProjectsDir, "folder-a"))

    await browser.execute((folderPath) => {
      // inject folder path to bypass native dialog
      (window as any).__E2E_FILE_PATH__ = folderPath
    }, projectsAPath);
    
    await $("aria/Add folder").click()
    
    // ideally would confirm progress bar appears, but it goes by too fast with these projects
    // await progressBarWait
    // await $("div*=images scanned").waitForDisplayed({ timeout: 5000, reverse: true })

    // assert folder was added
    await expect($(`div=${projectsAPath}`)).toBeDisplayedInViewport()

    await $('aria/Close dialog').scrollIntoView({scrollableElement: $("div[role='dialog']")})
    await $('aria/Close dialog').click()

    await expect($("div=test-project-a2")).toBeDisplayedInViewport()
    await expect($("div=test-project-c-9")).toBeDisplayedInViewport()
  })

  it('can select, hide, show projects', async () => {
    // select a project
    await DTProjects.selectProject("test-project-a2")
    
    // assert project is selected, images have changed, and "1 project" appears in the statusbar
    await expect(DTProjects.imageToolbar.projects).toHaveText("1 project", { containing: true })
    const initialImageCount = await DTProjects.countVisibleImages()
    expect(initialImageCount).toBeGreaterThan(0)

    // click hide project button
    await DTProjects.hideSelectedProject()

    // assert project is removed from list, images have changed, statusbar entry is removed, and "show hidden projects" group appears in project list
    await expect(DTProjects.getProject("test-project-a2")).not.toBeDisplayed()
    await expect(DTProjects.imageToolbar.projects).not.toExist()
    await expect(DTProjects.showHiddenProjects).toBeDisplayed()
    expect(await DTProjects.countVisibleImages()).toBeLessThan(initialImageCount)

    // click "show hidden projects" to expand the group
    await DTProjects.showHiddenProjects.click()

    // assert project name appears and "show hidden projects" changes to "hide projects"
    await expect(DTProjects.getProject("test-project-a2")).toBeDisplayed()
    await expect(DTProjects.hideProjects).toBeDisplayed()

    // select project
    await DTProjects.selectProject("test-project-a2")

    // assert project is selected, "1 project" is in statusbar, and "No images found in project" appears in the image grid
    await expect(DTProjects.imageToolbar.projects).toHaveText("1 project", { containing: true })
    await expect($("div*=No images found in this project")).toBeDisplayed()

    // click show project
    await DTProjects.showSelectedProject()

    // assert project appears in list with an image count, and hidden projects group is removed
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await expect(DTProjects.getProject("test-project-a2")).toBeDisplayed()
    await expect(DTProjects.showHiddenProjects).not.toExist()

    // select both projects with shift click
    await DTProjects.selectProject("test-project-a2")
    await expect(DTProjects.imageToolbar.projects).toHaveText("1 project", { containing: true })
    await shiftClick(DTProjects.getProject("test-project-c-9"))
    await expect(DTProjects.imageToolbar.projects).toHaveText("2 projects", { containing: true })

    // clear selection with toolbar
    await DTProjects.imageToolbar.clearProjects.click()
    await expect(DTProjects.imageToolbar.projects).not.toExist()

    // reselect both using cmd+click
    await DTProjects.selectProject("test-project-a2")
    await expect(DTProjects.imageToolbar.projects).toHaveText("1 project", { containing: true })
    await cmdClick(DTProjects.getProject("test-project-c-9"))
    await expect(DTProjects.imageToolbar.projects).toHaveText("2 projects", { containing: true })
  })
})