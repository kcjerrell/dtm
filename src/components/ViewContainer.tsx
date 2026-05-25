import { Activity, type PropsWithChildren, Suspense, useEffect, useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import ErrorFallback from "@/ErrorFallback"
import { Loading } from "@/main"

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
            const timer = setTimeout(() => setMode("hidden"), 200)
            return () => clearTimeout(timer)
        }
    }, [isActiveView])

    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<Loading />}>
                <Activity mode={mode}>
                    <div
                        data-view-container={viewId}
                        data-active-view={isActiveView}
                        data-activity-mode={mode}
                        inert={!isActiveView}
                        style={{
                            position: "absolute",
                            inset: "0",
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            justifyContent: "stretch",
                            alignItems: "stretch",
                            boxShadow: "0px 2px 4px -2px #00000099",
                            opacity: isActiveView ? 1 : 0,
                            zIndex: isActiveView ? 0 : 1,
                            transition: "opacity 0.1s ease",
                        }}
                    >
                        {children}
                    </div>
                </Activity>
            </Suspense>
        </ErrorBoundary>
    )
}
