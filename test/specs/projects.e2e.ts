import path from "node:path"
import App from "../pageobjects/App"
import DTProjects from "../pageobjects/DTProjects"
import os from "node:os"
import * as fs from "node:fs"
import { addProject, removeProject, renameProject, resetProjects, TestFolder, TestProject } from '../helpers/projects'

const testDataRoot = process.env.TEST_DATA_DIR || path.join(os.homedir(), "dtm-test-data")
const testProjectsDir = path.join(testDataRoot, "projects")

// these tests will not clear the app data
// they all depend on the projects watchfolder already existing

before(async () => {
  await resetProjects()
})

afterEach(async () => {
  // await new Promise(resolve => setTimeout(resolve, 200000))
})

describe('Projects', () => {
  it('can select a project', async () => {
    await App.selectView("projects")

    // verify projects are listed
    await expect(DTProjects.projectA).toBeDisplayedInViewport()
    await expect(DTProjects.projectC).toBeDisplayedInViewport()

    // count images
    await browser.waitUntil(async () =>
      (await $('[data-testid="image-grid"]').getAttribute('aria-busy')) === 'false'
    )
    const countBefore = await DTProjects.countVisibleImages()

    // select project A
    await DTProjects.projectA.click()
    await browser.waitUntil(async () =>
      (await $('[data-testid="image-grid"]').getAttribute('aria-busy')) === 'false'
    )

    // verify only project A's images are shown
    let updatedCount = await DTProjects.countVisibleImages()
    expect(updatedCount).toBeLessThan(countBefore)

    const projectAId = await DTProjects.projectA.getAttribute("data-project-id")
    for (const el of await DTProjects.images.getElements()) {
      await expect(el).toHaveAttribute('data-project-id', projectAId)
    }

    // select project C
    await DTProjects.projectC.click()
    await browser.waitUntil(async () =>
      (await $('[data-testid="image-grid"]').getAttribute('aria-busy')) === 'false'
    )

    // verify only project C's images are shown
    updatedCount = await DTProjects.countVisibleImages()
    expect(updatedCount).toBeLessThan(countBefore)

    const projectCId = await DTProjects.projectC.getAttribute("data-project-id")
    for (const el of await DTProjects.images.getElements()) {
      await expect(el).toHaveAttribute('data-project-id', projectCId)
    }

    // deselect project
    await DTProjects.projectC.click()
    await browser.waitUntil(async () =>
      (await $('[data-testid="image-grid"]').getAttribute('aria-busy')) === 'false'
    )

    // verify all images are shown again
    await expect(DTProjects.images).toBeElementsArrayOfSize(countBefore)
  })
})

describe("Projects files", () => {
  it("projects list stays in sync with file system", async () => {
    await App.selectView("projects")

    // verify projectC and projectA is listed
    await expect(DTProjects.projectC).toBeDisplayedInViewport()
    await expect(DTProjects.projectA).toBeDisplayedInViewport()

    // wait a moment to ensure folder is being watched
    // await new Promise(resolve => setTimeout(resolve, 2000))

    // remove project files
    await removeProject(TestFolder.folderA, TestProject.projectC)

    // verify test-project-c is no longer listed
    await DTProjects.projectC.waitForExist({ reverse: true, timeout: 15000 })

    // restore project
    await addProject(TestFolder.folderA, TestProject.projectC)

    // verify test-project-c is listed again
    await DTProjects.projectC.waitForExist({ timeout: 15000 })
    await expect(DTProjects.projectC).toBeDisplayedInViewport()
  })

  it("projects are removed and readded when files are renamed", async () => {
    await App.selectView("projects")

    // verify test-project-a is listed
    await expect(DTProjects.projectA).toBeDisplayedInViewport()

    // wait a moment to ensure folder is being watched
    await new Promise(resolve => setTimeout(resolve, 2000))

    // rename files
    await renameProject(TestFolder.folderA, TestProject.projectA, "test-project-rename")

    // verify test-project-a is no longer listed
    await DTProjects.projectA.waitForExist({ reverse: true, timeout: 15000 })

    // BUG: renamed projects are listed twice
    // verify the renamed project appears, only once
    await expect(DTProjects.getProject("test-project-rename")).toBeDisplayedInViewport()
    await expect($$(`[data-test-id="project-item"]*=${"test-project-rename"}`)).toBeElementsArrayOfSize(1)

    // rename back to original name
    await renameProject(TestFolder.folderA, "test-project-rename", TestProject.projectA)

    // verify the renamed project disappears
    await DTProjects.getProject("test-project-rename").waitForExist({ reverse: true, timeout: 15000 })

    // verify test-project-a is listed again, only once
    await expect(DTProjects.projectA).toBeDisplayedInViewport()
    await expect($$(`[data-test-id="project-item"]*=${"test-project-a"}`)).toBeElementsArrayOfSize(1)
  })
})

