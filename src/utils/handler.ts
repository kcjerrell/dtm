export function eventCallback<T>() {
	let handlers: ((payload: T) => void)[] = []

	function raise(payload: T) {
		for (const handler of handlers) {
			handler(payload)
		}
	}

	function addHandler(handler: (payload: T) => void) {
		handlers.push(handler)
		return () => removeHandler(handler)
	}

	function removeHandler(handler: (payload: T) => void) {
		handlers = handlers.filter((h) => h !== handler)
	}

	raise.addHandler = addHandler
	raise.removeHandler = removeHandler

	return raise
}