import React, { createContext, type PropsWithChildren, useCallback } from "react"
import { type Snapshot, useSnapshot } from "valtio"
import { type UseProxyRefOpts, useProxyRef, useProxyRefState } from "./valtioHooks"

type ContextInitializer<C extends object, P = unknown> = (props?: P) => C

type BuildContextOptions<C extends object, P = unknown, H = unknown> = {
    nullDefault?: boolean
    useHooks?: (props: P, state: C) => H
}

type Provider = (props: PropsWithChildren) => React.ReactNode

type BuildContextResult<C extends object, P = unknown> = {
    useCreateState: (props?: P) => [Provider, C]
    useCreate: (props?: P) => [Provider, C, Snapshot<C>]
    useContext: () => [C, Snapshot<C>]
    useContextState: () => C
    _context: React.Context<C | null>
    // getValue: () => C
    // useSnap: () => Snapshot<C>
}

export function buildStateContext<C extends object, P = unknown>(
    initFn: ContextInitializer<C, P>,
    opts?: BuildContextOptions<C>,
): BuildContextResult<C, P> {
    const { nullDefault = false } = opts ?? {}
    const useHooks = opts?.useHooks ?? (() => {})

    const Ctx = createContext<C | null>(nullDefault ? null : initFn())

    function useCreate(props?: P, opts?: UseProxyRefOpts<C>): [Provider, C, Snapshot<C>] {
        const { state, snap } = useProxyRef(() => initFn(props), opts)

        const hv = useHooks(props, state)

        const Provider = useCallback(
            (props: PropsWithChildren) => {
                return <Ctx value={{ state, hv }}>{props.children}</Ctx>
            },
            [state, hv],
        )

        return [Provider, state, snap, hv]
    }

    function useCreateState(props?: P, opts?: UseProxyRefOpts<C>): [Provider, C] {
        const state = useProxyRefState(() => initFn(props), opts)

        const hv = useHooks(props, state)

        const Provider = useCallback(
            (props: PropsWithChildren) => {
                return <Ctx value={{ state, hv }}>{props.children}</Ctx>
            },
            [state, hv],
        )

        return [Provider, state, hv]
    }

    function useContext(): [C, Snapshot<C>] {
        const { state } = React.useContext(Ctx)

        if (!state) throw new Error("Context not found")

        const snap = useSnapshot(state)
        return [state, snap]
    }

    function useContextState(): C {
        const { state } = React.useContext(Ctx)

        if (!state) throw new Error("Context not found")

        return state
    }

    function useContextHooks(): H {
        const { hv } = React.useContext(Ctx)

        if (!hv) throw new Error("Context not found")

        return hv
    }

    return {
        useCreateState,
        useCreate,
        useContext,
        useContextState,
        useContextHooks,
        _context: Ctx,
    }
}

/**

 export const MyContext = buildContext((props) => ({ stuff: props?.value ?? "default" }))

 function Parent(props) {
    const [Provider, state] = MyContext.create(props)

    // or if snapshot is needed by parent:
    // const [ Provider, state, snap ] = MyContext.useCreate(props)
    // don't use unless a value is read from snap. Requesting a snapshot and not reading a value from it
    // will subscribe to *all* changes, causing extra renders.

    const doStuffFromParent = useCallback(() => {
        state.stuff = "changed value"
    }, [state])

    return (
        <Provider>
            <Child />
        </Provider>
    )
 }

 ------
 import MyContext from "./parent.ts"

 function Child(props) {
 const [state, snap] = MyContext.use()

 // or
 // const snap = MyContext.useSnap()
 // or
 // const state = MyContext.getValue()


 }


 */
