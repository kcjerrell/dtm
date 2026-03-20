import { useEffect } from "react"
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook"
import type { Options } from "react-hotkeys-hook/dist/types"

const scopeStack = [] as string[]

/**
 * this is set up so that whatever the current scope is, it will be replaced by the
 * most recent call
 */
export function useScopedHotkeys(
    hotkeys: Record<string, (e: KeyboardEvent) => void>,
    options: Options,
) {
    const { enableScope, disableScope } = useHotkeysContext()

    const keys = Object.keys(hotkeys)
    const scope = options?.scopes?.[0]

    useHotkeys(
        keys,
        (e, he) => {
            const topScope = scopeStack.at(-1)
            if (he.hotkey in hotkeys) {
                if ((topScope && topScope === scope) || he.metadata?.global) hotkeys[he.hotkey](e)
            }
        },
        options,
    )

    useEffect(() => {
        if (!scope) return
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
    scope?: string
    handlers: Record<string, (e: KeyboardEvent) => void>
}
export function Hotkey(props: HotkeyComponentProps) {
    const { scope, handlers } = props
    const options: Options = {
        scopes: scope ? [scope] : ["app"],
        metadata: { global: !scope },
    }
    useScopedHotkeys(handlers, options)

    return null
}
