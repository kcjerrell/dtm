import path from "node:path"
import AppPage from "../pageobjects/AppPage"
import os from "node:os"

const testProjectsDir = path.join(os.homedir(), "dtm-test-data/projects")

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
      window.__E2E_FILE_PATH__ = folderPath
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
    const projectA = $("div=test-project-a")
    await expect(projectA).toBeDisplayedInViewport()
    const projectB = $("div=test-project-b")
    await expect(projectB).toBeDisplayedInViewport()

    const imageItems = $$('[data-testid="image-item"]')

    // count images
    const countBefore = await imageItems.length

    // select project A
    await expect(projectA).not.toHaveAttribute("aria-selected", "true")
    await projectA.click()
    await expect(projectA).toHaveAttribute("aria-selected", "true")
    const projectAId = await projectA.getAttribute("data-project-id")

    // verify only project A's images are shown
    await expect(imageItems).not.toBeElementsArrayOfSize(countBefore)

    for (const el of imageItems) {
      await expect(el).toHaveAttribute('data-project-id', projectAId)
    }

    // select project B
    await expect(projectB).toHaveAttribute("aria-selected", "false")
    await projectB.click()
    await expect(projectB).toHaveAttribute("aria-selected", "true")
    const projectBId = await projectB.getAttribute("data-project-id")

    // verify only project B's images are shown
    await expect(imageItems).not.toBeElementsArrayOfSize(countBefore)

    for (const el of imageItems) {
      await expect(el).toHaveAttribute('data-project-id', projectBId)
    }

    // deselect project
    await projectB.click()
    await expect(projectB).toHaveAttribute("aria-selected", "false")

    // verify all images are shown again
    await expect(imageItems).toBeElementsArrayOfSize(countBefore)
  })
})

