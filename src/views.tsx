import { lazy } from "react"
import { BiDetail, PiCoffee, PiListMagnifyingGlassBold } from "./components/icons/icons"

export const viewDescription = [
    {
        viewId: "metadata",
        label: "Metadata",
        icon: PiListMagnifyingGlassBold,
    },
    {
        viewId: "vid",
        label: "Video",
        icon: BiDetail,
        devOnly: true,
    },
    {
        viewId: "library",
        label: "Library",
        icon: BiDetail,
        devOnly: true,
    },
    { viewId: "projects", label: "Projects", icon: (props) => <PiCoffee strokeWidth={3} css={{
        "& svg": {
            strokeWidth: 3,
        }
    }} {...props} /> },
    { viewId: "scratch", label: "Scratch", icon: BiDetail, devOnly: true },
].filter((item) => import.meta.env.DEV || !item.devOnly)
// ].filter((item) => !item.devOnly)

export const views = {
    metadata: lazy(() => import("./metadata/Metadata")),
    mini: lazy(() => import("./Mini")),
    vid: lazy(() => import("./vid/Vid")),
    library: lazy(() => import("./library/Library")),
    projects: lazy(() => import("./dtProjects/DTProjects")),
    scratch: lazy(() => import("./scratch/Scratch3")),
}

export function getView(view: string) {
    if (isView(view)) return views[view as keyof typeof views]
    return views.metadata
}

export function isView(view: string): view is keyof typeof views {
    return view in views
}
