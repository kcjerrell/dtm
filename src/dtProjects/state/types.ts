import type { WatchFolderState } from "./watchFolders"

export type DTPEvents = {
	watchFoldersChanged: (e: WatchFoldersChangedPayload) => void
}

type WatchFoldersChangedPayload = {
	added: WatchFolderState[]
	removed: WatchFolderState[]
	changed: WatchFolderState[]
}
