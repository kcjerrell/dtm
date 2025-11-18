import { Box, Image } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import type { ChakraProps } from "app/types"
import { useEffect, useState } from "react"
import { fetch } from "@tauri-apps/plugin-http"
import { dtProject } from "@/commands"
import { drawPose } from "@/utils/pose"
import { chunk, uint8ArrayToBase64 } from "@/utils/helpers"

interface PoseImageComponentProps extends ChakraProps {
	projectPath?: string
	projectId?: number
	tensorId?: string
}

function PoseImage(props: PoseImageComponentProps) {
	const { projectPath, projectId, tensorId, ...boxProps } = props
	const [data, setData] = useState<Uint8Array | null>(null)
	const [src, setSrc] = useState<string | undefined>(undefined)

	useEffect(() => {
		if ((projectPath || projectId) && tensorId) {
			dtProject.decodeTensor(projectId ?? projectPath, tensorId, false).then(async (data) => {
				const floats = new Float32Array(data)
				const dtPose = []

				for (let i = 0; i < floats.length; i += 2) {
					const x = floats[i]
					const y = floats[i + 1]
					if (x === -1 && y === -1) dtPose.push(0, 0, 0)
					else dtPose.push(...[floats[i] * 768, floats[i + 1] * 768, 1])
				}
				const pose = {
					people: chunk(dtPose, 54).map((p) => ({
						pose_keypoints_2d: p,
					})),
					// [
					// 	{
					// 		pose_keypoints_2d: dtPose,
					// 	},
					// ],
					width: 768,
					height: 768,
				}

				const image = await drawPose(pose)
				if (image) setSrc(`data:image/png;base64,${await uint8ArrayToBase64(image)}`)
			})
		}
	}, [projectPath, tensorId, projectId])

	return (
		<Box {...boxProps}>
			<Image src={src} width={"100%"} height={"100%"} />
		</Box>
	)
}

export default PoseImage