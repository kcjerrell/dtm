import { exists, readDir } from "@tauri-apps/plugin-fs"
import { DTProjectsState } from "./projectStore"
import path from "path"
import { WatchFolderType } from './watchFolders'

export class ScannerService {
	#state: DTProjectsState
	constructor(state: DTProjectsState) {
		this.#state = state
	}

	async scanFolder(folder: WatchFolderType) {
		try {
      if (!(await exists(folder.path))) {
        folder.isMissing = true
        return []
      }
      folder.isMissing = false
			const dirFiles = (await readDir(folder.path)).filter((f) => f.name.endsWith(".sqlite3"))
			const files = await Promise.all(
				dirFiles.map(async (f) => await path.join(folder.path, f.name)),
			)
			return files
		} catch (e) {
			console.error(e)
			return []
		}
	}
}
