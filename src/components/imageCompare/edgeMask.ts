/**
 * Replaces pixels with a binary white/transparent Sobel edge mask in place.
 * Three cached luminance rows keep memory bounded and prevent overwritten output
 * from feeding back into the convolution. Border samples repeat the nearest pixel.
 */
export function applyEdgeMask(pixels: Pick<ImageData, "data" | "width" | "height">): void {
    const { data, width, height } = pixels
    if (!width || !height) return
    // Sobel's response to a full horizontal/vertical step is 4; keep gradients >= 10%.
    const thresholdSquared = (4 * 0.1) ** 2
    let previous = new Float32Array(width)
    let current = new Float32Array(width)
    let next = new Float32Array(width)
    const readRow = (row: Float32Array, y: number) => {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4
            row[x] =
                ((0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]) /
                    255) *
                (data[offset + 3] / 255)
        }
    }
    readRow(current, 0)
    previous.set(current)
    readRow(next, Math.min(1, height - 1))

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const left = Math.max(0, x - 1)
            const right = Math.min(width - 1, x + 1)
            const gx =
                previous[right] -
                previous[left] +
                2 * (current[right] - current[left]) +
                next[right] -
                next[left]
            const gy =
                next[left] +
                2 * next[x] +
                next[right] -
                previous[left] -
                2 * previous[x] -
                previous[right]
            const offset = (y * width + x) * 4
            const value = data[offset + 3] > 0 && gx * gx + gy * gy >= thresholdSquared ? 255 : 0
            data[offset] = value
            data[offset + 1] = value
            data[offset + 2] = value
            data[offset + 3] = value
        }
        if (y + 1 < height) {
            const spare = previous
            previous = current
            current = next
            next = spare
            readRow(next, Math.min(y + 2, height - 1))
        }
    }
}
