import { updateSetting } from "@/state/settings"
import type { ImageSource } from "@/types"
import { getMetadataStore } from "./metadataStore2"

export async function sendToMetadata(
    imageData: Uint8Array<ArrayBuffer>,
    type: string,
    source: ImageSource,
) {
    const mdStore = await getMetadataStore()
    await mdStore.addItem(imageData, type, source)
    updateSetting("app.currentView", "metadata")
}

export async function loadImage2(pasteboard: "general" | "drag") {
    const mdStore = await getMetadataStore()
    mdStore.state.isLoadingImage = true
    try {
        const items = await mdStore.collection.addImageFromPasteboard(pasteboard)
        const lastItem = items.at(-1)
        if (lastItem) mdStore.selectImage(lastItem.id)
    } catch (e) {
        console.error("error loading image", e)
    } finally {
        mdStore.state.isLoadingImage = false
    }
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
