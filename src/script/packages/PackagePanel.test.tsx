// @vitest-environment jsdom
import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, expect, it, vi } from "vitest"
import type { ProjectId } from "../contracts"
import type { PackageCommands, ScriptDependencyStatus } from "./adapters"
import { ScriptPackageController } from "./controller"
import { ScriptPackagePanel } from "./PackagePanel"

beforeAll(() => {
    window.matchMedia ??= (query: string) =>
        ({
            matches: false,
            media: query,
            addListener() {},
            removeListener() {},
        }) as unknown as MediaQueryList
})
afterEach(cleanup)

it("keeps install scripts off for ordinary restore and requires a fresh explicit approval", async () => {
    const projectId = "project" as ProjectId
    const status: ScriptDependencyStatus = {
        dependencies: { widget: "1.0.0" },
        revision: "revision",
        lockFingerprint: "fingerprint",
        installed: true,
    }
    const restore = vi
        .fn<PackageCommands["restore"]>()
        .mockResolvedValueOnce(status)
        .mockRejectedValueOnce(new Error("Restore failed"))
    const controller = new ScriptPackageController({
        commands: {
            status: async () => status,
            set: vi.fn(),
            restore,
            cancel: vi.fn(),
            declarations: async () => ({ revision: "revision", files: [], truncated: false }),
        },
        declarations: { replace() {}, clear() {} },
        canChange: () => true,
        onStart() {},
        onRevisionChange() {},
    })
    controller.activate(projectId, "file:///project/process.ts")
    render(
        <ChakraProvider value={defaultSystem}>
            <ScriptPackagePanel controller={controller} projectId={projectId} canChange />
        </ChakraProvider>,
    )
    fireEvent.click(screen.getByText(/^Packages/))
    const ordinary = await screen.findByRole<HTMLButtonElement>("button", {
        name: "Restore packages",
    })
    await waitFor(() => expect(ordinary.disabled).toBe(false))
    fireEvent.click(ordinary)
    expect(restore).toHaveBeenNthCalledWith(
        1,
        {
            projectId,
            operationId: expect.any(String),
            expectedPackageState: { revision: "revision" },
            lifecycleApproval: undefined,
        },
        expect.any(Function),
    )

    fireEvent.click(screen.getByText("Install script approval"))
    const approved = screen.getByRole<HTMLButtonElement>("button", {
        name: "Restore with approved scripts",
    })
    const hook = screen.getByRole<HTMLInputElement>("checkbox", { name: "widget" })
    expect(approved.disabled).toBe(true)
    await waitFor(() => expect(hook.disabled).toBe(false))
    fireEvent.click(hook)
    expect(approved.disabled).toBe(true)
    const confirmation = screen.getByRole<HTMLInputElement>("checkbox", {
        name: "I approve these install scripts for this restore",
    })
    await waitFor(() => expect(confirmation.disabled).toBe(false))
    fireEvent.click(confirmation)
    await waitFor(() => expect(approved.disabled).toBe(false))
    fireEvent.click(approved)
    expect(restore).toHaveBeenNthCalledWith(
        2,
        {
            projectId,
            operationId: expect.any(String),
            expectedPackageState: { revision: "revision" },
            lifecycleApproval: { lockFingerprint: "fingerprint", packages: ["widget"] },
        },
        expect.any(Function),
    )
    expect((await screen.findByRole("alert")).textContent).toBe("Restore failed")
    await waitFor(() => expect(ordinary.disabled).toBe(false))
    expect(approved.disabled).toBe(true)
    controller.dispose()
})
