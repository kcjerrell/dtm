import { useEffect } from "react"
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook"

const scopeStack = [] as string[]

/**
 * this is set up so that whatever the current scope is, it will be replaced by the
 * most recent call
 */
export function useScopedHotkeys(
	scope: string,
	hotkeys: Record<string, (e: KeyboardEvent) => void>,
) {
	const { enableScope, disableScope } = useHotkeysContext()

	const keys = Object.keys(hotkeys)

	useHotkeys(
		keys,
		(e, he) => {
			console.log(he.scopes)
			if (he.hotkey in hotkeys) {
				if (scope === scopeStack.at(-1)) hotkeys[he.hotkey](e)
			} else {
				alert("ooops")
			}
		},
		{ scopes: [scope] },
	)

	useEffect(() => {
		enableScope(scope)
		scopeStack.push(scope)
		console.log("sstack+", scopeStack)
		return () => {
			const popped = scopeStack.pop()
			disableScope(scope)
			console.log("sstack-", scopeStack)

			if (popped !== scope) alert("ooops messed up")
		}
	}, [enableScope, disableScope, scope])
}

type HotkeyComponentProps = {
	scope: string
	handlers: Record<string, (e: KeyboardEvent) => void>
}
export function Hotkey(props: HotkeyComponentProps) {
	const { scope, handlers } = props
	useScopedHotkeys(scope, handlers)

	return null
}
