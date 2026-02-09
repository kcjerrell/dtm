import path from "node:path"
import AppPage from "../pageobjects/AppPage"
import ProjectsPage from "../pageobjects/ProjectsPage"
import os from "node:os"

const testDataRoot = process.env.TEST_DATA_DIR || path.join(os.homedir(), "dtm-test-data")
const testProjectsDir = path.join(testDataRoot, "projects")

before(() => {
  AppPage.clearAllData()
})

afterEach(async () => {
  // await new Promise(resolve => setTimeout(resolve, 200000))
})

describe('Projects', () => {
  it('can add a watchfolder', async () => {
    // await new Promise(resolve => setTimeout(resolve, 2000))

    await AppPage.projectsButton.click();
    await expect(AppPage.projectsButton).toHaveAttribute("aria-selected", "true")

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

  it('can select a project', async () => {
    await AppPage.projectsButton.click();
    await expect(AppPage.projectsButton).toHaveAttribute("aria-selected", "true")

    // verify projects are listed
    await expect(ProjectsPage.projectA).toBeDisplayedInViewport()
    await expect(ProjectsPage.projectB).toBeDisplayedInViewport()

    // count images
    await browser.waitUntil(async () =>
      (await $('[data-testid="image-grid"]').getAttribute('aria-busy')) === 'false'
    )
    const countBefore = await ProjectsPage.countVisibleImages()

    // select project A
    await ProjectsPage.selectProject("test-project-a")
    await browser.waitUntil(async () =>
      (await $('[data-testid="image-grid"]').getAttribute('aria-busy')) === 'false'
    )

    // verify only project A's images are shown
    let updatedCount = await ProjectsPage.countVisibleImages()
    expect(updatedCount).toBeLessThan(countBefore)

    const projectAId = await ProjectsPage.projectA.getAttribute("data-project-id")
    for (const el of await ProjectsPage.images.getElements()) {
      await expect(el).toHaveAttribute('data-project-id', projectAId)
    }

    // select project B
    await ProjectsPage.selectProject("test-project-b")
    await browser.waitUntil(async () =>
      (await $('[data-testid="image-grid"]').getAttribute('aria-busy')) === 'false'
    )

    // verify only project B's images are shown
    updatedCount = await ProjectsPage.countVisibleImages()
    expect(updatedCount).toBeLessThan(countBefore)

    const projectBId = await ProjectsPage.projectB.getAttribute("data-project-id")
    for (const el of await ProjectsPage.images.getElements()) {
      await expect(el).toHaveAttribute('data-project-id', projectBId)
    }

    // deselect project
    await ProjectsPage.deselectProject("test-project-b")
    await browser.waitUntil(async () =>
      (await $('[data-testid="image-grid"]').getAttribute('aria-busy')) === 'false'
    )

    // verify all images are shown again
    await expect(ProjectsPage.images).toBeElementsArrayOfSize(countBefore)
  })
})

