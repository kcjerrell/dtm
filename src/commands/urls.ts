import type { ImageExtra } from "./projects"

const urls = {
	thumb: (image: ImageExtra) => `dtm://dtproject/thumb/${image.project_id}/${image.preview_id}`,
	thumbHalf: (image: ImageExtra) =>
		`dtm://dtproject/thumbhalf/${image.project_id}/${image.preview_id}`,
	tensor: (projectId: number, name: string, nodeId?: number | null, size?: number | null) => {
		const url = new URL(`dtm://dtproject/tensor/${projectId}/${name}`)
		if (nodeId) url.searchParams.set("node", nodeId.toString())
		if (size) url.searchParams.set("s", size.toString())
		return url.toString()
	},
}

export default urls
