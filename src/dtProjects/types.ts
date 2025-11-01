export type ScanProgress = {
	projects_scanned: number
	projects_total: number
	project_path: string
	images_scanned: number
	images_total: number
}
export type ScanProgressEvent = {
	payload: ScanProgress
}
export type DTProject = {
	project_id: number
	path: string
	image_count: number
}
