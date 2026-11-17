import { expect, it, vi } from "vitest"
import type { ProjectId } from "../contracts"
import { deferred } from "../controls/testHelpers"
import type {
    DependencyDeclarations,
    InstallProgress,
    PackageCommands,
    ScriptDependencyStatus,
} from "./adapters"
import { ScriptPackageController } from "./controller"

const one = "one" as ProjectId
const two = "two" as ProjectId

const installed = (revision: string): ScriptDependencyStatus => ({
    dependencies: { widget: "1.0.0" },
    revision,
    installed: true,
    lockFingerprint: "locked-widget",
})

const response = (revision: string): DependencyDeclarations => ({
    revision,
    files: [{ path: "node_modules/widget/index.d.ts", content: "export const value: number;" }],
    truncated: false,
})

function setup() {
    const commands = {
        status: vi.fn<PackageCommands["status"]>(async (id) => installed(id)),
        declarations: vi.fn<PackageCommands["declarations"]>(async (_, revision) =>
            response(revision),
        ),
        set: vi.fn<PackageCommands["set"]>(),
        restore: vi.fn<PackageCommands["restore"]>(),
        cancel: vi.fn<PackageCommands["cancel"]>(),
    }
    const declarations = { replace: vi.fn(), clear: vi.fn() }
    const onRevisionChange = vi.fn()
    const controller = new ScriptPackageController({
        commands,
        declarations,
        canChange: () => true,
        onStart() {},
        onRevisionChange,
    })
    return { commands, declarations, controller, onRevisionChange }
}

it("discards declaration results from a previous project after switching", async () => {
    const { controller, commands, declarations } = setup()
    const first = deferred<DependencyDeclarations>()
    commands.declarations.mockImplementationOnce(() => first.promise)
    controller.activate(one, "file:///one/process.ts")
    await vi.waitFor(() => expect(commands.declarations).toHaveBeenCalledWith(one, one))
    controller.activate(two, "file:///two/process.ts")
    await vi.waitFor(() =>
        expect(declarations.replace).toHaveBeenCalledWith(
            "file:///two/process.ts",
            response(two).files,
        ),
    )
    first.resolve(response(one))
    await first.promise
    expect(declarations.replace).toHaveBeenCalledOnce()
    expect(declarations.clear).toHaveBeenCalled()
    expect(controller.readyRevision(two)).toBe(two)
})

it("cancels a correlated operation after navigating and ignores delayed progress", async () => {
    const { controller, commands, onRevisionChange } = setup()
    controller.activate(one, "file:///one/process.ts")
    await vi.waitFor(() =>
        expect(controller.state.loadingTypes || controller.state.loading).toBe(false),
    )
    const install = deferred<ScriptDependencyStatus>()
    let report: ((progress: InstallProgress) => void) | undefined
    let operationId = ""
    commands.restore.mockImplementationOnce((request, listener) => {
        operationId = request.operationId
        report = listener
        return install.promise
    })
    commands.cancel.mockResolvedValueOnce(true)
    const restore = controller.restore(one, one, {
        lockFingerprint: "locked-widget",
        packages: ["widget"],
    })
    expect(commands.restore).toHaveBeenCalledWith(
        {
            projectId: one,
            operationId,
            expectedPackageState: { revision: one },
            lifecycleApproval: { lockFingerprint: "locked-widget", packages: ["widget"] },
        },
        expect.any(Function),
    )
    controller.activate(two, "file:///two/process.ts")
    report?.({ operationId: "unrelated", phase: "failed" })
    expect(controller.state.operation?.phase).toBe("preparing")
    await controller.cancel()
    expect(commands.cancel).toHaveBeenCalledWith(one, operationId)
    report?.({ operationId, phase: "cancelled" })
    install.reject(new Error("script package installation cancelled"))
    expect(await restore).toBe(false)
    report?.({ operationId, phase: "failed", message: "delayed report" })
    expect(controller.state.operation).toBeNull()
    expect(controller.state.operationError).toBeNull()
    expect(controller.state.status?.revision).toBe(two)
    expect(onRevisionChange).not.toHaveBeenCalled()
})
