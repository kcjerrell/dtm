import AppStore from "@/hooks/appState"
import type { ImageSource } from "@/types"
import type { ImageItem } from "./ImageItem"
import { loadImage2 } from "./imageLoaders"
import { createImageItem, getMetadataStore, selectImage } from "./metadataStore"

export async function sendToMetadata(
    imageData: Uint8Array<ArrayBuffer>,
    type: string,
    source: ImageSource,
) {
    // check if the item already has been sent to the store
    const state = getMetadataStore()
    let imageItem = state.images.find((im) =>
        compareImageSource(im.source, source),
    ) as Nullable<ImageItem>
    imageItem ??= await createImageItem(imageData, type, source)

    if (imageItem) {
        selectImage(imageItem)
        AppStore.setView("metadata")
    }
}

export function handleDrop(data: unknown) {
    if (data === "drag") {
        AppStore.setView("metadata")
        loadImage2("drag")
    }
}

function compareImageSource(a: ImageSource, b: ImageSource) {
    if (a.source !== b.source) return false
    if (a.file !== b.file) return false
    if (a.url !== b.url) return false
    if (a.projectFile !== b.projectFile) return false
    if (a.tensorId !== b.tensorId) return false
    if (a.nodeId !== b.nodeId) return false
    return true
}
