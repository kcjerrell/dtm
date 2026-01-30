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
