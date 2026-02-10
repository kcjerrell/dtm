import { useContext, useRef } from "react"

/**
 * This is a somewhat hacky solution to allow a component to access a context
 * within a child component. The Extractor component should be placed as a child
 * of the component you want to access the context from. Either provide the ref as
 * an arg, or use the ref returned
 */
export function useGetContext<T>(context: React.Context<T>, ref?: React.RefObject<T>) {
    const contextRef = useRef<T | null>(null)

    const Extractor = () => {
        const ctx = useContext(context)
        contextRef.current = ctx
        if (ref) ref.current = ctx

        return null
    }

    return { Extractor, contextRef }
}
