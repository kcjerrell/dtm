import type { SVGProps } from "react"

export { BiDetail } from "react-icons/bi"
export { FaMagnifyingGlass, FaMinus, FaMoon, FaPlus, FaRegImages } from "react-icons/fa6"
export {
    FiClipboard,
    FiCopy,
    FiEye,
    FiEyeOff,
    FiFolder,
    FiList,
    FiRefreshCw,
    FiSave,
    FiVolume,
    FiVolume2,
    FiX,
    FiXCircle,
} from "react-icons/fi"
export { GiBodyBalance as PoseIcon, GiNeedleDrill } from "react-icons/gi"
export { GoGear } from "react-icons/go"
export { IoChevronDown as ChevronDown, IoChevronForward as ChevronForward } from "react-icons/io5"
export type { IconType } from "react-icons/lib"
export { LuFolderTree, LuLayers, LuMoon, LuSun, LuX } from "react-icons/lu"
export { MdBlock, MdDoNotDisturbOn, MdImageSearch } from "react-icons/md"
export {
    PiCoffee,
    PiEject,
    PiFilmStrip,
    PiImage,
    PiImages,
    PiInfo,
    PiListMagnifyingGlassBold,
    PiPauseFill,
    PiPlayFill,
} from "react-icons/pi"
export {
    TbBrowser,
    TbSortAscending,
    TbSortAscending2,
    TbSortAscendingLetters,
    TbSortDescending2,
    TbSortDescendingNumbers,
    TbWindowMinimize,
} from "react-icons/tb"

export const DottedOutlineIcon = (props: SVGProps<SVGSVGElement>) => {
    return (
        <svg viewBox={"0 0 200 200"} {...props}>
            <rect
                x={20}
                y={20}
                width={160}
                height={160}
                stroke={"currentcolor"}
                strokeWidth={20}
                strokeDasharray={"40 40"}
                strokeDashoffset={"60"}
                fill={"none"}
            />
        </svg>
    )
}
