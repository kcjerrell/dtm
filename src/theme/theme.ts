import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"

const themeConfig = defineConfig({
    globalCss: {
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
        "#root": {
            bgColor: "#73747540",
            overflow: "clip",
            height: "100vh",
            width: "100vw",
            position: "relative",
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
        semanticTokens: {
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
                            _light: "#434753",
                            _dark: "#b9bfc5",
                        },
                    },
                    "3": {
                        value: {
                            _light: "#565e67",
                            _dark: "#8e97a2",
                        },
                    },
                },
                grays: {
                    "0": { value: "#0e0f10" },
                    "1": { value: "#141617" },
                    "2": { value: "#1f2224" },
                    "3": { value: "#272932" },
                    "4": { value: "#272a2d" },
                    "5": { value: "#434753" },
                    "6": { value: "#434753" },
                    "7": { value: "#565e67" },
                    "8": { value: "#8e97a2" },
                    "9": { value: "#b9bfc5" },
                    "10": { value: "#c7c9ca" },
                    "11": { value: "#dbdddf" },
                    "12": { value: "#e0e1e2" },
                    "13": { value: "#e8eaeb" },
                    "14": { value: "#f2f3f4" },
                },
                highlight: {
                    DEFAULT: {
                        value: {
                            _light: "#EC5F47",
                            // _light: "#e9624dff",
                            _dark: "#d25542",
                        },
                    },
                },
                info: {
                    DEFAULT: {
                        value: {
                            _light: "#5098dbff",
                            _dark: "#689fd3",
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
                // xs: { value: "0.75rem" },
                // sm: { value: "1rem" },
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
        },
    },
})

export const system = createSystem(defaultConfig, themeConfig)
