import { Field, HStack, Input, Text, VStack } from '@chakra-ui/react'
import { memo, type Ref, useEffect, useRef, useState } from 'react'
import { Slider } from './ui/slider'

interface SliderWithInputProps extends ChakraProps {
	value?: number
	current?: number
	min?: number
	max?: number
	step?: number
	strictStep?: boolean
	label?: string
	onValueChange?: (value: number) => void
	size?: 'xs' | 'sm' | 'md' | 'lg'
	immediate?: boolean
	allowOutOfRange?: boolean
	inputBgColor?: string
	input?: Ref<HTMLInputElement>,
	sliderColor?: string
}

function calcHighlightArea(value: number, current: number | undefined, min: number, max: number) {
	if (current === undefined ||Number.isNaN(current) || current === value) return { display: 'none' }

	const range = max - min
	const left = (Math.min(value, current) - min) / range
	const right = 1 - (Math.max(value, current) - min) / range

	return { left: `${left * 100}%`, right: `${right * 100}%` }
}

// eslint-disable-next-line mobx/missing-observer
function SliderWithInput(props: SliderWithInputProps) {
	const {
		value = 0,
		current,
		onValueChange = () => void 0,
		min = 0,
		max = 100,
		step = 1,
		strictStep = false,
		label,
		size,
		immediate = false,
		allowOutOfRange = false,
		input = undefined,
		sliderColor = '#f1806a',
		...rest
	} = props

	const [sliderValue, setSliderValue] = useState(value)
	const [inputValue, setInputValue] = useState(value.toString())

	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		setSliderValue(value)
		setInputValue(value.toString())
	}, [value])

	function onSliderChange(value: number, changeEnd = false) {
		setSliderValue(value)
		setInputValue(value.toString())

		if ((changeEnd || immediate) && isValid(value)) {
			onValueChange?.(value)
		}
	}

	function onInputChange(value: string, final = false) {
		if (!final) {
			setInputValue(value)
			return
		}

		let numberValue = Number.parseFloat(value)
		if (!Number.isNaN(numberValue) && strictStep)
			numberValue = Math.round(numberValue / step) * step

		numberValue = Math.min(Math.max(numberValue, min), max)

		if (!isValid(numberValue)) {
			setSliderValue(Number.NaN)
			return
		}

		setSliderValue(numberValue)
		setInputValue(numberValue.toString())
		onValueChange?.(numberValue)
	}

	function isValid(value: number) {
		const withinRange = allowOutOfRange || (value >= min && value <= max)
		return !Number.isNaN(value) && withinRange
	}

	return (
		<VStack width={'100%'} alignItems={'stretch'} {...rest}>
			<HStack gap={4} justifyContent={'space-between'}>
				{label && (
					<Text fontSize={size} fontWeight={'normal'}>
						{label}
					</Text>
				)}

				{input === undefined && (
					<Field.Root
						invalid={Number.isNaN(sliderValue) || !isValid(sliderValue)}
						width={'3rem'}
						flex={'0 1 auto'}
					>
						<Input
							padding={0}
							height={'1.5rem'}
							ref={inputRef}
							layerStyle={"configInput"}
							paddingInline={0}
							textAlign={'center'}
							value={inputValue}
							inputMode={'numeric'}
							min={min}
							max={max}
							// bgColor={'#fff/25'}
							size={size}
							onChange={(e) => {
								const value = e.currentTarget.value.replace(/[^\d.-]/g, '')
								onInputChange(value)
							}}
							onBlur={(e) => {
								onInputChange(e.currentTarget.value, true)
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter') onInputChange(e.currentTarget.value, true)
							}}
						/>
					</Field.Root>
				)}
			</HStack>

			<Slider
				paddingX={1}
				value={[Number.isNaN(sliderValue) ? (min + max) / 2 : (sliderValue ?? 0)]}
				onValueChange={(e) => onSliderChange(e.value[0])}
				onValueChangeEnd={(e) => onSliderChange(e.value[0], true)}
				min={min}
				max={max}
				step={step}
				flex={'1 1 auto'}
				thumbAlignment={'center'}
				// thumbSize={{ width: 30, height: 3 }}
				size={size === 'xs' ? 'sm' : size}
				colorPalette={Number.isNaN(sliderValue) ? 'red' : 'gray'}
				css={{
					'& .chakra-slider__track': {
						backgroundColor: 'gray',
						height: '2px',
						overflow: 'visible',
						'&::before': {
							// zIndex: -2,
							content: '""',
							position: 'absolute',
							top: '-5px',
							bottom: '-5px',
							backgroundColor: 'blue/50',
							...calcHighlightArea(sliderValue, current, min, max),
						},
					},
					'& .chakra-slider__range': {
						backgroundColor: sliderColor,
						height: '3px',
						top: '-1px',
					},
					'& .chakra-slider__thumb': {
						width: '15px',
						height: '15px',
						borderRadius: '50%',
						backgroundColor: sliderColor,
						border: '2px solid',
						borderColor: 'bg',
					},
				}}
			/>
		</VStack>
	)
}

export default memo(SliderWithInput)
