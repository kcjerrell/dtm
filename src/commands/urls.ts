import type { ImageExtra } from "./projects"

function thumb(image: ImageExtra): string
function thumb(projectId: number, previewId: number): string
function thumb(arg: ImageExtra | number, previewId?: number): string {
    if (typeof arg === "number") return `dtm://dtproject/thumb/${arg}/${previewId}`
    return `dtm://dtproject/thumb/${arg.project_id}/${arg.preview_id}`
}

function thumbHalf(image: ImageExtra): string
function thumbHalf(projectId: number, previewId: number): string
function thumbHalf(arg: ImageExtra | number, previewId?: number): string {
    if (typeof arg === "number") return `dtm://dtproject/thumbhalf/${arg}/${previewId}`
    return `dtm://dtproject/thumbhalf/${arg.project_id}/${arg.preview_id}`
}

const urls = {
    thumb,
    thumbHalf,
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
