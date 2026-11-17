import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import App from "../pageobjects/App"
import { getTestDataPath } from "../util/paths"

const projectName = `Image Scripts WDIO ${Date.now()}`
const editorSource = '[aria-label^="Script source"][role="textbox"]'
const outputSelector = 'img[alt="Script output"]'

const script = (body: string) =>
    `createImageProcess(async (dtm) => { const image = await dtm.input({ id: "image", label: "Source image" }); ${body} });`
const goodSource = script('console.log("real Bun output"); return image')
const badSource = script('throw new Error("WDIO runtime failure")')
const waitingSource = script(
    'console.log("WDIO run ready"); await new Promise<void>(() => setInterval(() => {}, 1000)); return image',
)

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return browser.execute(
        async (command, args) => {
            const tauri = (
                window as unknown as {
                    __TAURI__: {
                        core: {
                            invoke<T>(name: string, args?: Record<string, unknown>): Promise<T>
                        }
                    }
                }
            ).__TAURI__
            return tauri.core.invoke(command, args)
        },
        command,
        args,
    ) as Promise<T>
}

async function editSource(projectId: string, source: string) {
    await $(editorSource).waitForExist()
    const pasted = await browser.execute(
        (selector, text, mac) => {
            const input = document.querySelector<HTMLElement>(selector)
            if (!input) return false
            input.focus()
            // Embedded WebDriver's key actions do not supply Monaco's key code in WebKit.
            const selectAll = new KeyboardEvent("keydown", {
                key: "a",
                code: "KeyA",
                metaKey: mac,
                ctrlKey: !mac,
                bubbles: true,
                cancelable: true,
            })
            Object.defineProperty(selectAll, "keyCode", { value: 65 })
            input.dispatchEvent(selectAll)
            const clipboard = new DataTransfer()
            clipboard.setData("text/plain", text)
            input.dispatchEvent(
                new ClipboardEvent("paste", {
                    clipboardData: clipboard,
                    bubbles: true,
                    cancelable: true,
                }),
            )
            return true
        },
        editorSource,
        source,
        process.platform === "darwin",
    )
    expect(pasted).toBe(true)
    await browser.waitUntil(
        async () => {
            const stored = await invoke<{ source: string }>("open_script_project", { projectId })
            return stored.source === source
        },
        { timeoutMsg: "Monaco did not save the pasted source" },
    )
}

async function openWorkspace() {
    const tab = $("button=Image Scripts")
    await tab.click()
    await expect(tab).toHaveAttribute("aria-current", "page")
    await $("aria/Script project").waitForDisplayed()
}

const run = () => $("button=Run")
const stop = () => $("button=Stop")
const problems = () => $('[aria-label="Script problems"]')
const logs = () => $('[aria-label="Run output"]')

async function waitForRun(phase: string) {
    await expect($(`p=Run status: ${phase}`)).toBeDisplayed()
}

async function selectIndexedInput(imageId: number) {
    const chooseImage = $("aria/Choose image for Source image")
    await chooseImage.waitForExist()
    await $("button=Load recent Draw Things images").click()
    const sourcePicker = $('select[aria-label="Image selection source"]')
    await sourcePicker.$(`option[value="${imageId}"]`).waitForExist()
    await browser.execute((id) => {
        const picker = document.querySelector<HTMLSelectElement>(
            'select[aria-label="Image selection source"]',
        )
        if (!picker) throw new Error("Image source picker is unavailable")
        picker.value = String(id)
        picker.dispatchEvent(new Event("change", { bubbles: true }))
    }, imageId)
    await expect(sourcePicker).toHaveValue(String(imageId))
    await chooseImage.click()
    await expect($(`p=Draw Things image ${imageId}`)).toBeDisplayed()
}

interface Folder {
    id: number
    path: string
}

interface ImageRow {
    id: number
    node_id: number
}

interface ProjectManifest {
    projectId: string
}

describe("Image Scripts", () => {
    let fixtureDirectory: string | undefined
    let folderId: number | undefined
    let imageId: number | undefined

    before(async function () {
        this.timeout(90_000)
        fixtureDirectory = await mkdtemp(join(tmpdir(), "dtm-wdio-script-"))
        const fixtureName = `${basename(fixtureDirectory)}.sqlite3`
        await copyFile(
            getTestDataPath("projects", "test-project-a2.sqlite3"),
            join(fixtureDirectory, fixtureName),
        )

        // Only the existing Projects watch-folder fixture path is injected.
        // Script selection uses the production UI and opaque indexed resource adapter.
        await App.selectView("projects")
        await browser.waitUntil(
            async () => {
                try {
                    await invoke("dtp_list_watch_folders")
                    return true
                } catch {
                    return false
                }
            },
            { timeoutMsg: "Projects did not connect" },
        )
        await invoke("dtp_pick_watch_folder", { testOverride: fixtureDirectory })
        await browser.waitUntil(
            async () => {
                const folders = await invoke<Folder[]>("dtp_list_watch_folders")
                folderId = folders.find(({ path }) => path === fixtureDirectory)?.id
                if (folderId === undefined) return false
                const projects = await invoke<{ id: number }[]>("dtp_list_projects", {
                    watchfolderId: folderId,
                })
                if (!projects.length) return false
                const images = await invoke<{ images?: ImageRow[] }>("dtp_list_images", {
                    projectIds: projects.map(({ id }) => id),
                    showImage: true,
                    showVideo: false,
                    showDisconnected: false,
                    take: 50,
                })
                // Node 2 of this fixture has lossless PNG data.
                imageId = images.images?.find(({ node_id }) => node_id === 2)?.id
                return imageId !== undefined
            },
            { timeout: 30_000, timeoutMsg: "The fixture image was not indexed" },
        )
        const close = $("aria/Close dialog")
        if (await close.isDisplayed()) await close.click()
    })

    after(async () => {
        try {
            if (folderId !== undefined) await invoke("dtp_remove_watch_folder", { id: folderId })
        } finally {
            if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true })
        }
    })

    it("edits, analyzes and runs real Bun, keeps a preview on failure and Stop, and restores without trust", async function () {
        this.timeout(90_000)
        await openWorkspace()
        await $("aria/New script project name").setValue(projectName)
        await $("button=Create").click()
        const picker = $('select[aria-label="Script project"]')
        const newProject = picker.$(`option=${projectName}`)
        await newProject.waitForExist()
        const projectId = await newProject.getAttribute("value")
        if (!projectId) throw new Error("The created script project has no ID")
        await expect(picker).toHaveValue(projectId)
        expect(await invoke("get_script_dependencies", { projectId })).toEqual({
            dependencies: {},
            revision: null,
            lockFingerprint: null,
            installed: false,
        })
        await $("summary*=Packages").waitForDisplayed()
        await waitForRun("idle")
        await expect(run()).not.toBeEnabled()

        // A semantic error exercises the real Monaco TypeScript worker.
        await editSource(projectId, script('const typed: number = "wrong"; return image'))
        await expect(problems()).toHaveText(expect.stringContaining("2322"))
        const chooseImage = $("aria/Choose image for Source image")
        await chooseImage.waitForExist()
        await editSource(projectId, goodSource)
        await expect(problems()).toHaveText(expect.stringContaining("No problems."))
        await $("p*=Waiting for source analysis").waitForExist({ reverse: true })
        if (imageId === undefined) throw new Error("The fixture image was not indexed")
        await selectIndexedInput(imageId)
        await expect(run()).not.toBeEnabled()

        await $("label=I understand and trust this script").click()
        await $("button=Trust this script").click()
        await expect($("p=Trust: trusted")).toBeDisplayed()
        await run().click()
        await waitForRun("succeeded")
        await expect(logs()).toHaveText(expect.stringContaining("real Bun output"))
        const preview = $(outputSelector)
        await preview.waitForExist()
        const previewUrl = await preview.getAttribute("src")
        if (!previewUrl) throw new Error("The successful run did not provide a preview URL")
        expect(previewUrl).toMatch(/^dtm:\/\/script-output\/[0-9a-f]{64}$/)
        await browser.waitUntil(
            () =>
                browser.execute((selector) => {
                    const img = document.querySelector<HTMLImageElement>(selector)
                    return Boolean(img?.complete && img.naturalWidth > 0)
                }, outputSelector),
            { timeoutMsg: "WebKit did not decode the script output" },
        )

        await editSource(projectId, badSource)
        await run().waitForEnabled()
        await run().click()
        await waitForRun("failed")
        await expect(problems()).toHaveText(expect.stringContaining("WDIO runtime failure"))
        await expect($("p*=Stale preview")).toBeDisplayed()
        await expect(preview).toHaveAttribute("src", previewUrl)

        await editSource(projectId, waitingSource)
        await run().waitForEnabled()
        await run().click()
        await waitForRun("running")
        await expect(logs()).toHaveText(expect.stringContaining("WDIO run ready"))
        await stop().click()
        await waitForRun("cancelled")
        await expect(preview).toHaveAttribute("src", previewUrl)

        await browser.refresh()
        await openWorkspace()
        await expect(picker).toHaveValue(projectId)
        await expect($("p=Trust: untrusted")).toBeDisplayed()
        await waitForRun("idle")
        await expect(run()).not.toBeEnabled()
        await expect($(outputSelector)).not.toExist()
        await expect(chooseImage).toExist()
        await expect($("p=No image selected")).toBeDisplayed()
        const stored = await invoke<{ manifest: ProjectManifest; source: string }>(
            "open_script_project",
            { projectId },
        )
        expect(stored.manifest.projectId).toBe(projectId)
        expect(stored.source).toBe(waitingSource)
    })

    // This case exercises the real public registry. The standard suite is usable offline.
    const registryTest = process.env.DTM_TEST_SCRIPT_REGISTRY === "1" ? it : it.skip
    registryTest(
        "installs package types in Monaco, runs the package, and clears types on removal",
        async function () {
            this.timeout(120_000)
            await openWorkspace()
            const name = `${projectName} packages`
            await $("aria/New script project name").setValue(name)
            await $("button=Create").click()
            const picker = $('select[aria-label="Script project"]')
            const option = picker.$(`option=${name}`)
            await option.waitForExist()
            const projectId = await option.getAttribute("value")
            if (!projectId || imageId === undefined)
                throw new Error("Package QA fixtures are unavailable")
            await expect(picker).toHaveValue(projectId)

            const importLine = 'import { red } from "kleur/colors"; '
            const valid =
                importLine + script('console.log(red("package run succeeded")); return image')
            await editSource(projectId, valid)
            await expect(problems()).toHaveText(expect.stringContaining("2307"))

            await $("summary*=Packages").click()
            await $("aria/Package name").setValue("kleur")
            await $("aria/Exact package version").setValue("4.1.5")
            await $("button=Install package").click()
            const remove = $("aria/Remove kleur")
            await remove.waitForEnabled({ timeout: 30_000 })
            await expect(problems()).toHaveText(expect.stringContaining("No problems."))

            // Check that the subpath is actually typed and wasn't treated as an ambient any.
            await editSource(
                projectId,
                importLine + script('const value: number = red("text"); return image'),
            )
            await expect(problems()).toHaveText(expect.stringContaining("2322"))
            await editSource(projectId, valid)
            await expect(problems()).toHaveText(expect.stringContaining("No problems."))

            await selectIndexedInput(imageId)
            await $("label=I understand and trust this script").click()
            await $("button=Trust this script").click()
            await expect($("p=Trust: trusted")).toBeDisplayed()
            await run().click()
            await waitForRun("succeeded")
            await expect(logs()).toHaveText(expect.stringContaining("package run succeeded"))

            await $("button=Restore packages").click()
            await expect($("p=Trust: untrusted")).toBeDisplayed({ wait: 30_000 })
            await remove.waitForEnabled()
            await expect(problems()).toHaveText(expect.stringContaining("No problems."))
            await remove.click()
            await expect(remove).not.toExist()
            await expect(problems()).toHaveText(expect.stringContaining("2307"))
            await expect(run()).not.toBeEnabled()
        },
    )
})
