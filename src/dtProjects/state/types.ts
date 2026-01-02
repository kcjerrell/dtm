import type { WatchFolderState } from "./watchFolders"

export type DTPEvents = {
	watchFoldersChanged: (e: WatchFoldersChangedPayload) => void
	projectFilesChanged: (e: ProjectFilesChangedPayload) => void
}

interface WatchFoldersChangedPayload {
	added: WatchFolderState[]
	removed: WatchFolderState[]
	changed: WatchFolderState[]
}

interface ProjectFilesChangedPayload {
	files: string[]
}