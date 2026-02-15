import { Box, Button, VStack } from "@chakra-ui/react"
import { appDataDir, join } from "@tauri-apps/api/path"
import { open } from "@tauri-apps/plugin-dialog"
import { readDir, writeTextFile } from "@tauri-apps/plugin-fs"
import { proxy, useSnapshot } from "valtio"
import { getDrawThingsDataFromExif } from "@/metadata/helpers"
import { getExif } from "@/metadata/state/metadataStore"
import type { DrawThingsMetaData } from "@/types"

const store = proxy({
	files: [] as string[],
	status: "idle" as "idle" | "scanning",
	progress: 0,
})

function Library() {
	const snap = useSnapshot(store)

	return (
		<VStack width={"100vw"} height={"100vh"}>
			<Button
				onClick={async () => {
					const res = await open({ directory: true })
					if (!res) return
					const files = await readDir(res)
					const paths = await Promise.all(files.map(async (f) => await join(res, f.name)))
					store.files = paths.filter((f) => f.endsWith(".png"))
				}}
			>
				Select folder
			</Button>
			{snap.files.length} files selected
			<Button
				disabled={snap.status === "scanning"}
				onClick={async () => {
					store.status = "scanning"
					const data = await scanFiles(snap.files, (done, total) => {
						store.progress = Math.round((done / total) * 100)
					})
					await writeTextFile(await join(await appDataDir(), "test.json"), JSON.stringify(data))
          store.status = "idle"
				}}
			>
				Scan
			</Button>
			<Box>{snap.progress}%</Box>
		</VStack>
	)
}

async function scanFiles(files: Readonly<string[]>, update: (done: number, total: number) => void) {
	const data = [] as { path: string; data: DrawThingsMetaData }[]
	let done = 0
	for (const file of files) {
		const exif = await getExif(file)
		const dt = getDrawThingsDataFromExif(exif)

		if (dt) data.push({ path: file, data: dt })
		done++

		if (done % 50 === 0) update(done, files.length)
	}
	return data
}

export default Library
