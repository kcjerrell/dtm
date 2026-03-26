export async function shiftClick(el: ChainablePromiseElement) {
  await el.execute((elem) => {
    const event = new PointerEvent("click", {
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    elem.dispatchEvent(event)
  })
}

export async function cmdClick(el: ChainablePromiseElement) {
  await el.execute((elem) => {
    const event = new PointerEvent("click", {
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    elem.dispatchEvent(event)
  })
}