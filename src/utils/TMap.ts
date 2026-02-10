type TMapFilterFn<K, V> = (key: K, value: V) => boolean

export class TMap<K, V> extends Map<K, V> {
    /**
     * removes and returns the value for the provided key
     */
    take(key: K): V | undefined {
        const value = this.get(key)
        if (value) this.delete(key)
        return value
    }

    /**
     * removes any entries that do not pass the predicate function, keeping those
     * that do. This is a destructive operation.
     */
    retain(predicate: TMapFilterFn<K, V>): void {
        for (const [key, value] of this.entries()) {
            if (!predicate(key, value)) {
                this.delete(key)
            }
        }
    }

    static from<K, V>(iterable: Iterable<V>, keyFn: (value: V) => K): TMap<K, V> {
        const result = new TMap<K, V>()
        for (const value of iterable) {
            result.set(keyFn(value), value)
        }
        return result
    }
}
