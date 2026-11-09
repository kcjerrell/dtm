import { toaster } from "@/components/ui/toaster"
import AppStore from "@/hooks/appState"
import { MediaItemAlreadyInCollectionError, type MediaItemSource } from "@/state/mediaStore/types"
import type { CompareItem, getCompareStore } from "./state"

export async function addNewItem(data: Uint8Array, type: string, source: MediaItemSource) {
    await sendToCompare((store) => store.addNewItem(data, type, source))
}

export async function addMediaItem(id: string) {
    await sendToCompare((store) => store.addMediaItem(id))
}

async function sendToCompare(
    add: (store: Awaited<ReturnType<typeof getCompareStore>>) => Promise<CompareItem | undefined>,
) {
    const title = "Image added to Compare"
    let added = false
    try {
        const { getCompareStore } = await import("./state")
        const store = await getCompareStore()
        const item = await add(store)
        if (!item) throw new Error("The added image is unavailable in Compare")

        added = true
        AppStore.store.sidebarActivity.compare = true
        await store.selectItem(item, "firstEmpty")
        toaster.create({ title, type: "success" })
    } catch (error) {
        if (error instanceof MediaItemAlreadyInCollectionError) {
            toaster.create({ title: "Image already in Compare", type: "info" })
        } else if (added) {
            toaster.create({
                title,
                type: "warning",
                description: `Could not display the image. ${getErrorMessage(error)}`,
            })
        } else {
            notifyCompareError(error)
        }
    }
}

export function notifyCompareError(error: unknown) {
    toaster.create({
        title: "Could not add image to Compare",
        type: "error",
        description: getErrorMessage(error),
    })
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}
