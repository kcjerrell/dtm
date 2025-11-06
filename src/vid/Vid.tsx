import { CheckRoot } from "@/components"
import { clipboardTextTypes, parseText } from "@/metadata/state/imageLoaders"
import { getClipboardText, getClipboardTypes } from "@/utils/clipboard"
import {
	Box,
	Button,
	Center,
	createListCollection,
	HStack,
	Input,
	Select,
	VStack,
} from "@chakra-ui/react"
import { useCallback, useMemo, useRef, useState } from "react"
import { proxy, useSnapshot } from "valtio"
import { Command } from "@tauri-apps/plugin-shell"
import { writeTextFile } from "@tauri-apps/plugin-fs"
import { appCacheDir, appDataDir } from "@tauri-apps/api/path"
import { convertFileSrc } from "@tauri-apps/api/core"

const interpolationCollection = createListCollection({
	items: ["none", "simple", "blend", "motion", "interpolate"],
})

type StoreType = {
	types: string[]
	clips: string[]
	stdout: string[]
	stderr: string[]
	output: string
	mode: string
	fps: number
	status: string
}

function Vid(props: ChakraProps) {
	const storeRef = useRef<StoreType | null>(null)
	if (!storeRef.current) {
		storeRef.current = proxy({
			types: [] as string[],
			clips: [] as string[],
			stdout: [] as string[],
			stderr: [] as string[],
			output: "output.mp4",
			mode: "none",
			fps: 0,
			status: "",
		})
	}
	const store = storeRef.current
	const snap = useSnapshot(store)

	const [output, setOutput] = useState("output.mp4")
	const [fps, setFps] = useState(60)

	const handlers = useMemo(
		() => ({
			onDrop: async (e: React.DragEvent<HTMLDivElement>) => {
				e.preventDefault()
				const types = await getClipboardTypes("drag")
				const cliptext = await getClipboardText(
					clipboardTextTypes.filter((t) => types.includes(t)),
					"drag",
				)
				for (const [type, text] of Object.entries(cliptext)) {
					const { files } = parseText(text, type)
					const video = files.find((f) => f.endsWith(".mp4") || f.endsWith(".mov"))
					if (video) {
						store.clips.push(video)
						return
					}
				}
			},
			onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
				e.preventDefault()
			},
		}),
		[store.clips],
	)

	console.log(snap)

	return (
		<CheckRoot fontSize={"sm"} padding={4} {...handlers}>
			<VStack
				bgColor={"bg.1"}
				alignItems={"start"}
				borderRadius={"lg"}
				boxShadow={"md"}
				padding={2}
				width={"40rem"}
			>
				<HStack>
					{snap.clips.map((t) => (
						// biome-ignore lint/a11y/useMediaCaption: na
						<video
							key={t}
							src={convertFileSrc(t)}
							style={{ maxWidth: "12rem", maxHeight: "12rem" }}
						/>
					))}
					<Center
						width={"12rem"}
						height={"12rem"}
						border={"2px dashed {gray/50}"}
						borderRadius={"lg"}
					>
						Drop videos here
					</Center>
				</HStack>
				{/* <FramerateForm /> */}

				<HStack justifyContent={"space-evenly"} width={"100%"}>
					<VStack flex={"0 0 33%"} alignItems={"start"}>
						<Box>Output Filename</Box>
						<Input
							key={"outputinput"}
							bgColor={"bg.2"}
							paddingY={1}
							height={"unset"}
							value={output}
							onChange={(e) => {
								setOutput(e.target.value)
							}}
						/>
					</VStack>
					<VStack flex={"0 0 33%"} alignItems={"start"}>
						<Box>FPS</Box>
						<Input
							key={"fpsinput"}
							bgColor={"bg.2"}
							paddingY={1}
							height={"unset"}
							type={"number"}
							value={fps}
							onChange={(e) => {
								setFps(parseInt(e.target.value, 10))
							}}
						/>
					</VStack>
					<VStack flex={"0 0 33%"} alignItems={"start"}>
						<Box>Mode</Box>
						<Select.Root
							collection={interpolationCollection}
							value={[snap.mode]}
							onValueChange={(e) => {
								console.log(e)
								store.mode = e.value[0]
							}}
						>
							<Select.Control>
								<Select.Trigger>
									<Select.ValueText />
								</Select.Trigger>
								<Select.IndicatorGroup>
									<Select.Indicator />
									<Select.ClearTrigger />
								</Select.IndicatorGroup>
							</Select.Control>
							<Select.Positioner>
								<Select.Content>
									{interpolationCollection.items.map((item) => (
										<Select.Item item={item} key={item}>
											{item}
											<Select.ItemIndicator />
										</Select.Item>
									))}
								</Select.Content>
							</Select.Positioner>
						</Select.Root>
					</VStack>
				</HStack>

				<Button
					onClick={async () => {
						const opts: ConcatVideoOpts = {
							videoPaths: snap.clips as string[],
							outputPath: output,
							mode: (snap.mode || "none") as "none" | "simple" | "blend" | "motion",
							fps: fps,
						}
						try {
							store.status = "Running..."
							await concatVideo(opts, (stdout, stdin) => {
								if (stdout) store.stdout.push(stdout)
								if (stdin) store.stderr.push(stdin)
							})
							store.status = "Done!"
						} catch (e) {
							store.status = "Error!"
						}
					}}
				>
					Go
				</Button>
				<Box>{snap.status}</Box>
				{/* <HStack width={"100%"}>
					<VStack width={"50%"}>
						{snap.stdout.map((t, i) => (
							<Box key={i}>{t}</Box>
						))}
					</VStack>
					<VStack width={"50%"}>
						{snap.stderr.map((t, i) => (
							<Box key={i}>{t}</Box>
						))}
					</VStack>
				</HStack> */}
			</VStack>
		</CheckRoot>
	)
}

export default Vid

export type ConcatVideoOpts = {
	videoPaths: string[]
	outputPath: string
	mode: "none" | "simple" | "blend" | "motion"
	fps: number
}

export async function concatVideo(
	opts: ConcatVideoOpts,
	callback?: (stdout: string | null, stderr: string | null) => void,
): Promise<void> {
	const { videoPaths, outputPath, mode, fps } = opts

	if (videoPaths.length === 0) {
		throw new Error("No video paths provided ❗")
	}

	// Build FFmpeg concat file content
	const concatFileContent = videoPaths
		.map((path) => `file '${path.replace(/'/g, "'\\''")}'`)
		.join("\n")

	// Write it to a temp location inside Tauri cache dir
	const cacheDir = await appDataDir()
	const concatFilePath = `${cacheDir}/ffmpeg_concat_list.txt`

	await writeTextFile(concatFilePath, concatFileContent)

	// Base args
	const args = ["-f", "concat", "-y", "-safe", "0", "-i", concatFilePath]

	// Mode-specific filters and encoding
	switch (mode) {
		case "none":
			// Just copy streams and set container FPS
			args.push("-c", "copy", "-r", String(fps), outputPath)
			break

		case "simple":
			args.push(
				"-vf",
				`fps=${fps}`,
				"-c:v",
				"libx264",
				"-preset",
				"medium",
				"-crf",
				"18",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				outputPath,
			)
			break

		case "blend":
			args.push(
				"-vf",
				`minterpolate=fps=${fps}:mi_mode=blend`,
				"-c:v",
				"libx264",
				"-preset",
				"medium",
				"-crf",
				"18",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				outputPath,
			)
			break

		case "motion":
			args.push(
				"-vf",
				`minterpolate=fps=${fps}:mi_mode=mci:me_mode=bidir`,
				"-c:v",
				"libx264",
				"-preset",
				"medium",
				"-crf",
				"18",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				outputPath,
			)
			break
	}

	console.log(["ffmpeg", ...args].join(" "))

	const command = Command.create("ffmpeg", args)

	return new Promise((resolve, reject) => {
		command.on("close", (data) => {
			if (data.code === 0) {
				resolve()
			} else {
				console.error(data)
				reject(new Error(`FFmpeg failed with exit code ${data.code}`))
			}
		})

		command.on("error", (error) => {
			reject(error)
		})

		if (callback) {
			command.stdout.on("data", (data) => callback(data, null))
			command.stderr.on("data", (data) => callback(null, data))
		}

		command.spawn().catch(reject)
	})
}

async function concatVideosX(
	videoPaths: string[],
	outputPath: string,
	callback?: (stdout: string | null, stderr: string | null) => void,
): Promise<void> {
	if (videoPaths.length === 0) {
		throw new Error("No video paths provided ❗")
	}

	// Build FFmpeg concat file content
	const concatFileContent = videoPaths
		.map((path) => `file '${path.replace(/'/g, "'\\''")}'`)
		.join("\n")

	// Write it to a temp location inside Tauri cache dir
	const cacheDir = await appDataDir()
	const concatFilePath = `${cacheDir}/ffmpeg_concat_list.txt`

	await writeTextFile(concatFilePath, concatFileContent)

	// Build ffmpeg command
	const args = ["-f", "concat", "-y", "-safe", "0", "-i", concatFilePath, "-c", "copy", outputPath]
	console.log(["ffmpeg", ...args].join(" "))
	const command = Command.create("ffmpeg", args)

	return new Promise((resolve, reject) => {
		command.on("close", (data) => {
			if (data.code === 0) {
				resolve()
			} else {
				console.error(data)
				reject(new Error(`FFmpeg failed with exit code ${data.code}`))
			}
		})

		command.on("error", (error) => {
			reject(error)
		})

		if (callback) {
			command.stdout.on("data", (data) => callback(data, null))
			command.stderr.on("data", (data) => callback(null, data))
		}

		command.spawn().catch(reject)
	})
}
