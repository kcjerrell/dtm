import { createMonacoViabilityHarness } from "../viabilityHarness"

const container = document.querySelector<HTMLElement>("#editor")
if (!container) throw new Error("Monaco viability fixture requires an editor container")

const harness = createMonacoViabilityHarness(container)
Object.assign(globalThis, { dtmMonacoViabilityHarness: harness })
