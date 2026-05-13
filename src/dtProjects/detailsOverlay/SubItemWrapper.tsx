import type { ComponentProps } from "react"
import { type CanvasStack, isCanvasStack, type SubItem } from "../types"
import CanvasStackComponent from "./CanvasStackComponent"
import DetailsImage from "./DetailsImage"

interface SubItemProps extends ChakraProps {
    subItem?: ReadonlyState<SubItem | CanvasStack>
}

function SubItemWrapper(props: SubItemProps) {
    const { subItem, ...restProps } = props

    if (!subItem) return null

    if (isCanvasStack(subItem)) {
        return (
            <CanvasStackComponent
                key={subItem.nodeId}
                {...(restProps as ComponentProps<typeof CanvasStackComponent>)}
                stack={subItem}
            />
        )
    }

    return (
        <DetailsImage
            key={"subitem_image"}
            pixelated={subItem.tensorId?.startsWith("color")}
            maskSrc={subItem.applyMask ? subItem.maskUrl : undefined}
            src={subItem.url}
            subitem={true}
            {...(restProps as ComponentProps<typeof DetailsImage>)}
            naturalSize={{
                width: subItem.width ?? 1,
                height: subItem.height ?? 1,
            }}
        />
    )
}

export default SubItemWrapper
