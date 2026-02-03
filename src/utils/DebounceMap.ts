export class DebounceMap<K> {
    delay: number
    map = new Map<K, NodeJS.Timeout>()
    
    constructor(delay: number) {
        this.delay = delay
    }

    set(key: K, callback: () => void) {
        const existing = this.map.get(key)
        if (existing) {
            clearTimeout(existing)
        }
        const timeout = setTimeout(() => {
            this.map.delete(key)
            callback()
        }, this.delay)
        this.map.set(key, timeout)
    }
}