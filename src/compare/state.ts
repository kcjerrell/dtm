import { Mutex } from "async-mutex"
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
    const addItemMutex = new Mutex()
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
                })
            },
        },
    )

    const state: CompareStoreState = proxy({
        imageA: undefined,
        imageB: undefined,
        get items() {
            return collection.items
        },
        isSelectorOpen: false,
        softRemovedItems: proxySet(),
        clearPinsUndo: proxyMap(),
    })

    async function addNewItem(data: Uint8Array, type: string, source: MediaItemSource) {
        return await addItemMutex.runExclusive(async () => {
            await collection.waitForReady()
            const { projectFile, tensorId } = source
            if (
                projectFile &&
                tensorId &&
                collection.items.some(
                    (item) =>
                        item.source.projectFile === projectFile &&
                        item.source.tensorId === tensorId,
                )
            ) {
                throw new MediaItemAlreadyInCollectionError()
            }
            return await collection.addItem(data, type, source)
        })
    }

    async function addMediaItem(id: string) {
        return await addItemMutex.runExclusive(() => collection.addExisting(id))
    }

    async function selectItem(
        item: { id: string } | undefined,
        side: "A" | "B" | "firstEmpty" | "firstEmptyOrB",
    ) {
        if (!item) {
            if (side === "A") state.imageA = undefined
            if (side === "B") state.imageB = undefined
            return
        }

        const cItem = state.items.find((it) => it.id === item?.id)
        if (!cItem) return

        const preload = new Image()
        preload.src = cItem.url
        await preload.decode()

        if (side === "A") state.imageA = cItem
        if (side === "B") state.imageB = cItem
        if (side === "firstEmpty") {
            if (!state.imageA) state.imageA = cItem
            else if (!state.imageB) state.imageB = cItem
        }
        if (side === "firstEmptyOrB") {
            if (!state.imageA) state.imageA = cItem
            else state.imageB = cItem
        }
    }

    async function removeItem(item: { id: string }) {
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
