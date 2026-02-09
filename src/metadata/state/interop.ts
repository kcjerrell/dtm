import AppStore from "@/hooks/appState"
import type { ImageSource } from "@/types"
import type { ImageItem } from "./ImageItem"
import { createImageItem, getMetadataStore, selectImage } from './store'

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
		await AppStore.setView("metadata")
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
