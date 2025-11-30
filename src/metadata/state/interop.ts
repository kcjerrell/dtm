import AppState from "@/hooks/appState"
import type { ImageSource } from "@/types"
import type { ImageItem } from "./ImageItem"

let _metadataStore: typeof import("./store")
async function getStore() {
	if (!_metadataStore) {
		_metadataStore = await import("./store")
	}
	return _metadataStore
}

export async function sendToMetadata(
	imageData: Uint8Array<ArrayBuffer>,
	type: string,
	source: ImageSource,
) {
	const store = await getStore()

	// check if the item already has been sent to the store
	let imageItem = store.MetadataStore.images.find((im) =>
		compareImageSource(im.source, source),
	) as Nullable<ImageItem>
	imageItem ??= await store.createImageItem(imageData, type, source)

	if (imageItem) {
		store.selectImage(imageItem)
		await AppState.setView("metadata")
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
