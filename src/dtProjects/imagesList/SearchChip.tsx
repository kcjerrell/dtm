import { Box, HStack } from "@chakra-ui/react"
import { IconButton } from "@/components"
import { FiX } from "@/components/icons/icons"

interface SearchChipProps extends Omit<ChakraProps, "onClick"> {
    onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
    onClickX?: (e: React.MouseEvent<HTMLButtonElement>) => void
    shrink?: boolean
}

function SearchChip(props: SearchChipProps) {
    const { shrink, onClick, onClickX, children, ...restProps } = props

    const truncProps = shrink
        ? {
              flex: "0 1 auto",
              textOverflow: "ellipsis",
              overflow: "hidden",
          }
        : {
              flex: "0 0 auto",
          }

    return (
        <HStack
            flex={shrink ? "0 1 auto" : "0 0 auto"}
            className={"group"}
            cursor={"pointer"}
            onClick={(e) => onClick?.(e)}
            overflow={"hidden"}
            gap={0}
            {...restProps}
        >
            <Box textWrap={"nowrap"} {...truncProps}>
                {children}
            </Box>
            <IconButton
                flex={"0 0 auto"}
                size="min"
                onClick={(e) => {
                    onClickX?.(e)
                }}
                visibility="hidden"
                _groupHover={{ visibility: "visible" }}
            >
                <FiX />
            </IconButton>
        </HStack>
    )
}

export default SearchChip
