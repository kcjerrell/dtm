import { createContext, type PropsWithChildren, useContext, useMemo } from "react"
import type { ICommandItem } from "@/types"
import { type ImageCommandContext, useImageCommands } from "./detailsOverlay/useImageCommands"
import type { ResourceHandle } from "./util/resourceHandle"

export type MenuContextType = {
    imageCommands: ICommandItem<ResourceHandle, ImageCommandContext>[]
    selectImageMenuCommand: (
        selected: ResourceHandle[],
        context: ImageCommandContext,
    ) => Promise<(() => void | Promise<void>) | null>
}

export const MenuContext = createContext<MenuContextType | null>(null)

export function MenuProvider(props: PropsWithChildren) {
    const [selectImageMenuCommand, imageCommands] = useImageCommands()

    const cv = useMemo(
        () => ({ imageCommands, selectImageMenuCommand }),
        [imageCommands, selectImageMenuCommand],
    )

    return <MenuContext value={cv}>{props.children}</MenuContext>
}

export function useMenuContext() {
    const ctx = useContext(MenuContext)
    if (!ctx) throw new Error("useMenuContext must be used within MenuProvider")
    return ctx
}
