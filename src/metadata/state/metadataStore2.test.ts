import { beforeEach, describe, expect, it, vi } from "vitest"

const collection = vi.hoisted(() => ({
    items: [] as { id: string; pin: number | null }[],
    waitForReady: vi.fn<() => Promise<void>>(),
    removeItems: vi.fn<(ids: string[]) => Promise<void>>(),
    clear: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/state/mediaStore", () => ({
    default: { defineCollection: () => collection },
}))
vi.mock("@/state/settings", () => ({ getSetting: () => false }))

beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    collection.items = []
    collection.waitForReady.mockResolvedValue(undefined)
    collection.removeItems.mockResolvedValue(undefined)
    collection.clear.mockResolvedValue(undefined)
})

describe("metadata clearing", () => {
    it("waits for hydration before finding unpinned items and awaits their removal", async () => {
        const loading = Promise.withResolvers<void>()
        const cleanup = Promise.withResolvers<void>()
        collection.waitForReady.mockImplementation(async () => {
            await loading.promise
        })
        collection.removeItems.mockImplementation(async () => {
            await cleanup.promise
        })
        const { useMetadataStore } = await import("./metadataStore2")
        const store = useMetadataStore()
        const complete = vi.fn()
        async function clearUnpinned() {
            await store.clearAll(true)
            complete()
        }
        const pending = clearUnpinned()
        expect(collection.removeItems).not.toHaveBeenCalled()
        collection.items = [
            { id: "pinned", pin: 1 },
            { id: "unpinned", pin: null },
        ]
        loading.resolve()
        await vi.waitFor(() =>
            expect(collection.removeItems).toHaveBeenCalledExactlyOnceWith(["unpinned"]),
        )
        expect(complete).not.toHaveBeenCalled()
        cleanup.resolve()
        await pending
        expect(complete).toHaveBeenCalledOnce()
    })

    it.each([true, false])("propagates clearing failures with keepPins=%s", async (keepPins) => {
        const error = new Error("cleanup failed")
        collection.removeItems.mockRejectedValue(error)
        collection.clear.mockRejectedValue(error)
        const { useMetadataStore } = await import("./metadataStore2")
        await expect(useMetadataStore().clearAll(keepPins)).rejects.toBe(error)
    })
})
