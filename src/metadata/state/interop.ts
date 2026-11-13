import { Mutex } from "async-mutex"
import { toaster } from "@/components/ui/toaster"
import type { MediaItemSource } from "@/state/mediaStore/types"
import { updateSetting } from "@/state/settings"
import { type LoadedMedia, loadImageFromFile } from "./imageLoaders"
import { getMetadataStore } from "./metadataStore2"

export async function sendToMetadata(
    imageData: Uint8Array<ArrayBuffer>,
    type: string,
    source: MediaItemSource,
) {
    await showImportedMedia(async () => ({ buffer: imageData, type, source }))
}

export async function openMetadataImage(file: string) {
    await showImportedMedia(() => loadImageFromFile(file, { loadedFrom: "open" }))
}

async function showImportedMedia(load: () => Promise<LoadedMedia | undefined>) {
    try {
        const media = await load()
        if (!media) throw new Error("No supported image data available")
        const mdStore = await getMetadataStore()
        const { item, alreadyPresent } = await mdStore.collection.importMedia(media)
        if (!item) throw new Error("The imported image is unavailable in Metadata")
        mdStore.selectImage(item.id)
        updateSetting("app.currentView", "metadata")
        if (alreadyPresent) notifyMetadataDuplicate(item.isVideo)
    } catch (error) {
        notifyMetadataError(error)
    }
}

const pasteboardLoadMutex = new Mutex()

export async function loadImage2(pasteboard: "general" | "drag") {
    try {
        const mdStore = await getMetadataStore()
        await pasteboardLoadMutex.runExclusive(async () => {
            mdStore.state.isLoadingImage = true
            try {
                const results = await mdStore.collection.importMediaFromPasteboard(
                    pasteboard,
                    notifyMetadataError,
                )
                const lastItem = results.at(-1)?.item
                if (lastItem) {
                    await lastItem.hasMetadata()
                    mdStore.selectImage(lastItem.id)
                    updateSetting("app.currentView", "metadata")
                }
                const duplicates = results.filter(({ alreadyPresent }) => alreadyPresent)
                if (duplicates.length === 1) notifyMetadataDuplicate(duplicates[0].item.isVideo)
                else if (duplicates.length) {
                    toaster.create({ title: `${duplicates.length} items already in Metadata`, type: "info" })
                }
            } finally {
                mdStore.state.isLoadingImage = false
            }
        })
    } catch (error) {
        notifyMetadataError(error)
    }
}

export function handleDrop(data: unknown) {
    if (data === "drag") {
        updateSetting("app.currentView", "metadata")
        loadImage2("drag")
    }
}

function notifyMetadataDuplicate(isVideo?: boolean) {
    toaster.create({ title: isVideo ? "Video already in Metadata" : "Image already in Metadata", type: "info" })
}

export function notifyMetadataError(error: unknown) {
    toaster.create({
        title: "Could not import into Metadata",
        type: "error",
        description: error instanceof Error ? error.message : String(error),
    })
}
