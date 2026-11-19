import { proxy } from "valtio"
import { proxyMap, proxySet } from "valtio/utils"
import MediaStore from "@/state/mediaStore"
import {
    type CollectionItem,
    MediaItemAlreadyInCollectionError,
    type MediaItemSource,
} from "@/state/mediaStore/types"
import { getSetting } from "@/state/settings"

type CompareItemState = { pin: number | null }
export type CompareItem = CollectionItem<CompareItemState>

type CompareStoreState = {
    items: CompareItem[]
    imageA: CompareItem | undefined
    imageB: CompareItem | undefined
    loading: { a: string | undefined; b: string | undefined }
    isSelectorOpen: boolean
    softRemovedItems: Set<string>
    clearPinsUndo: Map<string, number>
}

let _store: ReturnType<typeof initStore>

function getStore() {
    if (!_store) {
        _store = initStore()
    }
    return _store
}

function initStore() {
    const collection = MediaStore.defineCollection(
        "icompare",
        { pin: null as number | null },
        {
            allowVideo: false,
            version: 1,
            onItemsChanged: () => {
                const state = getStore().state
                if (state.imageA && !state.items.includes(state.imageA)) {
                    state.imageA = undefined
                }
                if (state.imageB && !state.items.includes(state.imageB)) {
                    state.imageB = undefined
                }
                for (const side of ["a", "b"] as const) {
                    const id = state.loading[side]
                    if (id && !state.items.some((item) => item.id === id)) {
                        state.loading[side] = undefined
                    }
                }
            },
            onExit: () => {
                const clearItems = getSetting("metadata.clearHistoryOnExit")
                const clearPins = getSetting("metadata.clearPinsOnExit")
                state.items.forEach((item) => {
                    const isPinned = !!item.cState.pin
                    if (isPinned && clearPins) item.clearOnExit = true
                    else if (!isPinned && clearItems) item.clearOnExit = true
                })
            },
        },
    )

    const state: CompareStoreState = proxy({
        imageA: undefined,
        imageB: undefined,
        loading: { a: undefined, b: undefined },
        get items() {
            return collection.items
        },
        isSelectorOpen: false,
        softRemovedItems: proxySet(),
        clearPinsUndo: proxyMap(),
    })

    async function addNewItem(data: Uint8Array, type: string, source: MediaItemSource) {
        const result = await collection.importMedia({ buffer: data, type, source })
        if (result.alreadyPresent) throw new MediaItemAlreadyInCollectionError()
        return result.item
    }

    async function addMediaItem(id: string) {
        return await collection.addExisting(id)
    }

    async function selectItem(
        item: { id: string } | undefined,
        side: "A" | "B" | "firstEmpty" | "firstEmptyOrB",
    ) {
        if (!item) {
            if (side === "A") {
                state.loading.a = undefined
                state.imageA = undefined
            }
            if (side === "B") {
                state.loading.b = undefined
                state.imageB = undefined
            }
            return
        }

        const cItem = state.items.find((it) => it.id === item?.id)
        if (!cItem || state.softRemovedItems.has(cItem.id)) return

        if (side === "firstEmpty") {
            if (!state.imageA && !state.loading.a) side = "A"
            else if (!state.imageB && !state.loading.b) side = "B"
            else return
        }
        if (side === "firstEmptyOrB") {
            side = !state.imageA && !state.loading.a ? "A" : "B"
        }

        const slot = side === "A" ? "a" : "b"
        state.loading[slot] = cItem.id
        try {
            const preload = new Image()
            preload.src = cItem.url
            await preload.decode()

            if (state.loading[slot] !== cItem.id) return
            if (!state.items.includes(cItem) || state.softRemovedItems.has(cItem.id)) return
            if (side === "A") state.imageA = cItem
            else state.imageB = cItem
        } catch (error) {
            if (state.loading[slot] === cItem.id) throw error
        } finally {
            if (state.loading[slot] === cItem.id) state.loading[slot] = undefined
        }
    }

    function clearSelection(id: string) {
        if (state.loading.a === id) state.loading.a = undefined
        if (state.loading.b === id) state.loading.b = undefined
        if (state.imageA?.id === id) state.imageA = undefined
        if (state.imageB?.id === id) state.imageB = undefined
    }

    function clearItems() {
        state.clearPinsUndo.clear()
        for (const item of state.items) {
            if (item.pin) continue
            state.softRemovedItems.add(item.id)
            clearSelection(item.id)
        }
    }

    async function removeItem(item: { id: string }) {
        state.clearPinsUndo.clear()
        clearSelection(item.id)
        await collection.removeItems([item.id])
    }

    function pinItem(id: string, value: boolean | number) {
        const item = collection.getItemById(id)
        if (!item) return
        const newValue = typeof value === "number" ? value : value ? Number.POSITIVE_INFINITY : null
        item.pin = newValue
        reconcilePins()
        state.clearPinsUndo.clear()
    }

    function reconcilePins() {
        const pinned = collection.items.filter((item) => item.pin)
        pinned.sort((a, b) => (a.pin ?? 0) - (b.pin ?? 0))
        for (let i = 0; i < pinned.length; i++) {
            pinned[i].pin = i + 1
        }
    }

    function clearPins() {
        for (const item of collection.items) {
            if (!item.pin) continue
            item.pin = null
        }
    }

    return {
        state,
        collection,
        addNewItem,
        addMediaItem,
        selectItem,
        removeItem,
        clearItems,
        pinItem,
        clearPins,
    }
}

export function useCompareStore() {
    return getStore()
}

export async function getCompareStore() {
    const store = getStore()
    await store.collection.waitForReady()
    return store
}
