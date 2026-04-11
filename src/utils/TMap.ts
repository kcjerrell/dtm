type TMapFilterFn<K, V> = (key: K, value: V) => boolean

type TMapWithDefault<K, V> = Omit<TMap<K, V>, "get"> & {
    get(key: K): V
}

export class TMap<K, V = false> extends Map<K, V> {
    private _defaultValueInit?: (key: K) => V

    static withDefaultValue<K, V>(defaultValueInit: (key: K) => V) {
        const tmap = new TMap<K, V>()
        tmap._defaultValueInit = defaultValueInit
        return tmap as TMapWithDefault<K, V>
    }

    /**
     * get the value for the provided key. if a defaultValueInitializer was provided, it
     * will be called if the key is not yet present
     */
    get(key: K) {
        if (this.has(key)) return super.get(key) as V
        if (this._defaultValueInit) {
            const value = this._defaultValueInit(key)
            this.set(key, value)
            return value
        }
        return undefined
    }

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
