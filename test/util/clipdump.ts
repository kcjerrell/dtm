import { setTestOverride } from "./helpers"

type ClipDataType = {
    type: "drop" | "paste"
    source: "finder" | "chrome" | "discord" | "dtp" | "draw things"
    item: "image" | "video"
    label: string
    dump?: (args: Record<string, unknown>) => Record<string, unknown>
}

const dumps: ClipDataType[] = [
    {
        type: "drop",
        source: "finder",
        item: "image",
        label: "single image drop from finder",
        dump: (opts: { path: string }) => ({
            "public.file-url": "file:///.file/id=6571367.51706708",
            NSFilenamesPboardType: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<array>\n\t<string>${opts.path}</string>\n</array>\n</plist>\n`,
        }),
    },
    {
        type: "drop",
        source: "dtp",
        item: "image",
        label: "image drop from dtp",
        dump: (opts: { projectId: number; imageId: number }) => ({
            "public.url": `dtm://dtproject/thumbhalf/${opts.projectId}/${opts.imageId}`,
            "public.utf8-plain-text": `dtm://dtproject/thumbhalf/${opts.projectId}/${opts.imageId}`,
        }),
    },
    {
        type: "drop",
        source: "discord",
        item: "image",
        label: "drop from discord thumbnail",
        dump: (opts: { url: string }) => ({
            "public.html": `<meta http-equiv="Content-Type" content="text/html;charset=UTF-8"><a tabindex="-1" aria-hidden="true" class="originalLink_af017a" href="${opts.url}" data-role="img" data-safe-src="${opts.url}"></a>`,
            "public.utf8-plain-text": opts.url,
            "public.url": opts.url,
        }),
    },
    {
        type: "drop",
        source: "discord",
        item: "image",
        label: "drop for discord full",
        dump: (opts: { url: string }) => ({
            "public.url": opts.url,
        }),
    },
    {
        type: "paste",
        source: "discord",
        item: "image",
        // needs binary types
        label: "paste from discord copy image (from thumb) (failed)",
        dump: (_opts: { url: string }) => ({
            "public.html": "<meta charset='utf-8'><img src=\"image.png\">",
        }),
    },
    {
        type: "paste",
        source: "discord",
        item: "image",
        // needs binary types
        label: "paste from discord copy image (from full) (failed)",
        dump: (_opts: { url: string }) => ({
            "public.html": "<meta charset='utf-8'><img src=\"image.png\">",
            "public.png": [],
        }),
    },
    {
        type: "paste",
        source: "discord",
        item: "image",
        // needs binary types
        label: "paste from discord copy link (from thumb)",
        dump: (opts: { url: string }) => ({
            "public.utf8-plain-text": opts.url,
            "public.png": [],
        }),
    },
    {
        type: "paste",
        source: "finder",
        item: "image",
        label: "single image paste from finder",
        dump: (opts: { path: string }) => ({
            "public.file-url": "file:///.file/id=6571367.55219098",
            "public.utf8-plain-text": "IMG_20190416_093601115.jpg",
            NSFilenamesPboardType: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<array>\n\t<string>${opts.path}</string>\n</array>\n</plist>\n`,
        }),
    },
    {
        type: "paste",
        source: "chrome",
        item: "image",
        label: "copy image link (from chrome)",
        dump: (opts: { url: string }) => ({
            "public.utf8-plain-text": opts.url,
            "org.chromium.source-url": opts.url,
        }),
    },
    {
        type: "paste",
        source: "chrome",
        item: "image",
        // needs binary types
        label: "copy image (from chrome)",
        dump: (opts: { url: string }) => ({
            "org.chromium.source-url": opts.url,
            "public.html": `<meta charset='utf-8'><img src="${opts.url}" />`,
            "public.png": [],
        }),
    },
    {
        type: "paste",
        source: "draw things",
        item: "image",
        // needs binary types
        label: "copy from draw things",
        dump: (_opts: { url: string }) => ({
            "public.png": [],
        }),
    },
]

export function getPasteboardData(type: string, source: string, item: string) {
    return dumps.find((d) => d.type === type && d.source === source && d.item === item)?.dump
}

export async function setPasteboardOverride(overrideData: Record<string, unknown>) {
    await setTestOverride({
        pasteboardText: overrideData,
        pasteboardTypes: Object.keys(overrideData),
    })
}
