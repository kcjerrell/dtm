import React, { createContext, type PropsWithChildren, useCallback } from "react"
import { type Snapshot, useSnapshot } from "valtio"
import { type UseProxyRefOpts, useProxyRef, useProxyRefState } from "./valtioHooks"

type ContextInitializer<C extends object, P = unknown> = (props?: P) => C

type BuildContextOptions<C extends object, P = unknown, H = unknown> = {
    nullDefault?: boolean
    useHooks?: (props: P, state: C) => H
}

type Provider = (props: PropsWithChildren) => React.ReactNode

type BuildContextResult<C extends object, P = unknown, H = unknown> = {
    useCreateState: (props?: P) => [Provider, C, H]
    useCreate: (props?: P) => [Provider, C, Snapshot<C>, H]
    useContext: () => [C, Snapshot<C>]
    useContextState: () => C
    context: React.Context<{ state: C; hv: H | null } | null>
    useContextHooks: () => H
    // getValue: () => C
    // useSnap: () => Snapshot<C>
}

export function buildStateContext<C extends object, P = unknown, H = unknown>(
    initFn: ContextInitializer<C, P>,
    opts?: BuildContextOptions<C, P, H>,
): BuildContextResult<C, P, H> {
    const { nullDefault = false } = opts ?? {}
    const useHooks = opts?.useHooks ?? (() => null)

    const Ctx = createContext<{ state: C; hv: H | null } | null>(
        nullDefault ? null : { state: initFn(), hv: null },
    )

    function useCreate(props?: P, opts?: UseProxyRefOpts<C>): [Provider, C, Snapshot<C>, H] {
        const { state, snap } = useProxyRef(() => initFn(props), opts)

        const hv = useHooks(props as P, state)

        const Provider = useCallback(
            (props: PropsWithChildren) => {
                return <Ctx value={{ state, hv }}>{props.children}</Ctx>
            },
            [state, hv],
        )

        return [Provider, state, snap, hv as H]
    }

    function useCreateState(props?: P, opts?: UseProxyRefOpts<C>): [Provider, C, H] {
        const state = useProxyRefState(() => initFn(props), opts)

        const hv = useHooks(props as P, state)

        const Provider = useCallback(
            (props: PropsWithChildren) => {
                return <Ctx value={{ state, hv }}>{props.children}</Ctx>
            },
            [state, hv],
        )

        return [Provider, state, hv as H]
    }

    function useContext(): [C, Snapshot<C>] {
        const ctx = React.useContext(Ctx)

        if (!ctx) throw new Error("Context not found")

        const { state } = ctx
        const snap = useSnapshot(state)
        return [state, snap]
    }

    function useContextState(): C {
        const ctx = React.useContext(Ctx)

        if (!ctx) throw new Error("Context not found")
        const { state } = ctx

        return state
    }

    function useContextHooks(): H {
        const ctx = React.useContext(Ctx)

        if (!ctx) throw new Error("Context not found")
        const { hv } = ctx

        return hv as H
    }

    return {
        useCreateState,
        useCreate,
        useContext,
        useContextState,
        useContextHooks,
        context: Ctx,
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
