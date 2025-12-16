export function eventCallback<T>() {
  const handlers = []

  function raise(payload: T) {
    for (const handler of handlers) {
      handler(payload)
    }
  }

  function addHandler(handler: (payload: T) => void) {
    handlers.push(handler)
  }

  raise.addHandler = addHandler

  return raise
}