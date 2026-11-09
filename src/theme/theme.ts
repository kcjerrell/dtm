import {
    createSystem,
    defaultConfig,
    defineConfig,
    defineLayerStyles,
    type SystemStyleObject,
} from "@chakra-ui/react"
import { version } from "@tauri-apps/plugin-os"
import { buttonRecipe } from "./button"

const IS_TAHOE = version().startsWith("26")

const GRAY = [
    "#0e0f10", // 0
    "#191b1d", // 1
    "#26292c", // 2
    "#34393e", // 3
    "#444a50", // 4
    "#545b62", // 5
    "#646b72", // 6
    "#747c83", // 7
    "#858c93", // 8
    "#949ba2", // 9
    "#a4aab0", // 10
    "#b2b7bc", // 11
    "#c0c5c9", // 12
    "#cdd1d5", // 13
    "#d9dcdf", // 14
    "#e4e6e8", // 15
    "#edeeef", // 16
    "#f2f3f4", // 17
]

const grays = GRAY.reduce(
    (acc, value, index) => {
        acc[index] = { value }
        return acc
    },
    {} as Record<number, { value: string }>,
)
const grayc = Array.from({ length: GRAY.length }).reduce<
    Record<number, { value: { _light: string; _dark: string } }>
>((acc, _, index) => {
    acc[index] = {
        value: {
            _light: GRAY[index],
            _dark: GRAY[GRAY.length - 1 - index],
        },
    }
    return acc
}, {})

export const disableAnimations = import.meta.env.VITE_DISABLE_ANIMATIONS === "true"
const disableAnimationStyles: Record<string, SystemStyleObject> = disableAnimations
    ? {
          "*": {
              animation: "none !important",
              transition: "none !important",
              scrollBehavior: "auto !important",
              caretColor: "auto",
              transitionDuration: "0s !important",
              animationDuration: "0s !important",
              animationDelay: "0s !important",
          },
          "*::before": {
              animation: "none !important",
              transition: "none !important",
              transitionDuration: "0s !important",
              animationDuration: "0s !important",
              animationDelay: "0s !important",
          },
          "*::after": {
              animation: "none !important",
              transition: "none !important",
              transitionDuration: "0s !important",
              animationDuration: "0s !important",
              animationDelay: "0s !important",
          },
      }
    : {}
if (disableAnimations) {
    console.debug("Animations have been disabled by environment")
}

const themeConfig = defineConfig({
    globalCss: {
        ...disableAnimationStyles,
        html: {
            overscrollBehavior: "none",
            fontSize: "var(--app-base-size)",
            // zoom: 1.5
        },
        body: {
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif;",
        },
        ".check-bg": {
            bgImage: {
                _light: "url(check_light.png)",
                _dark: "url(check_dark.png)",
            },
            bgSize: "50px 50px",
        },
        ".hide-scrollbar": {
            scrollbarWidth: "none",
        },
        ".hide-scrollbar::-webkit-scrollbar": {
            /*Chrome, Safari, Edge*/
            display: "none",
        },
        ".panel-scroll": {
            // scrollbarGutter: "stable",
            _scrollbar: { backgroundColor: "none", width: "8px", borderRadius: "0 50% 50% 0" },
            _scrollbarThumb: {
                backgroundColor: "fg.2/30",
                width: "4px",
                borderRadius: "2px 7px 7px 2px",
                boxShadow: "pane1",
                borderRight: "1px solid",
                borderColor: "bg.1",
            },
        },
        ".panel-scroll-square": {
            // scrollbarGutter: "stable",
            _scrollbar: { backgroundColor: "none", width: "8px", borderRadius: "2px" },
            _scrollbarThumb: {
                backgroundColor: "fg.2/50",
                width: "4px",
                borderRadius: "2px",
                boxShadow: "pane1",
                borderRight: "1px solid",
                borderColor: "bg.1",
            },
        },
        "#root": {
            bgColor: "#73747540",
            overflow: "clip",
            height: "100vh",
            width: "100vw",
            position: "relative",
        },
        ".blink-anim": {
            animation: "infinite steps(1, end) blink-anim",
        },
    },
    theme: {
        breakpoints: {
            tall: "300px",
            wide: "600px",
            // sm: "300px",
            // md: "600px",
            // lg: "900px",
            // xl: "1200px",
        },
        recipes: {
            button: buttonRecipe,
        },
        layerStyles: defineLayerStyles({
            borderA: {
                value: {
                    border: "1px solid",
                    borderColor: "grayc.10",
                    _dark: { borderColor: "grayc.13" },
                },
            },
            scrollThin: {
                value: {
                    _scrollbar: { backgroundColor: "none", width: "4px", borderRadius: "2px" },
                    _scrollbarThumb: {
                        backgroundColor: "fg.2/50",
                        width: "4px",
                        borderRadius: "2px",
                        boxShadow: "pane1",
                        borderRight: "1px solid",
                        borderColor: "bg.1",
                    },
                },
            },
            marchingBorder: {
                value: {
                    backgroundImage:
                        "linear-gradient(90deg, #000 50%, #FFF 0), linear-gradient(90deg, #000 50%, #FFF 0), linear-gradient(180deg, #000 50%, #FFF 0), linear-gradient(180deg, #000 50%, #FFF 0)",
                    backgroundSize: "15px 2px, 15px 2px, 2px 15px, 2px 15px",
                    backgroundPosition: "0 0, 0 100%, 0 0, 100% 0",
                    backgroundRepeat: "repeat-x, repeat-x, repeat-y, repeat-y",
                },
            },
        }),
        semanticTokens: {
            animations: {
                "marchingBorder": {
                    value: "marching-border 0.8s linear infinite"
                }
            },
            colors: {
                check: {
                    "1": {
                        value: {
                            _light: "#f5f5f7",
                            _dark: "#565e67",
                        },
                    },
                    "2": {
                        value: {
                            _light: "#dbdddf",
                            _dark: "#434753",
                        },
                    },
                    "3": {
                        value: {
                            _light: "#e0e1e2",
                            _dark: "#4c525b",
                        },
                    },
                    "4": {
                        value: {
                            _light: "#c9cbcd",
                            _dark: "#3b3f4a",
                        },
                    },
                },
                bg: {
                    "1": {
                        value: {
                            _light: "#e0e1e2",
                            _dark: "#141617",
                        },
                    },
                    deep: {
                        value: {
                            _light: "#c7c9ca",
                            _dark: "#0e0f10",
                        },
                    },
                    "2": {
                        value: {
                            _light: "#e8eaeb",
                            _dark: "#1f2224",
                        },
                    },
                    "3": {
                        value: {
                            _light: "#f2f3f4",
                            _dark: "#272a2d",
                        },
                    },
                    "0": {
                        value: {
                            _light: "#ffffff",
                            _dark: "#434753",
                        },
                    },
                },
                fg: {
                    "1": {
                        value: {
                            _light: "#272932",
                            _dark: "#dbdddf",
                        },
                    },
                    "2": {
                        value: {
                            _light: GRAY[4],
                            _dark: GRAY[13],
                        },
                    },
                    "3": {
                        value: {
                            _light: GRAY[6],
                            _dark: GRAY[11],
                        },
                    },
                    "4": {
                        value: {
                            _light: GRAY[8],
                            _dark: GRAY[9],
                        },
                    },
                },
                // grays: {
                //     "0": { value: "#0e0f10" },
                //     "1": { value: "#141617" },
                //     "2": { value: "#1f2224" },
                //     "3": { value: "#272932" },
                //     "4": { value: "#272a2d" },
                //     "5": { value: "#434753" },
                //     "6": { value: "#434753" },
                //     "7": { value: "#565e67" },
                //     "8": { value: "#8e97a2" },
                //     "9": { value: "#b9bfc5" },
                //     "10": { value: "#c7c9ca" },
                //     "11": { value: "#dbdddf" },
                //     "12": { value: "#e0e1e2" },
                //     "13": { value: "#e8eaeb" },
                //     "14": { value: "#f2f3f4" },
                // },
                grays,
                grayc,
                highlight: {
                    DEFAULT: {
                        value: {
                            _light: "#EC5F47",
                            _dark: "#D25542",
                        },
                    },
                    "1": {
                        value: {
                            _light: "#D25542",
                            _dark: "#B84F40",
                        },
                    },
                },
                info: {
                    DEFAULT: {
                        value: {
                            _light: "#5098DB",
                            _dark: "#689FD3",
                        },
                    },
                    "1": {
                        value: {
                            _light: "#689FD3",
                            _dark: "#5B8CBA",
                        },
                    },
                },
                bonus: {
                    DEFAULT: {
                        value: {
                            _light: "#c6b9fa",
                            _dark: "#2d2244",
                        },
                    },
                },
                success: {
                    "1": {
                        value: {
                            _light: "#51ac35",
                            _dark: "#66b851ff",
                        },
                    },
                    DEFAULT: {
                        value: {
                            _light: "#d0fcc9",
                            _dark: "#5bc640ff",
                        },
                    },
                },
            },
        },
        tokens: {
            borders: {
                pane1: {
                    value: "1px solid #77777722",
                },
            },
            shadows: {
                pane0: {
                    value: "0px 0px 3px -1px #00000033, 0px 1px 5px -2px #00000033,  0px 2px 8px -3px #00000033",
                },
                pane1: {
                    value: "0px 0px 4px -1px #00000033, 2px 4px 6px -2px #00000022, -1px 4px 6px -2px #00000022,  0px 3px 12px -3px #00000033",
                },
                pane2: {
                    value: "0px 1px 4px -1px #00000044, 2px 6px 10px -4px #00000022, -1px 6px 10px -4px #00000022, 0px 4px 16px -4px #00000044",
                },
            },
            fontSizes: {
                // xs: { value: "0.6rem" },
                // sm: { value: "0.75rem" },
                // md: { value: "0.9rem" },
            },
            sizes: {
                sidebar: {
                    value: IS_TAHOE ? "78px" : "68px",
                },
            },
        },
        keyframes: {
            test: {
                from: { transform: "translateX(0)" },
                to: { transform: "translateX(100%)" },
            },
            fadeOut: {
                from: { opacity: 1 },
                to: { opacity: 0 },
            },
            fadeIn: {
                from: { opacity: 0 },
                to: { opacity: 1 },
            },
            "blink-anim": {
                // "0%, 49.999%": { opacity: 0 },
                "0%, 49.999%": { visibility: "hidden" },
                // "50%, 100%": { opacity: 1 },
                "50%, 100%": { visibility: "visible" },
            },
            "flip-button": {
                "0%": { transform: "rotateY(0deg) skewY(0deg)" },
                "40%, 49%": { transform: "rotateY(-90deg) skewY(20deg)" },
                "50%, 100%": { transform: "rotateY(0deg) skewY(0deg)" },
            },
            "flip-button-inv": {
                "0%, 50%": { transform: "rotateY(0deg) skewY(0deg)" },
                "90%, 99%": { transform: "rotateY(90deg) skewY(-20deg)" },
                "100%": { transform: "rotateY(0deg) skewY(0deg)" },
            },
            "marching-border": {
                to: { backgroundPosition: "-30px 0, 30px 100%, 0 30px, 100% -30px" },
            },
        },
    },
})

export const system = createSystem(defaultConfig, themeConfig)
