import { listen } from "@tauri-apps/api/event"
import EventEmitter from "eventemitter3"
import { DTPStateController } from "./StateController"

type FutureServices<T extends object> = Partial<{
	[K in keyof T]: PromiseWithResolvers<T[K]>
}>

export class Container<T extends object = object, E extends object = object> extends EventEmitter<E> {
		services: T = {} as T
		private futureServices: FutureServices<T> = {}
		unlistenPromise: Promise<() => void>

		constructor(servicesInit: () => T) {
			super()

			Container.constructorStack.push(this as Container)

			servicesInit()

			this.unlistenPromise = listen("invalidate-tags", (event) => {
				const payload = event.payload as { tag: string; desc: string } | string
				console.log("INVALIDATE TAGS", payload)
				if (typeof payload === "string") {
					this.invalidate(payload)
				} else {
					this.invalidate(payload.tag, payload.desc)
				}
			})
		}

		getService<K extends keyof T>(name: K): T[K] {
			return this.services[name]
		}

		getFutureService<K extends keyof T>(name: K): Promise<T[K]> {
			const existing = this.services[name]
			if (existing !== undefined) return Promise.resolve(existing)

			let future = this.futureServices[name]
			if (future === undefined) {
				future = Promise.withResolvers<T[K]>()
				this.futureServices[name] = future
			}

			return future.promise
		}

		async invalidate(tags: string, desc: string = "update") {
			for (const service of Object.values(this.services)) {
				if (service instanceof DTPStateController) {
					await service._internalHandleTags(tags, desc)
				}
			}
		}

		private _isDisposed = false
		get isDisposed() {
			return this._isDisposed
		}
		dispose() {
			for (const service of Object.values(this.services)) {
				if (service instanceof DTPStateController) {
					service.dispose()
				}
			}
			this.unlistenPromise.then((u) => u())
			this.removeAllListeners()
			this._isDisposed = true
		}

		private static constructorStack: Container[] = []

		static register<T extends object, E extends object>(
			name: keyof T,
			service: T[typeof name],
		) {
			const container = Container.constructorStack.at(-1) as Container<T, E>
			if (!container) throw new Error("must call register within a container constructor")
			container.services[name] = service

			const future = container.futureServices[name]
			if (future) {
				future.resolve(service)
				delete container.futureServices[name]
			}

			return container
		}
	}
