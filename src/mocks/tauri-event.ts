export const listen = async (event: string, _handler: (event: any) => void) => {
    console.log(`[Mock] listen: ${event}`)
    return () => {
        console.log(`[Mock] unlisten: ${event}`)
    }
}

export const emit = async (event: string, payload?: any) => {
    console.log(`[Mock] emit: ${event}`, payload)
}

export const emitTo = async (_target: EventTarget | string, event: string, payload?: any) => {
    console.log(`[Mock] emitTo: ${event}`, payload)
}
