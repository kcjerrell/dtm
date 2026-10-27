import { proxy } from "valtio"
import MediaStore from "@/state/mediaStore"
import type { MediaItemBase } from "@/state/mediaStore/MediaItem"
import type { MediaItemSource } from "@/state/mediaStore/types"
import { getSetting } from "@/state/settings"

type CompareItemState = { pin: number | null }
export type CompareItem = MediaItemBase<CompareItemState>

type CompareStoreState = {
    items: CompareItem[]
    imageA: CompareItem | undefined
    imageB: CompareItem | undefined
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
            version: 1,
            onItemsChanged: () => {
                const state = getStore().state
                if (state.imageA && !state.items.includes(state.imageA)) {
                    state.imageA = undefined
                }
                if (state.imageB && !state.items.includes(state.imageB)) {
                    state.imageB = undefined
                }
            },
            onExit: () => {
                const clearItems = getSetting("metadata.clearHistoryOnExit")
                const clearPins = getSetting("metadata.clearPinsOnExit")
                state.items.forEach((item) => {
                    const isPinned = !!item.cState.pin
                    if (isPinned && clearPins) item.clearOnExit = true
                    else if (!isPinned && clearItems) item.clearOnExit = true
                    console.log("clear on exit", item.clearOnExit)
                })
            },
        },
    )

    const state: CompareStoreState = proxy({
        imageA: undefined,
        imageB: undefined,
        items: collection.items,
    })

    async function addNewItem(data: Uint8Array, type: string, source: MediaItemSource) {
        const item = await collection.addItem(data, type, source)
        selectItem(item, "firstEmpty")
    }

    async function addMediaItem(id: string) {
        if (!state.items.some((it) => it.id === id)) await collection.addExisting(id)
        selectItem({ id }, "firstEmpty")
    }

    function selectItem(item: { id: string } | undefined, side: "A" | "B" | "firstEmpty") {
        console.log("select item")
        const cItem = state.items.find((it) => it.id === item?.id)
        if (!cItem) return
        if (side === "A") state.imageA = cItem
        if (side === "B") state.imageB = cItem
        if (side === "firstEmpty") {
            console.log(cItem, state.imageA, state.imageB)
            if (!state.imageA) state.imageA = cItem
            else if (!state.imageB) state.imageB = cItem
        }
        console.log(state.imageA, state.imageB)
    }

    return {
        state,
        collection,
        addNewItem,
        addMediaItem,
        selectItem,
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
