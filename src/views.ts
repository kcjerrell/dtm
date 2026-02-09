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
    { viewId: "projects", label: "Projects", icon: PiCoffee },
    { viewId: "scratch", label: "Scratch", icon: BiDetail, devOnly: true },
].filter((item) => import.meta.env.DEV || !item.devOnly)

export const views = {
    metadata: lazy(() => import("./metadata/Metadata")),
    mini: lazy(() => import("./Mini")),
    vid: lazy(() => import("./vid/Vid")),
    library: lazy(() => import("./library/Library")),
    projects: lazy(() => import("./dtProjects/DTProjects")),
    // scratch: lazy(() => import("./scratch/Coffee")),
}

// export const views = {
//     metadata: Metadata,
//     projects: DTProjects
// }