import { chakra } from "@chakra-ui/react"
import { motion } from "motion/react"
import { Activity, type PropsWithChildren, Suspense, useEffect, useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import ErrorFallback from "@/ErrorFallback"

export function ViewContainer(
    props: PropsWithChildren<{
        isActiveView: boolean
        viewId?: string
    }>,
) {
    const { children, isActiveView, viewId } = props
    const [mode, setMode] = useState<"hidden" | "visible">(() =>
        isActiveView ? "visible" : "hidden",
    )

    useEffect(() => {
        if (isActiveView) setMode("visible")
        else {
            const timer = setTimeout(() => setMode("hidden"), 300)
            return () => clearTimeout(timer)
        }
    }, [isActiveView])

    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<Loading />}>
                <Activity mode={mode}>
                    <ViewContainerBase
                        data-view-container={viewId}
                        data-active-view={isActiveView}
                        data-activity-mode={mode}
                        inert={!isActiveView}
                        isActiveView={isActiveView}
                    >
                        {children}
                    </ViewContainerBase>
                </Activity>
            </Suspense>
        </ErrorBoundary>
    )
}

const ViewContainerBase = chakra("div", {
    base: {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "stretch",
        alignItems: "stretch",
        boxShadow: "0px 2px 4px -2px #00000099",
        transition: "opacity 0.2s ease",
    },
    variants: {
        isActiveView: {
            true: {
                opacity: 1,
                zIndex: 0,
            },
            false: {
                opacity: 0,
                zIndex: 1,
            },
        },
    },
})

function Loading() {
    return (
        <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={"loading-container"}
            transition={{ duration: 2 }}
            style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
            }}
        >
            <div className={"loading-text"}>Loading...</div>
        </motion.div>
    )
}