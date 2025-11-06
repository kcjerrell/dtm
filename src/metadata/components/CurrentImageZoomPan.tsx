// @ts-nocheck

import { Box, chakra, Flex } from "@chakra-ui/react"
import { MetadataStore } from "../state/store"
import { useSnapshot } from "valtio"
import { motion, useMotionValue, useSpring } from 'motion/react'
import { showPreview } from '@/components/preview'
import { useEffect, useRef } from 'react'

interface CurrentImageProps extends ChakraProps {}

function CurrentImage(props: CurrentImageProps) {
	const { ...restProps } = props

	const snap = useSnapshot(MetadataStore)
	const { currentImage } = snap

	const zoomMv = useSpring(1, {bounce: 0, visualDuration: 0.2})
  const originMv = useMotionValue("0px 0px")
  const offX = useSpring(0, { bounce: 0, visualDuration: 0.2 })
  const offY = useSpring(0, { bounce: 0, visualDuration: 0.2 })

  const pinchXY = useRef([0, 0])
  const imgRef = useRef<HTMLImageElement>(null) 

  useEffect(() => {
    if (currentImage?.id) {
      zoomMv.set(1)
      offX.set(0)
      offY.set(0)
    }

  }, [currentImage?.id, offX, offY, zoomMv])

	return (
		<Box
			position={"relative"}
			flex={"1 1 auto"}
			display="flex"
			justifyContent="center"
			alignItems="center"
			minWidth={0}
			minHeight={0}
			padding={currentImage ? 1 : 8}
			width={"100%"}
			maxHeight={["40%", "unset"]}
			onWheel={(e) => {
				if (e.ctrlKey === true) {
					e.preventDefault()
					const box = imgRef.current.getBoundingClientRect()
		  const mx = e.clientX - box.x
		  const my = e.clientY - box.y
		  
		  const scale = zoomMv.get()
		  const newScale = Math.min(Math.max(scale * (1 - e.deltaY), 0.5), 20) // e.deltaY > 0 ? scale * 0.8 : scale * 1.2

		  const rx = mx / box.width
		  const ry = my / box.height

		  const mx2 = box.width / scale * newScale * rx
		  const my2 = box.height / scale * newScale * ry
		  
		  const ox = offX.get() + mx - mx2
		  const oy = offY.get() +  my - my2

		  offX.set(ox) 
		  offY.set(oy)
		  zoomMv.set(newScale)
				}
		else {
		  offX.set(offX.get() - e.deltaX * 10)
		  offY.set(offY.get() - e.deltaY * 10)
		}
			}}
			{...restProps}
		>
			{currentImage?.url ? (
				<Img
					key={currentImage?.id}
					ref={imgRef}
					src={currentImage?.url}
					// onClick={(e) => showPreview(e.currentTarget)}
					style={{
						scale: zoomMv,
						transformOrigin: "0 0",
            x: offX,
            y: offY,
					}}
				/>
			) : (
				<Flex color={"fg/50"} fontSize={"xl"} justifyContent={"center"} alignItems={"center"}>
					Drop image here
				</Flex>
			)}
		</Box>
	)
}

export default CurrentImage

export const Img = motion.create(chakra(
  "img",{
    base: {
      maxWidth: "100%",
      maxHeight: "100%",
      minWidth: 0,
      minHeight: 0,
      borderRadius: "sm",
      boxShadow: "pane1"
    },
  }),
)