import fse from "fs-extra"
import App from "../pageobjects/App"
import DTProjects from "../pageobjects/DTProjects"
import { shiftClick } from "../util/helpers"
import { getTestDataPath } from "../util/paths"
import {
    addProject,
    removeProject,
    renameProject,
    resetProjects,
    TestFolder,
    TestProject,
} from "../util/projects"

// these tests will not clear the app data
// they all depend on the projects watchfolder already existing

before(async () => {
    await resetProjects()
})

afterEach(async () => {
    // await new Promise(resolve => setTimeout(resolve, 200000))
})

describe("Projects", () => {
    it("can select a project", async () => {
        await App.selectView("projects")

        // verify projects are listed
        await expect(DTProjects.projectA).toBeDisplayedInViewport()
        await expect(DTProjects.projectC).toBeDisplayedInViewport()

        // count images
        await browser.waitUntil(
            async () =>
                (await $('[data-testid="image-grid"]').getAttribute("aria-busy")) === "false",
        )
        const countBefore = await DTProjects.countVisibleImages()

        // select project A
        await DTProjects.projectA.click()
        await browser.waitUntil(
            async () =>
                (await $('[data-testid="image-grid"]').getAttribute("aria-busy")) === "false",
        )

        // verify only project A's images are shown
        let updatedCount = await DTProjects.countVisibleImages()
        expect(updatedCount).toBeLessThan(countBefore)

        const projectAId = await DTProjects.projectA.getAttribute("data-project-id")
        for (const el of await DTProjects.images.getElements()) {
            await expect(el).toHaveAttribute("data-project-id", projectAId ?? undefined)
        }

        // select project C
        await DTProjects.projectC.click()
        await browser.waitUntil(
            async () =>
                (await $('[data-testid="image-grid"]').getAttribute("aria-busy")) === "false",
        )

        // verify only project C's images are shown
        updatedCount = await DTProjects.countVisibleImages()
        expect(updatedCount).toBeLessThan(countBefore)

        const projectCId = await DTProjects.projectC.getAttribute("data-project-id")
        for (const el of await DTProjects.images.getElements()) {
            await expect(el).toHaveAttribute("data-project-id", projectCId ?? undefined)
        }

        // deselect project
        await DTProjects.projectC.click()
        await browser.waitUntil(
            async () =>
                (await $('[data-testid="image-grid"]').getAttribute("aria-busy")) !== "true",
        )

        // verify all images are shown again
        await expect(DTProjects.images).toBeElementsArrayOfSize(countBefore)
    })

    it("hides zero-match projects when searching without including them in shift selection", async () => {
        const firstName = "test-project-0"
        const firstPath = getTestDataPath("temp", "folder-a", `${firstName}.sqlite3`)
        const sourcePath = getTestDataPath("projects", "test-project-c-9.sqlite3")
        await fse.copy(sourcePath, firstPath)

        let hideEmptyEnabled = false
        try {
            await App.selectView("projects")
            const first = DTProjects.getProject(firstName)
            const empty = DTProjects.projectA
            const last = DTProjects.projectC
            await first.waitForDisplayed({ timeout: 15000 })
            await expect(empty).toBeDisplayed()
            await expect(last).toBeDisplayed()

            if (await DTProjects.imageToolbar.projects.isExisting()) {
                await DTProjects.imageToolbar.projects.moveTo()
                await DTProjects.imageToolbar.clearProjects.click()
            }

            await $("aria/Search tab").click()
            await $("aria/Reset search").click()
            await $('textarea[placeholder="Search"]').setValue("skyscraper")
            await $("aria/Apply search").click()
            await $("aria/Projects tab").click()

            const resultCount = (project: ChainablePromiseElement) =>
                project.$(":scope > div:last-child").getText()
            await browser.waitUntil(
                async () =>
                    Number(await resultCount(first)) > 0 &&
                    (await resultCount(empty)) === "0" &&
                    Number(await resultCount(last)) > 0,
                { timeout: 15000, timeoutMsg: "Project search counts did not update" },
            )
            await expect(empty).toBeDisplayed()

            await $("aria/Hide empty projects").click()
            hideEmptyEnabled = true
            await empty.waitForDisplayed({ reverse: true })
            await expect(first).toBeDisplayed()
            await expect(last).toBeDisplayed()

            await first.click()
            await shiftClick(last)
            await expect(first).toHaveAttribute("aria-selected", "true")
            await expect(last).toHaveAttribute("aria-selected", "true")
            await expect(empty).toHaveAttribute("aria-selected", "false")
            await DTProjects.imageToolbar.projects.moveTo()
            await DTProjects.imageToolbar.clearProjects.click()

            await $("aria/Hide empty projects").click()
            hideEmptyEnabled = false
            await empty.waitForDisplayed()
            await empty.click()
            await expect(empty).toHaveAttribute("aria-selected", "true")
            await $("aria/Hide empty projects").click()
            hideEmptyEnabled = true
            await expect(empty).toBeDisplayed()
            await empty.click()
            await empty.waitForDisplayed({ reverse: true })

            await $("aria/Search tab").click()
            await $("aria/Reset search").click()
            await $("aria/Apply search").click()
            await $("aria/Projects tab").click()
            await empty.waitForDisplayed()
            await expect(first).toBeDisplayed()
            await expect(last).toBeDisplayed()
        } finally {
            await fse.remove(firstPath)
            await $("aria/Search tab").click()
            await $("aria/Reset search").click()
            await $("aria/Apply search").click()
            await $("aria/Projects tab").click()
            if (hideEmptyEnabled) await $("aria/Hide empty projects").click()
            await DTProjects.getProject(firstName).waitForExist({ reverse: true, timeout: 15000 })
        }
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
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // rename files
        await renameProject(TestFolder.folderA, TestProject.projectA, "test-project-rename")

        // verify test-project-a is no longer listed
        await DTProjects.projectA.waitForExist({ reverse: true, timeout: 15000 })

        // BUG: renamed projects are listed twice
        // verify the renamed project appears, only once
        await expect(DTProjects.getProject("test-project-rename")).toBeDisplayedInViewport()
        await expect(
            $$(`[data-test-id="project-item"]*=${"test-project-rename"}`),
        ).toBeElementsArrayOfSize(1)

        // rename back to original name
        await renameProject(TestFolder.folderA, "test-project-rename", TestProject.projectA)

        // verify the renamed project disappears
        await DTProjects.getProject("test-project-rename").waitForExist({
            reverse: true,
            timeout: 15000,
        })

        // verify test-project-a is listed again, only once
        await expect(DTProjects.projectA).toBeDisplayedInViewport()
        await expect(
            $$(`[data-test-id="project-item"]*=${"test-project-a"}`),
        ).toBeElementsArrayOfSize(1)
    })
})
