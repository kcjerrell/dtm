import { dtProject } from "@/commands"
import { Box, Image } from "@chakra-ui/react"
import { useEffect, useRef } from "react"

interface ColorPaletteImageComponentProps extends ChakraProps {
	projectPath?: string
	projectId?: number
	tensorId: string
}

function ColorPaletteImage(props: ColorPaletteImageComponentProps) {
	const { projectId, projectPath, tensorId, ...boxProps } = props
	const imgRef = useRef<HTMLImageElement>(null)

	useEffect(() => {
		if (!(projectId ?? projectPath) || !tensorId) return
		dtProject.decodeTensor(projectId ?? projectPath, tensorId, false).then(async (data) => {
			console.log(getColors(new Uint8Array(data)))
		})
	}, [projectId, projectPath, tensorId])

	return (
		<Image ref={imgRef} src={`dtm://dtproject/tensor/${projectId}/${tensorId}`} {...boxProps} />
	)
}

export default ColorPaletteImage

function getColors(data: Uint8Array, channels: number = 3) {
	const palette = {} as Record<string, number>
	console.log(data.length)
	for (let i = 0; i < data.length; i += channels) {
		const r = data[i]
		const g = data[i + 1]
		const b = data[i + 2]
		const key = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`

		if (palette[key]) palette[key]++
		else palette[key] = 1
		console.log("cp", key)
	}

	return Object.keys(palette).sort()
}
