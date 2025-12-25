import { IconButton } from "@/components"
import { chakra, HStack } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import { createContext, use, useEffect, useMemo, useState, type ComponentProps } from "react"
import { FiX } from "react-icons/fi"
import { useDTP } from "../dtProjects/state/context"

const dur = 0.2

interface FloatIndicatorProps extends ChakraProps {
	children: React.ReactNode
}

function Root(props: FloatIndicatorProps) {
	const { children, ...restProps } = props

	const [hasAltExtension, setHasAltExtension] = useState(false)

	return (
		<IndicatorContext value={{ hasAltExtension, setHasAltExtension }}>
			<IndicatorWrapper {...restProps}>
				<Base>
					{children}
				</Base>
			</IndicatorWrapper>
		</IndicatorContext>
	)
}

const IndicatorContext = createContext(undefined)

const IndicatorWrapper = chakra(
	motion.div,
	{
		base: {
			display: "flex",
			gap: 0,
			padding: 0,
			zIndex: 0,
		},
	},
	{
		defaultProps: {
			transition: { duration: dur, ease: "easeInOut" },
			initial: { opacity: 0 },
			animate: "normal",
			exit: { opacity: 0 },
			variants: {
				hovering: {},
				normal: { opacity: 1 },
			},
			className: "group",
			layout: true,
			whileHover: "hovering",
		},
	},
)

const Base = chakra(
	motion.div,
	{
		base: {
			display: "grid",
			gridTemplateColumns: "1fr auto",
			gap: 0,
			padding: 0,
			flexDirection: "row",
			borderLeftRadius: "md",
			borderRightRadius: "md",
			border: "1px solid #777777FF",
			position: "relative",
			boxShadow: "0px 0px 8px -2px #00000077, 0px 2px 5px -3px #00000077",
			color: "fg.3",
			bgColor: "bg.deep",
			fontSize: "1rem",
			alignItems: "stretch",
			justifyContent: "stretch",
			overflow: "clip",
		},
	},
	{
		defaultProps: {
			variants: {},
			transition: {
				duration: dur,
				delay: dur * 0.8,
				visibility: { duration: 0, delay: dur * 0.8 },
			},
		},
	},
)

interface ExtensionProps extends ChakraProps {
	altExt?: boolean
}
const Extension = (props: ExtensionProps) => {
	const { altExt, children, ...restProps } = props
	const { hasAltExtension, setHasAltExtension } = use(IndicatorContext)

	const variants = useMemo(() => {
		if (!hasAltExtension) {
			return {
				normal: () => {},
				hovering: () => {},
			}
		}
		const visible = () => ({
			opacity: 1,
		})
		const hidden = () => ({
			opacity: 0,
		})
		if (altExt) {
			return {
				normal: hidden,
				hovering: visible,
			}
		} else {
			return {
				normal: visible,
				hovering: hidden,
			}
		}
	}, [hasAltExtension, altExt])

	useEffect(() => {
		if (altExt) setHasAltExtension(true)

		return () => {
			setHasAltExtension(false)
		}
	}, [altExt, setHasAltExtension])

	return (
		<ExtensionBase {...restProps} variants={variants} transition={{ duration: dur }}>
			{children}
		</ExtensionBase>
	)
}

const ExtensionBase = chakra(motion.div, {
	base: {
		gridArea: "1/2",
		// margin: "0.25rem",
		// marginLeft: "0.5rem",
		margin: 1,
		overflow: "clip",
		alignContent: "center",
		justifyContent: "center",
	},
})

const Label = chakra(
	motion.div,
	{
		base: {
			bgColor: "bg.3",
			color: "fg.2",
			fontWeight: 500,
			paddingX: 2,
			outline: "1px solid #777777ff",
			zIndex: 1,
			cursor: "pointer",
			borderLeftRadius: "md",
			borderRightRadius: "xl",
			boxShadow: "0px 0px 6px -2px #000000",
			alignContent: "center",
			height: "2rem",
		},
	},
	{
		defaultProps: {
			// layout: true,
			transition: { duration: dur },
			variants: {
				hovering: {},
				normal: {},
			},
		},
	},
)

const FloatIndicator = {
	Root,
	Label,
	Extension
}

export default FloatIndicator
