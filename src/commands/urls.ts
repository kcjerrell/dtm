import { ImageExtra } from "./projects"

const urls = {
	thumb: (image: ImageExtra) => `dtm://dtproject/thumb/${image.project_id}/${image.preview_id}`,
	thumbHalf: (image: ImageExtra) =>
		`dtm://dtproject/thumbhalf/${image.project_id}/${image.preview_id}`,
	tensor: (projectId: number, name: string) => `dtm://dtproject/tensor/${projectId}/${name}`,
}

export default urls
