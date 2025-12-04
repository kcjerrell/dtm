import { Box, Input } from "@chakra-ui/react"
import { useState } from "react"
import type { FilterValueSelector, ValueSelectorProps } from "./collections"

function FloatValueInputComponent(props: ValueSelectorProps<number>) {
	const { value, onValueChange, ...boxProps } = props
	const [inputValue, setInputValue] = useState(value?.toString?.() ?? "0")

	return (
		<Box border={"none"} {...boxProps}>
			<Input
				value={inputValue}
				onChange={(e) => {
					const valid = e.target.value.match(/^-?\d*\.?\d*$/gm)
					if (valid) {
						setInputValue(e.target.value)
						onValueChange?.(Number(e.target.value))
					}
				}}
			/>
		</Box>
	)
}

const FloatValueInput = FloatValueInputComponent as FilterValueSelector<number>

FloatValueInput.getValueLabel = (value) => {
	return value?.toString() ?? ""
}

export default FloatValueInput
