import { Box, Input } from "@chakra-ui/react"
import { useState } from "react"
import type { FilterValueSelector, ValueSelectorProps } from "./collections"

function IntValueInputComponent(props: ValueSelectorProps<number>) {
	const { value, onValueChange, ...boxProps } = props
	const [inputValue, setInputValue] = useState(value?.toFixed?.(0) ?? "0")

	return (
		<Box {...boxProps}>
			<Input
			border={"none"}
				value={inputValue}
				onChange={(e) => {
					const valid = e.target.value.match(/^-?\d*$/gm)
					if (valid) {
						setInputValue(e.target.value)
						onValueChange?.(Number(e.target.value))
					}
				}}
			/>
		</Box>
	)
}

const IntValueInput = IntValueInputComponent as FilterValueSelector<number>

IntValueInput.getValueLabel = (value) => {
	return value?.toString() ?? ""
}

export default IntValueInput
