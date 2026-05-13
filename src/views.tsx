import { type ComponentProps, type ComponentType, lazy } from "react"
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
        viewId: "projects",
        label: "Projects",
        icon: (props: ComponentProps<typeof PiCoffee>) => (
            <PiCoffee
                strokeWidth={3}
                style={{
                    strokeWidth: 3,
                }}
                {...props}
            />
        ),
    },
    { viewId: "scratch", label: "Scratch", icon: BiDetail, devOnly: true },
].filter((item) => import.meta.env.DEV || !item.devOnly)
// ].filter((item) => !item.devOnly)

export const views = {
    metadata: lazy(() => import("./metadata/Metadata")),
    vid: lazy(() => import("./vid/Vid")),
    projects: lazy(() => import("./dtProjects/DTProjects")),
    scratch: lazy(() => import("./scratch/Scratch3")),
}

export function getView(view: string): ComponentType<ChakraProps> {
    if (isView(view)) return views[view as keyof typeof views]
    return views.metadata
}

export function isView(view: string): view is keyof typeof views {
    return view in views
}
