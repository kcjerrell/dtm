type MetaDataGroup = {
    name: string
    items: { key: string; value: unknown }[]
}

export function groupItems(root: Record<string, unknown>) {
    const groups: MetaDataGroup[] = []

    for (const [k, v] of Object.entries(root)) {
        const group: MetaDataGroup = { name: k, items: [] }

        if (typeof v === "string") {
            group.items.push({ key: k, value: v })
        } else if (v instanceof Uint8Array) {
            const isAsciiComment =
                k === "userComment" &&
                v.length >= 8 &&
                new TextDecoder().decode(v.subarray(0, 8)) === "ASCII\0\0\0"
            group.items.push({
                key: k,
                value: isAsciiComment ? new TextDecoder().decode(v.subarray(8)) : v,
            })
        } else if (v && typeof v === "object") {
            for (const [k2, v2] of Object.entries(v)) {
                group.items.push({ key: k2, value: v2 })
            }
        }

        groups.push(group)
    }
    console.log(groups)
    return groups
}
