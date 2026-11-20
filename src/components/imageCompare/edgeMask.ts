/**
 * Replaces pixels with a thinned white/transparent Sobel edge mask in place.
 * Luminance and gradient rows are cached ahead of the output; only a few rows
 * are retained. Output alpha stores candidate classifications for edge tracking.
 */
export function applyEdgeMask(
    pixels: Pick<ImageData, "data" | "width" | "height">,
    upscale = 1,
): void {
    const { data, width, height } = pixels
    if (!width || !height) return
    // Full inverse-scale compensation promoted too much interpolated texture to
    // edges. Use a more conservative strong threshold and track weaker continuations.
    const strongThresholdSquared = ((4 * 0.1) / Math.sqrt(Math.max(1, upscale))) ** 2
    const weakThresholdSquared = strongThresholdSquared / 4
    let previous = new Float32Array(width)
    let current = new Float32Array(width)
    let next = new Float32Array(width)
    const vertical = new Float32Array(width)
    const readRow = (row: Float32Array, y: number) => {
        // A separable [1, 2, 1] Gaussian suppresses interpolation ripples and
        // single-pixel texture before derivatives are taken. Repeat border samples.
        for (let x = 0; x < width; x++) {
            let value = 0
            for (let dy = -1; dy <= 1; dy++) {
                const offset = (Math.min(height - 1, Math.max(0, y + dy)) * width + x) * 4
                value +=
                    ((0.2126 * data[offset] +
                        0.7152 * data[offset + 1] +
                        0.0722 * data[offset + 2]) /
                        255) *
                    (data[offset + 3] / 255) *
                    (dy === 0 ? 0.5 : 0.25)
            }
            vertical[x] = value
        }
        for (let x = 0; x < width; x++) {
            row[x] =
                (vertical[Math.max(0, x - 1)] +
                    2 * vertical[x] +
                    vertical[Math.min(width - 1, x + 1)]) /
                4
        }
    }
    readRow(current, 0)
    previous.set(current)
    readRow(next, Math.min(1, height - 1))

    const advanceLuminance = (y: number) => {
        const spare = previous
        previous = current
        current = next
        next = spare
        readRow(next, Math.min(y + 2, height - 1))
    }
    const readGradient = (y: number, magnitudes: Float32Array, directions: Uint8Array) => {
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
            // Hidden RGB must not suppress a neighboring visible edge during thinning.
            magnitudes[x] = data[(y * width + x) * 4 + 3] > 0 ? gx * gx + gy * gy : 0
            const ax = Math.abs(gx)
            const ay = Math.abs(gy)
            // Quantize the gradient normal to 0, 45, 90, or 135 degrees.
            if (ay <= ax * (Math.SQRT2 - 1)) directions[x] = 0
            else if (ay >= ax * (Math.SQRT2 + 1)) directions[x] = 2
            else directions[x] = gx * gy > 0 ? 1 : 3
        }
    }
    let before = new Float32Array(width)
    let center = new Float32Array(width)
    let after = new Float32Array(width)
    let direction = new Uint8Array(width)
    let nextDirection = new Uint8Array(width)
    readGradient(0, center, direction)
    if (height > 1) {
        advanceLuminance(0)
        readGradient(1, after, nextDirection)
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let backward: number
            let forward: number
            switch (direction[x]) {
                case 0:
                    backward = center[x - 1] ?? 0
                    forward = center[x + 1] ?? 0
                    break
                case 1:
                    backward = before[x - 1] ?? 0
                    forward = after[x + 1] ?? 0
                    break
                case 2:
                    backward = before[x]
                    forward = after[x]
                    break
                default:
                    backward = before[x + 1] ?? 0
                    forward = after[x - 1] ?? 0
            }
            const magnitude = center[x]
            // Break equal-strength ties consistently, retaining one side of a plateau.
            const peak = magnitude > backward && magnitude >= forward
            const value =
                !peak || magnitude < weakThresholdSquared
                    ? 0
                    : magnitude >= strongThresholdSquared
                      ? 255
                      : 128
            const offset = (y * width + x) * 4
            data[offset + 3] = value
        }
        const spare = before
        before = center
        center = after
        after = spare
        const spareDirection = direction
        direction = nextDirection
        nextDirection = spareDirection
        if (y + 2 < height) {
            advanceLuminance(y + 1)
            readGradient(y + 2, after, nextDirection)
        } else {
            after.fill(0)
        }
    }

    // Follow 8-connected weak candidates from strong seeds. Mark on insertion so
    // each candidate is queued at most once; no second full-image buffer is needed.
    const pending: number[] = []
    const count = width * height
    for (let seed = 0; seed < count; seed++) {
        if (data[seed * 4 + 3] !== 255) continue
        data[seed * 4 + 3] = 254
        pending.push(seed)
        while (pending.length) {
            const point = pending.pop() as number
            const x = point % width
            const y = Math.floor(point / width)
            for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
                for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
                    const neighbor = ny * width + nx
                    if (data[neighbor * 4 + 3] !== 128) continue
                    data[neighbor * 4 + 3] = 254
                    pending.push(neighbor)
                }
            }
        }
    }
    for (let point = 0; point < count; point++) {
        const offset = point * 4
        const value = data[offset + 3] === 254 ? 255 : 0
        data[offset] = value
        data[offset + 1] = value
        data[offset + 2] = value
        data[offset + 3] = value
    }
}
