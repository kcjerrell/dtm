type Input = string | ArrayBuffer | Uint8Array | Buffer

const MIME_TO_EXT: Record<string, string> = {
    // images
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/svg+xml": "svg",

    // video
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/x-m4v": "m4v",
    "video/webm": "webm",
    "video/ogg": "ogv",
    "video/x-msvideo": "avi",
    "video/x-matroska": "mkv",
}

const UTI_TO_EXT: Record<string, string> = {
    "public.jpeg": "jpg",
    "public.png": "png",
    "public.gif": "gif",
    "public.webp": "webp",
    "public.heic": "heic",
    "public.heif": "heif",
    "public.tiff": "tiff",

    "public.mpeg4": "mp4",
    "public.mp4": "mp4",
    "public.quicktime": "mov",
    "public.avi": "avi",
    "public.mkv": "mkv",
    "public.webm": "webm",
}

const EXT_NORMALIZE: Record<string, string> = {
    jpeg: "jpg",
    jpg: "jpg",
    tif: "tiff",
    qt: "mov",
}

/* ------------------ MAGIC NUMBER DETECTION ------------------ */

function detectFromBuffer(buf: Uint8Array): string | undefined {
    if (buf.length < 12) return

    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg"

    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png"

    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif"

    // WEBP (RIFF....WEBP)
    if (
        buf[0] === 0x52 && // R
        buf[1] === 0x49 && // I
        buf[2] === 0x46 && // F
        buf[3] === 0x46 &&
        buf[8] === 0x57 && // W
        buf[9] === 0x45 && // E
        buf[10] === 0x42 && // B
        buf[11] === 0x50 // P
    )
        return "webp"

    // MP4 / MOV (ISO BMFF: "ftyp")
    if (
        buf[4] === 0x66 && // f
        buf[5] === 0x74 && // t
        buf[6] === 0x79 && // y
        buf[7] === 0x70
    ) {
        const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11])

        if (brand.startsWith("qt")) return "mov"
        return "mp4"
    }

    // AVI (RIFF....AVI )
    if (
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x41 &&
        buf[9] === 0x56 &&
        buf[10] === 0x49
    )
        return "avi"

    // MKV / WEBM (EBML)
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "mkv" // could also be webm, but mkv is safer default

    return
}

/* ------------------ STRING DETECTION ------------------ */

function detectFromString(input: string): string | undefined {
    const type = input.toLowerCase().trim()

    // 1. MIME
    if (MIME_TO_EXT[type]) return MIME_TO_EXT[type]

    // 2. UTI
    if (UTI_TO_EXT[type]) return UTI_TO_EXT[type]

    // 3. MIME fallback
    if (type.startsWith("image/") || type.startsWith("video/")) {
        const subtype = type.split("/")[1]
        return EXT_NORMALIZE[subtype] || subtype
    }

    // 4. UTI fallback
    if (type.startsWith("public.")) {
        const subtype = type.split(".")[1]
        return EXT_NORMALIZE[subtype] || subtype
    }

    // 5. Filename / extension
    const match = type.match(/\.([a-z0-9]+)$/)
    if (match) {
        const ext = match[1]
        return EXT_NORMALIZE[ext] || ext
    }

    // url
    try {
        const url = new URL(input)
        const ext = url.pathname.split(".").pop()
        if (ext) return EXT_NORMALIZE[ext] || ext
    } catch (e) {
        // ignore
    }

    return
}

/* ------------------ MAIN ENTRY ------------------ */

export function determineType(input: Input | undefined | null | unknown): string | undefined {
    if (!input) return

    // Buffer / binary input
    if (input instanceof Uint8Array || (typeof Buffer !== "undefined" && input instanceof Buffer)) {
        return detectFromBuffer(input)
    }

    if (input instanceof ArrayBuffer) {
        return detectFromBuffer(new Uint8Array(input))
    }

    // String input
    if (typeof input === "string") {
        return detectFromString(input)
    }

    return
}

// https://media.discordapp.net/attachments/1041450063983030282/1487583672826859681/add_three_small_scandinavian_minimalist_style_pendant_lights_above_the_cashier_counter__1251659716.png?ex=69ca5481&is=69c90301&hm=dec4c3bd542e381fdc3312f85232863ac28a792ed9cd9f0d7d6910c83fb306c3&=&format=webp&quality=lossless&width=1576&height=1182