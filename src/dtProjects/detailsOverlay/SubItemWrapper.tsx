import type { ComponentProps } from "react"
import { type CanvasStack, isCanvasStack, type SubItem } from "../types"
import DetailsImage from "./DetailsImage"
import CanvasStackComponent from "./CanvasStackComponent"
import { useDTP } from "../state/context"

interface SubItemProps extends ChakraProps {
    subItem?: ReadonlyState<SubItem | CanvasStack>
}

function SubItemWrapper(props: SubItemProps) {
    const { subItem, ...restProps } = props

    if (!subItem) return null

    if (isCanvasStack(subItem)) {
        return <CanvasStackComponent key={subItem.nodeId} stack={subItem} {...restProps} />
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
