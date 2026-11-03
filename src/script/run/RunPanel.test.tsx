// @vitest-environment jsdom
import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, expect, it } from "vitest"
import type { SourceRevision } from "../contracts"
import { ScriptPreview } from "../preview/ScriptPreview"
import { ScriptLogs, ScriptProblems, ScriptRunPanel } from "./RunPanel"
import { failure, harness, identity, output, request } from "./testHelpers"

beforeAll(() => {
    window.matchMedia ??= (query) =>
        ({
            matches: false,
            media: query,
            addEventListener() {},
            removeEventListener() {},
        }) as unknown as MediaQueryList
})
afterEach(cleanup)

it("requires warning acknowledgement, renders status, and enables Stop only for a live run", async () => {
    const h = harness()
    render(
        <ChakraProvider value={defaultSystem}>
            <ScriptRunPanel
                controller={h.controller}
                onRun={() => {
                    void h.controller.run(request())
                }}
            />
        </ChakraProvider>,
    )
    const run = screen.getByRole("button", { name: "Run" }) as HTMLButtonElement
    const stop = screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement
    const trust = screen.getByRole("button", { name: "Trust this script" }) as HTMLButtonElement
    expect(run.disabled).toBe(true)
    expect(stop.disabled).toBe(true)
    expect(trust.disabled).toBe(true)
    expect(screen.getByText(/Bun does not sandbox scripts/)).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: "I understand and trust this script" }))
    fireEvent.click(trust)
    await waitFor(() => expect(run.disabled).toBe(false))
    expect(h.commands.run).not.toHaveBeenCalled()
    fireEvent.click(run)
    await waitFor(() => expect(stop.disabled).toBe(false))
    fireEvent.click(stop)
    await waitFor(() => expect(screen.getByRole("button", { name: "Stopping…" })).toBeTruthy())
    await act(async () => {
        h.emit({ type: "cancelled", identity: identity(), reason: "user" })
    })
    expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("status").textContent).toContain("cancelled")
    h.controller.dispose()
})

it("renders separate bounded logs/problems and a stale last-good opaque preview without local paths", async () => {
    const h = harness()
    await h.controller.trust(true)
    await h.controller.run(request())
    h.emit({ type: "succeeded", identity: identity(), output })
    render(
        <ChakraProvider value={defaultSystem}>
            <ScriptProblems controller={h.controller} />
            <ScriptLogs controller={h.controller} />
            <ScriptPreview controller={h.controller} />
        </ChakraProvider>,
    )
    const next = request("request-2", 2)
    await act(async () => {
        h.controller.setDesiredRevisions({ ...identity(), sourceRevision: 2 as SourceRevision })
        await h.controller.run(next)
        h.emit({
            type: "log",
            identity: identity(next),
            stream: "stderr",
            message: "Read /Users/person/private/input.png\n",
        })
        h.emit({
            type: "log",
            identity: identity(next),
            stream: "stdout",
            message: "x".repeat(70_000),
        })
        h.emit({ type: "failed", identity: identity(next), diagnostic: failure })
    })
    expect(screen.getByRole("region", { name: "Script problems" }).textContent).toContain(
        "userRuntime",
    )
    expect(screen.getByRole("region", { name: "Script logs" }).textContent).toContain(
        "Logs truncated",
    )
    expect(screen.getByRole("region", { name: "Script preview" }).textContent).toContain(
        "Stale preview · source 1, values 0, inputs 0",
    )
    expect(screen.getByRole("img", { name: "Script output" }).getAttribute("src")).toBe(
        output.previewUrl,
    )
    expect(document.body.textContent).not.toContain("/Users/person")
    expect(document.body.textContent).toContain("[local path]")
    h.controller.dispose()
})

it.each([false, true])(
    "offers trust review after rejected admission (terminal first: %s)",
    async (terminalFirst) => {
        const h = harness()
        await h.controller.trust(true)
        h.commands.run.mockImplementationOnce(async (next) => {
            if (terminalFirst) {
                h.emit({ type: "queued", identity: identity(next) })
                h.emit({ type: "failed", identity: identity(next), diagnostic: failure })
            }
            throw new Error("project trust revoked")
        })
        await h.controller.run(request())
        render(
            <ChakraProvider value={defaultSystem}>
                <ScriptRunPanel controller={h.controller} onRun={() => {}} />
            </ChakraProvider>,
        )
        fireEvent.click(screen.getByRole("button", { name: "Review trust" }))
        await waitFor(() =>
            expect(
                screen.getByRole("checkbox", { name: "I understand and trust this script" }),
            ).toBeTruthy(),
        )
        expect(
            (screen.getByRole("button", { name: "Trust this script" }) as HTMLButtonElement)
                .disabled,
        ).toBe(true)
        expect((screen.getByRole("button", { name: "Run" }) as HTMLButtonElement).disabled).toBe(
            true,
        )
        h.controller.dispose()
    },
)
