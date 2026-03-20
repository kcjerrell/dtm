import { Grid } from "@chakra-ui/react"
import { useRef } from "react"
import type { FilterOperator } from "@/commands/DtpServiceTypes"
import { IconButton } from "@/components"
import { FiX } from "@/components/icons/icons"
import { useDTP } from "@/dtProjects/state/context"
import FilterSelect from "./FilterSelect"

interface SearchFilterFormComponentProps extends Omit<ChakraProps, "filter"> {
    onRemove: () => void
    index: number
}

const selectStyle = {
    bgColor: "bg.3",
    color: "fg.2",
    _hover: {
        bgColor: "bg.0",
        transition: "all 0.05s ease-out",
    },
} as const

function SearchFilterForm<T>(props: SearchFilterFormComponentProps) {
    const { onRemove, index, ...boxProps } = props
    const { search } = useDTP()
    const {
        target,
        operator,
        value,
        ValueSelector,
        setValue,
        setOperator,
        setTarget,
        targetCollection,
        operatorCollection,
    } = search.useSearchFilter<T>(index)
    const { valueColumn, valueRow, removeColumn, templateColumns } = getLayout(target)

    const targetRef = useRef<HTMLDivElement>(null)

    return (
        <Grid
            data-filter-root={index}
            // bgColor={"bg.deep"}
            color={"grayc.4"}
            bgColor={"grayc.16"}
            borderRadius={"none"}
            // boxShadow={"0px 0px 18px -8px #00000022"}
            width={"100%"}
            padding={"0px"}
            gap={0}
            justifyContent={"stretch"}
            alignItems={"stretch"}
            gridTemplateColumns={templateColumns}
            _first={{
                borderTopRadius: "lg",
                "& .search-filter-form-top-left": {
                    borderTopLeftRadius: "lg",
                },
                "& .search-filter-form-top-right": {
                    borderTopRightRadius: "lg",
                },
            }}
            _last={{
                borderBottomRadius: "lg",
                "& .search-filter-form-bottom-left": {
                    borderBottomLeftRadius: "lg",
                },
                "& .search-filter-form-bottom-right": {
                    borderBottomRightRadius: "lg",
                },
            }}
            onClick={(e) => {
                if (e.target !== e.currentTarget) return
                if (!target && !!targetRef.current)
                    (
                        targetRef.current?.querySelector("[data-part=trigger]") as HTMLElement
                    )?.click()
            }}
            {...boxProps}
        >
            <FilterSelect
                className={`search-filter-form-top-left ${valueRow === "1" ? "search-filter-form-bottom-left" : ""}`}
                ref={targetRef}
                placeholder={"Select"}
                collection={targetCollection}
                value={target ? [target] : undefined}
                gridColumn={"1"}
                gridRow={"1"}
                {...selectStyle}
                onValueChange={(value) => {
                    setTarget(value.value[0])
                }}
            />
            <FilterSelect
                disabled={!target}
                placeholder={"?"}
                collection={operatorCollection}
                value={operator ? [operator] : undefined}
                pointerEvents={!target ? "none" : "auto"}
                gridColumn={"2"}
                gridRow={"1"}
                {...selectStyle}
                onValueChange={(v) => {
                    setOperator(v.value[0] as FilterOperator)
                }}
                plural={false}
            />
            <ValueSelector
                className={
                    valueRow === "2"
                        ? "search-filter-form-bottom-left search-filter-form-bottom-right"
                        : undefined
                }
                key={`${target}_value`}
                value={value}
                target={target}
                // this disables the hover style if no target is selected
                // lazy disabled :)
                pointerEvents={!target ? "none" : "auto"}
                flex={"1 1 auto"}
                gridColumn={valueColumn}
                gridRow={valueRow}
                {...selectStyle}
                onValueChange={(v: T | undefined) => {
                    setValue(v)
                }}
            />

            <IconButton
                className={`search-filter-form-top-right ${valueRow === "1" ? "search-filter-form-bottom-right" : ""}`}
                {...selectStyle}
                // color={"fg.3"}
                // bgColor={"bg.deep/50"}
                _hover={{ bgColor: "bg.0" }}
                borderRadius={"none"}
                gridColumn={removeColumn}
                gridRow={1}
                size={"xs"}
                onClick={onRemove}
                width={"min-content"}
                height={"full"}
                aspectRatio={"auto"}
                padding={0}
                _focusVisible={{ outlineWidth: "1px", outlineOffset: 0 }}
            >
                <FiX />
            </IconButton>
        </Grid>
    )
}

function getLayout(target?: string) {
    if (target && ["model", "lora", "control", "refiner"].includes(target)) {
        return {
            valueColumn: "1 / 4",
            valueRow: "2",
            removeColumn: "3",
            templateColumns: "1fr 1fr min-content",
        }
    }
    return {
        valueColumn: "3",
        valueRow: "1",
        removeColumn: "4",
        templateColumns: "max-content max-content 1fr min-content",
    }
}

export default SearchFilterForm
