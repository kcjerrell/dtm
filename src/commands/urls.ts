import type { ImageExtra } from "./projects"

const urls = {
	thumb: (image: ImageExtra) => `dtm://dtproject/thumb/${image.project_id}/${image.preview_id}`,
	thumbHalf: (image: ImageExtra) =>
		`dtm://dtproject/thumbhalf/${image.project_id}/${image.preview_id}`,
	tensor: (
		projectId: number,
		name: string,
		opts?: { nodeId?: number | null; size?: number | null; invert?: boolean },
	) => {
		const url = new URL(`dtm://dtproject/tensor/${projectId}/${name}`)
		if (opts?.nodeId) url.searchParams.set("node", opts.nodeId.toString())
		if (opts?.size) url.searchParams.set("s", opts.size.toString())
		if (opts?.invert) url.searchParams.set("mask", "invert")
		return url.toString()
	},
}

export default urls
