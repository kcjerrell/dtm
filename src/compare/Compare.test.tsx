// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { loadSettingsStore } from "@/state/settings"
import Compare from "./Compare"
import { getCompareStore } from "./state"

const mocks = vi.hoisted(() => ({ decode: vi.fn() }))

vi.mock("@/lifecycle", () => ({ default: { onExit: vi.fn() } }))
vi.mock("@tauri-store/valtio", () => import("@/mocks/tauri-store"))
vi.mock("@/state/mediaStore/files", () => ({
    MediaStoreFiles: {
        saveFile: async (id: string) => ({ fname: `${id}.png`, url: `asset://${id}.png` }),
        removeFile: vi.fn().mockResolvedValue(undefined),
    },
}))

beforeEach(async () => {
    await loadSettingsStore()
    const { state, collection } = await getCompareStore()
    await collection.clear()
    state.isSelectorOpen = false
    state.softRemovedItems.clear()
    state.clearPinsUndo.clear()
    state.loading.a = undefined
    state.loading.b = undefined
    mocks.decode.mockReset().mockResolvedValue(undefined)
    vi.stubGlobal(
        "Image",
        class {
            src = ""
            naturalWidth = 100
            naturalHeight = 100
            decode = mocks.decode
        },
    )
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

async function addItem(pin = false) {
    const store = await getCompareStore()
    const item = await store.addNewItem(new Uint8Array([1]), "png", {})
    if (!item) throw new Error("Missing Compare fixture")
    if (pin) store.pinItem(item.id, true)
    return item
}

function renderCompare() {
    return render(
        <ChakraProvider value={defaultSystem}>
            <Compare />
        </ChakraProvider>,
    )
}

async function click(name: string) {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name }))
    })
}

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

it("keeps selector controls horizontal and offers undo after clearing images", async () => {
    renderCompare()
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Choose comparison images" }))
    })

    const guidance = /send images from projects or metadata/i
    expect(screen.getByText(guidance)).toBeVisible()

    await act(async () => {
        await addItem()
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
        await addItem(true)
    })
    const controlsRow = screen.getByRole("button", { name: "Clear images" }).parentElement
    expect(screen.getByRole("button", { name: "Reset pins" }).parentElement).toBe(controlsRow)
    expect(controlsRow).toHaveStyle({ display: "flex", flexDirection: "row" })
    expect(controlsRow?.firstElementChild).toHaveStyle({ flex: "1 0 0" })
})

it("shows a spinner only over the item being decoded", async () => {
    const store = await getCompareStore()
    const a = await addItem()
    await addItem()
    store.state.isSelectorOpen = true
    renderCompare()
    const decode = Promise.withResolvers<void>()
    mocks.decode.mockReturnValueOnce(decode.promise)
    let pending: Promise<void>
    await act(async () => {
        pending = store.selectItem(a, "A")
    })
    expect(screen.getByRole("status", { name: "Loading image 1" })).toBeVisible()
    expect(screen.queryByRole("status", { name: "Loading image 2" })).toBeNull()
    await act(async () => {
        decode.resolve()
        await pending
    })
    expect(screen.queryByRole("status", { name: "Loading image 1" })).toBeNull()
})

it("invalidates pin restore when clearing images", async () => {
    const store = await getCompareStore()
    await addItem(true)
    store.state.isSelectorOpen = true
    renderCompare()
    await click("Reset pins")
    await click("Clear images")
    expect(store.state.clearPinsUndo.size).toBe(0)
    expect(screen.queryByRole("button", { name: "Undo reset pins" })).toBeNull()
    expect(screen.getByRole("button", { name: "Undo clear images" })).toBeVisible()
    await click("Undo clear images")
    expect(screen.getByRole("img", { name: "Image 1" })).toBeVisible()
})

it("keeps both undo actions after clearing images then resetting pins", async () => {
    const store = await getCompareStore()
    const unpinned = await addItem()
    const pinned = await addItem(true)
    store.state.isSelectorOpen = true
    renderCompare()
    await click("Clear images")
    await click("Reset pins")
    expect(screen.getByRole("button", { name: "Undo clear images" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Undo reset pins" })).toBeVisible()
    await click("Undo reset pins")
    expect(store.state.softRemovedItems.has(unpinned.id)).toBe(true)
    expect(pinned.pin).toBe(1)
    await click("Undo clear images")
    expect(store.state.softRemovedItems.size).toBe(0)
    expect(store.state.items).toHaveLength(2)
    await act(async () => {
        store.state.isSelectorOpen = false
    })
    expect(store.state.items).toHaveLength(2)
})
