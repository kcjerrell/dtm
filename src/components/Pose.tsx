import { Box } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import type { ChakraProps } from "app/types"
import { useEffect, useState } from "react"
import { fetch } from "@tauri-apps/plugin-http"
import { dtProject } from "@/commands"

interface PoseImageComponentProps extends ChakraProps {
	projectPath?: string
	projectId?: string
	tensorId?: string
}

function PoseImage(props: PoseImageComponentProps) {
	const { projectPath, projectId, tensorId, ...boxProps } = props
	const [data, setData] = useState<Uint8Array | null>(null)
	const [display, setDisplay] = useState("")

	useEffect(() => {
		if ((projectPath || projectId) && tensorId) {
			dtProject.getTensorRaw(projectPath, projectId, tensorId).then(async (data) => {
        console.log('buf len', data.data.length)
				const buffer = new Uint8Array(data.data)
        const floats = new Float32Array(buffer.buffer)
        console.log(...floats)
				// const pose = decodePoseTensor(buffer)
			})
		}
	}, [projectPath, tensorId, projectId])

	return <Box {...boxProps}>{display}</Box>
}

export default PoseImage

function decodePoseTensor(data: ArrayBuffer) {
	const floats = new Float32Array(data)
	console.log(floats)
}
