// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { proxy, useSnapshot } from "valtio"
import { proxyMap, proxySet } from "valtio/utils"
import { afterEach, expect, it, vi } from "vitest"
import { loadSettingsStore } from "@/state/settings"
import Compare from "./Compare"

const state = proxy({
    isSelectorOpen: false,
    items: [] as { id: string; pin: number | null; url: string }[],
    softRemovedItems: proxySet<string>(),
    clearPinsUndo: proxyMap<string, number>(),
})

vi.mock("./state", () => ({
    useCompareStore: () => ({
        state,
        collection: { useItemsSnap: () => useSnapshot(state).items },
    }),
}))
vi.mock("@tauri-store/valtio", () => import("@/mocks/tauri-store"))

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

it("keeps selector controls horizontal and offers undo after clearing images", async () => {
    await loadSettingsStore()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    )
    render(
        <ChakraProvider value={defaultSystem}>
            <Compare />
        </ChakraProvider>,
    )
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Choose comparison images" }))
    })

    const guidance = /send images from projects or metadata/i
    expect(screen.getByText(guidance)).toBeVisible()

    await act(async () => {
        state.items.push({ id: "example", pin: null, url: "example.png" })
    })
    expect(screen.queryByText(guidance)).toBeNull()
    expect(screen.getByRole("img", { name: "Image 1" })).toBeVisible()

    const clearImages = screen.getByRole("button", { name: "Clear images" })
    expect(clearImages.parentElement).toHaveStyle({ display: "flex" })
    await act(async () => {
        fireEvent.click(clearImages)
    })
    expect(screen.getByText(guidance)).toBeVisible()

    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Undo clear images" }))
    })
    expect(screen.queryByText(guidance)).toBeNull()
    expect(screen.getByRole("img", { name: "Image 1" })).toBeVisible()

    await act(async () => {
        state.items.push({ id: "pinned", pin: 1, url: "pinned.png" })
    })
    const controlsRow = screen.getByRole("button", { name: "Clear images" }).parentElement
    expect(screen.getByRole("button", { name: "Reset pins" }).parentElement).toBe(controlsRow)
    expect(controlsRow).toHaveStyle({ display: "flex", flexDirection: "row" })
    expect(controlsRow?.firstElementChild).toHaveStyle({ flex: "1 0 0" })
})
