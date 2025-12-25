import { createContext, type PropsWithChildren } from "react"
import type { ImageSource } from "@/types"
import type { ImageItem } from "./ImageItem"
import type { ExifType, ImageItemParam, MetadataStore } from "./store"

export type MetadataStoreContextType = {
	state: typeof MetadataStore
	selectImage(image?: ImageItemParam | null): void
	pinImage(image: ImageItemParam, value: number | boolean | null): void
	pinImage(useCurrent: true, value: number | boolean | null): void
	clearAll(keepTabs: boolean): Promise<void>
	clearCurrent(): Promise<void>
	createImageItem(
		imageData: Uint8Array<ArrayBuffer>,
		type: string,
		source: ImageSource,
	): Promise<ImageItem | null>
	getExif(imagePath: string): Promise<ExifType | null>
	getExif(imageDataBuffer: ArrayBuffer): Promise<ExifType | null>
	initialized: boolean
}

const MetadataStoreContext = createContext<Partial<MetadataStoreContextType>>({
	initialized: false,
})

export function useMetadataStore() {
	const context = useContext(MetadataStoreContext)
	if (!context) throw new Error("useMetadataStore must be used within a MetadataStoreProvider")
	return context
}

export function MetadataStoreProvider(props: PropsWithChildren) {}
