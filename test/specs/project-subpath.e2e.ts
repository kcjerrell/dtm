import path from "node:path"
import App from "../pageobjects/App"
import DTProjects from "../pageobjects/DTProjects"
import { shiftClick } from "../util/helpers"
import { getTestDataPath } from "../util/paths"
import { arrangeNestedProjects, resetProjects } from "../util/projects"

const projectsAPath = path.resolve(getTestDataPath("temp", "folder-a"))
const projectsBPath = path.resolve(getTestDataPath("temp", "folder-b"))
const projectNames = [
    "2601",
    "another project",
    "lineage 2",
    "project",
    "project 3",
    "test-project-a2",
    "test-project-c-9",
    "test-project-b",
]
const projectNamesWithSubpaths = [
    "lineage 2",
    "lineage 2 copy > project",
    "subfolder > 2601",
    "subfolder > another project",
    "subfolder > nested > project 3",
    "test-project-a2",
    "test-project-c-9",
    "test-project-b",
]

function getShowSubpathSetting() {
    return $('[data-testid="show-subpath-in-project-list-setting"]')
}

async function updateVisibleShowSubpathSetting(value: boolean) {
    const setting = getShowSubpathSetting()
    await setting.scrollIntoView({
        scrollableElement: $("div[role='dialog']"),
    })

    const input = setting.$('input[type="checkbox"]')
    if ((await input.isSelected()) !== value) {
        await setting.click()
    }

    await browser.waitUntil(async () => (await input.isSelected()) === value)
}

async function closeSettingsDialog() {
    await $("aria/Close dialog").scrollIntoView({
        scrollableElement: $("div[role='dialog']"),
    })
    await $("aria/Close dialog").click()
}

async function updateShowSubpathSetting(value: boolean) {
    if (!(await getShowSubpathSetting().isDisplayed())) {
        await DTProjects.settings.click()
    }
    await expect(getShowSubpathSetting()).toBeDisplayed()
    await updateVisibleShowSubpathSetting(value)
    expect(await getShowSubpathSetting().$('input[type="checkbox"]').isSelected()).toBe(value)
    await closeSettingsDialog()
}

async function getProjectLabels() {
    return browser.execute(() =>
        Array.from(document.querySelectorAll('[data-test-id="project-item"]')).map(
            (item) => item.firstElementChild?.textContent?.trim() ?? "",
        ),
    )
}

async function waitForProjectLabels(expected: string[]) {
    await browser.waitUntil(
        async () => {
            const labels = await getProjectLabels()
            return expected.every((label) => labels.includes(label))
        },
        { timeout: 15_000 },
    )
}

describe("Project subpath labels", () => {
    before(async () => {
        await arrangeNestedProjects()
    })

    after(async () => {
        try {
            await updateShowSubpathSetting(false)
        } finally {
            await resetProjects()
        }
    })

    it("shows and sorts subpaths only when the setting is enabled", async () => {
        await App.clearAllData()
        await App.selectView("projects")

        await expect(getShowSubpathSetting()).toBeDisplayed()
        await updateVisibleShowSubpathSetting(false)
        expect(await getShowSubpathSetting().$('input[type="checkbox"]').isSelected()).toBe(false)

        await browser.execute((folderPath) => {
            window.__E2E_FILE_PATH__ = folderPath
        }, projectsAPath)
        await $("aria/Add folder").click()
        await expect($(`div=${projectsAPath}`)).toBeDisplayedInViewport()

        await browser.execute((folderPath) => {
            window.__E2E_FILE_PATH__ = folderPath
        }, projectsBPath)
        await $("aria/Add folder").click()
        await expect($(`div=${projectsBPath}`)).toBeDisplayedInViewport()
        await closeSettingsDialog()

        await waitForProjectLabels(projectNames)

        let labels = await getProjectLabels()
        expect(labels.filter((label) => projectNames.includes(label))).toEqual(projectNames)

        await updateShowSubpathSetting(true)
        await waitForProjectLabels(projectNamesWithSubpaths)

        labels = await getProjectLabels()
        expect(labels.filter((label) => projectNamesWithSubpaths.includes(label))).toEqual(
            projectNamesWithSubpaths,
        )

        await DTProjects.selectProject("test-project-a2")
        await shiftClick(DTProjects.getProject("test-project-c-9"))
        const selectedLabels = await browser.execute(() =>
            Array.from(
                document.querySelectorAll('[data-test-id="project-item"][data-selected]'),
            ).map((item) => item.firstElementChild?.textContent?.trim() ?? ""),
        )
        expect(selectedLabels).toEqual(["test-project-a2", "test-project-c-9"])

        await updateShowSubpathSetting(false)
        await waitForProjectLabels(projectNames)
        labels = await getProjectLabels()
        expect(labels.filter((label) => projectNames.includes(label))).toEqual(projectNames)
    })
})
