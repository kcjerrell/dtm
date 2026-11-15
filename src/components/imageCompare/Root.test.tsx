// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import Root from "./Root"

vi.mock("@/state/settings", () => ({
    useSetting: () => ["compare"],
    useSettingRef: () => ({ current: "pinch" }),
}))

beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    )
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

function setup() {
    render(
        <ChakraProvider value={defaultSystem}>
            <Root />
        </ChakraProvider>,
    )
}

async function cycleMode(shiftKey: boolean) {
    await act(async () => {
        fireEvent.keyDown(document.body, { code: "Tab", shiftKey })
    })
}

it("settles on the latest settings after consecutive mode changes", async () => {
    setup()

    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Align" }))
    })
    const reset = screen.getByRole("button", { name: "Reset alignment" })

    await cycleMode(true)
    const vertical = screen.getByRole("button", { name: "Vertical layout" })

    await waitFor(() => expect(reset.isConnected).toBe(false))
    expect(screen.getByRole("button", { name: "Vertical layout" })).toBe(vertical)
})

it("restores the selected layout when returning to side-by-side mode", async () => {
    setup()
    await cycleMode(true)
    await cycleMode(true)

    const horizontal = screen.getByRole("button", { name: "Horizontal layout" })
    await act(async () => {
        fireEvent.click(horizontal)
    })
    expect(horizontal.getAttribute("aria-pressed")).toBe("true")

    await cycleMode(false)
    await waitFor(() => expect(horizontal.isConnected).toBe(false))
    await cycleMode(true)

    expect(screen.getByRole("button", { name: "Horizontal layout", pressed: true })).toBeTruthy()
})
