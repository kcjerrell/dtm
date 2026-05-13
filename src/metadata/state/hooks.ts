import { useSnapshot } from "valtio"
import type MediaItem from "./mediaItem"
import { getMetadataStore } from "./metadataStore"

export function useCurrentImage(): ReadonlyState<MediaItem> | undefined {
    const snap = useSnapshot(getMetadataStore())
    return snap.currentItem
}
