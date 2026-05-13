import { updateSetting } from "@/state/settings"
import type { ImageSource } from "@/types"
import { ImageItem } from "./ImageItem"
import { loadImage2 } from "./imageLoaders"
import type MediaItem from "./mediaItem"
import { addImageItem, getMetadataStore, selectImage, waitForMetadataStore } from "./metadataStore"

export async function sendToMetadata(
    imageData: Uint8Array<ArrayBuffer>,
    type: string,
    source: ImageSource,
) {
    // check if the item already has been sent to the store
    // const state = getMetadataStore()
    // let imageItem = state.items.find((im) =>
    //     compareImageSource(im.source, source),
    // ) as Nullable<MediaItem>

    // if (!imageItem) {
    await waitForMetadataStore()
    const image = await ImageItem.fromBuffer(imageData, type, source)
    if (image) {
        let imageItem: MediaItem = image
        imageItem = addImageItem(image)
        if (imageItem) {
            selectImage(imageItem)
            updateSetting("app.currentView", "metadata")
        }
    }
    // }
}

export function handleDrop(data: unknown) {
    if (data === "drag") {
        updateSetting("app.currentView", "metadata")
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
