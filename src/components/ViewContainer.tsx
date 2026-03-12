import { motion, type Variants } from "motion/react"
import { Activity, type PropsWithChildren, Suspense, useEffect, useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import ErrorFallback from "@/ErrorFallback"
import { Loading } from "@/main"

const variants: Variants = {
    inactive: {
        zIndex: 1,
        opacity: 0,
        transition: {
            duration: 0.1,
        },
    },
    active: {
        zIndex: 0,
        opacity: 1,
        scale: 1,
        transition: {
            duration: 0.1,
        },
    },
}

export function ViewContainer(
    props: PropsWithChildren<{
        isActiveView: boolean
    }>,
) {
    const { children, isActiveView } = props
    const [mode, setMode] = useState<"hidden" | "visible">("hidden")

    useEffect(() => {
        if (isActiveView) setMode("visible")
        else {
            const timer = setTimeout(() => setMode("hidden"), 200)
            return () => clearTimeout(timer)
        }
    }, [isActiveView])

    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<Loading />}>
                <Activity mode={mode}>
                    <motion.div
                        layout
                        inert={!isActiveView}
                        variants={variants}
                        initial={"inactive"}
                        animate={isActiveView ? "active" : "inactive"}
                        style={{
                            position: "absolute",
                            inset: "0",
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            justifyContent: "stretch",
                            alignItems: "stretch",
                            boxShadow: "0px 2px 4px -2px #00000099",
                        }}
                    >
                        {children}
                    </motion.div>
                </Activity>
            </Suspense>
        </ErrorBoundary>
    )
}
