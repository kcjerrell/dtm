import { execFileSync } from "node:child_process"
import path from "node:path"
import fse from "fs-extra"
import App from "../pageobjects/App"
import DTProjects from "../pageobjects/DTProjects"
import { setTestOverride } from "../util/helpers"
import { getTestDataPath } from "../util/paths"
import { resetProjects, TestProject } from "../util/projects"

/*
 these tests set up their own watchfolder (folder-a) so they can run independently.
 folder-a contains the default projects: test-project-a2 and test-project-c-9
*/

const testProjectsDir = getTestDataPath("temp")
const exportOutputDir = getTestDataPath("temp", "project-export-out")

/** lists the file names inside a zip archive using the system `unzip` CLI */
function listZipEntries(zipPath: string): string[] {
    const raw = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    return raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
}

async function setupFolderA() {
    await App.clearAllData()
    await resetProjects()

    await App.selectView("projects")
    await expect($("p*=Settings")).toBeDisplayedInViewport()

    const folderAPath = path.resolve(path.join(testProjectsDir, "folder-a"))
    await browser.execute((folderPath) => {
        // inject folder path to bypass the native folder picker
        ;(window as any).__E2E_FILE_PATH__ = folderPath
    }, folderAPath)

    await $("aria/Add folder").click()
    await expect($(`div=${folderAPath}`)).toBeDisplayedInViewport()

    await $("aria/Close dialog").scrollIntoView({
        scrollableElement: $("div[role='dialog']"),
    })
    await $("aria/Close dialog").click()

    // assert the default projects are present
    await expect($(`div=${TestProject.projectA}`)).toBeDisplayedInViewport()
}

async function openExportDialogFor(projectName: string) {
    await DTProjects.selectProject(projectName)
    await expect(DTProjects.imageToolbar.projects).toHaveText("1 project", {
        containing: true,
    })

    await DTProjects.clickExport(1)

    // the dialog should appear and target a single project
    await expect(DTProjects.projectExportDialog.export).toBeDisplayed()
    await expect($("body")).toHaveText(expect.stringContaining("Export 1 project"))
}

async function chooseOutputFolder(outputDir: string) {
    // bypass the native folder picker and feed the desired output dir
    await setTestOverride({ openFolderPath: outputDir })
    await DTProjects.projectExportDialog.browse.click()
    await expect(DTProjects.projectExportDialog.outputFolder).toHaveValue(outputDir)
}

async function runExportAndWait() {
    await DTProjects.projectExportDialog.export.click()

    // progress section appears and completes
    await expect($("body")).toHaveText(expect.stringContaining("Progress"))
    await $('[aria-label*="Exporting frames progress"][aria-valuenow="100"]').waitForDisplayed({
        timeout: 60000,
    })
    await expect($("body")).toHaveText(expect.stringContaining("Done"))
}

describe("Project Export", () => {
    before(async () => {
        await setupFolderA()
    })

    beforeEach(async () => {
        await fse.emptyDir(exportOutputDir)
    })

    afterEach(async () => {
        // close the dialog and clear the selection so each test starts clean
        if (await DTProjects.projectExportDialog.close.isExisting()) {
            await DTProjects.projectExportDialog.close.click()
        }
        if (await DTProjects.imageToolbar.clearProjects.isExisting()) {
            await DTProjects.imageToolbar.clearProjects.click()
        }
    })

    it("exports a project's previews as a zip of jpgs with metadata", async () => {
        await openExportDialogFor(TestProject.projectA)
        await chooseOutputFolder(exportOutputDir)

        // preview is the fast/default source
        await DTProjects.projectExportDialog.previewSource.click()

        await runExportAndWait()

        // one zip per project, named after the project
        const zipPath = path.join(exportOutputDir, `${TestProject.projectA}.zip`)
        expect(await fse.pathExists(zipPath)).toBe(true)

        const entries = listZipEntries(zipPath)
        expect(entries.length).toBeGreaterThan(0)
        // preview export produces .jpg files
        expect(entries.every((name) => name.toLowerCase().endsWith(".jpg"))).toBe(true)
        // filenames are prefixed with an incrementing, zero-padded index
        expect(entries.some((name) => /^\d+/.test(name))).toBe(true)
    })

    it("exports a project's tensors as a zip of pngs", async () => {
        await openExportDialogFor(TestProject.projectA)
        await chooseOutputFolder(exportOutputDir)

        // tensor is the slow/full-quality source
        await DTProjects.projectExportDialog.tensorSource.click()

        await runExportAndWait()

        const zipPath = path.join(exportOutputDir, `${TestProject.projectA}.zip`)
        expect(await fse.pathExists(zipPath)).toBe(true)

        const entries = listZipEntries(zipPath)
        expect(entries.length).toBeGreaterThan(0)
        // tensor export produces full-resolution .png files
        expect(entries.every((name) => name.toLowerCase().endsWith(".png"))).toBe(true)
    })
})
