import { Box, Image } from "@chakra-ui/react"
import { useEffect, useState } from "react"
import { dtProject } from "@/commands"
import { uint8ArrayToBase64 } from "@/utils/helpers"
import { drawPose, pointsToPose, tensorToPoints } from "@/utils/pose"

interface PoseImageComponentProps extends ChakraProps {
	projectPath?: string
	projectId?: number
	tensorId?: string
}

function PoseImage(props: PoseImageComponentProps) {
	const { projectPath, projectId, tensorId, ...restProps } = props
	const [src, setSrc] = useState<string | undefined>(undefined)

	useEffect(() => {
		const project = projectPath ?? projectId
		if (project && tensorId) {
			dtProject.decodeTensor(project, tensorId, false).then(async (data) => {
				const points = tensorToPoints(data)
				const pose = pointsToPose(points, 256, 256)
				const image = await drawPose(pose, 4)
				if (image) setSrc(`data:image/png;base64,${await uint8ArrayToBase64(image)}`)
			})
		}
	}, [projectPath, tensorId, projectId])

	return <Image src={src} {...restProps} />
}

export default PoseImage
