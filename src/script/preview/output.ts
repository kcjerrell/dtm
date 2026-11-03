import type { OutputMetadata } from "../contracts"

/** S15 authorizes previews with a 64-character lowercase hex token. */
export function safePreview(output: OutputMetadata): OutputMetadata | null {
    if (
        !/^dtm:\/\/script-output\/[0-9a-f]{64}$/.test(output.previewUrl) ||
        !["image/png", "image/jpeg"].includes(output.mediaType) ||
        !Number.isSafeInteger(output.byteLength) ||
        output.byteLength <= 0 ||
        [output.width, output.height].some(
            (dimension) =>
                dimension !== undefined && (!Number.isSafeInteger(dimension) || dimension <= 0),
        )
    )
        return null
    return {
        previewUrl: output.previewUrl,
        mediaType: output.mediaType,
        byteLength: output.byteLength,
        ...(output.width !== undefined ? { width: output.width } : {}),
        ...(output.height !== undefined ? { height: output.height } : {}),
    }
}
