---
description: Refactor a component by extracting base styled components using the Chakra factory
---

# Chakra Component Extraction Workflow

**Purpose**: Simplify component trees for high-level components by extracting base styled components using the Chakra factory (`chakra()`). This moves most visual props out of JSX and into reusable recipes, making the high-level component code cleaner and easier to maintain.

## Steps

### 1. Identify the Target Component
- Review the component the user wants to refactor.
- Identify elements with significant inline styling (e.g., `style={{...}}`, many layout props like `padding`, `borderRadius`, `bgColor`, etc.).
- Look for patterns where similar styling is repeated or where conditional styling is used.

### 2. Create a `common.tsx` File (if needed)
- If one doesn't exist in the same directory, create a `common.tsx` file.
- This file will hold all the Chakra factory components (recipes) for that feature area.

### 3. Define Base Components with `chakra()`
- For each identified element, create a styled component using `chakra('div')` or `chakra(motion.div)` (if animation is needed).
- Move all static visual styles into the `base` object of the recipe.
- Example:
  ```tsx
  export const MyContainer = chakra("div", {
      base: {
          display: "flex",
          padding: 4,
          borderRadius: "md",
          bgColor: "bg.1",
      },
  })
  ```

### 4. Add Variants for Conditional Styles
- Identify any conditional styling in the original component (e.g., `style={{ filter: isActive ? "brightness(0.5)" : "none" }}`).
- Convert these into boolean or enum variants in the recipe.
- Example:
  ```tsx
  variants: {
      dimmed: {
          true: { filter: "brightness(0.5)", transition: "filter 0.3s ease" },
      },
      selected: {
          true: { border: "2px solid blue" },
      },
  },
  ```

### 5. Forward Motion Props (if applicable)
- If the component uses `motion.div` or similar, ensure `transition` and other motion props are forwarded.
- Example:
  ```tsx
  export const MyMotionContainer = chakra(motion.div, {
      base: { /* ... */ },
  }, { forwardProps: ["transition"] })
  ```

### 6. Refactor the Original Component
- Import the new base components from `common.tsx`.
- Replace the original JSX elements with the new styled components.
- Remove inline `style` attributes; use component props or variants instead.
- Spread any remaining dynamic styles as props, not via `style={{...}}`.

### 7. Update Prop Types
- Change the component's props interface to extend `ComponentProps<typeof YourBaseComponent>`.
- This ensures proper type inference for all style props.
- Example:
  ```tsx
  import { type ComponentProps } from "react"
  import { MyContainer } from "./common"

  interface MyComponentProps extends ComponentProps<typeof MyContainer> {
      // custom props here
  }
  ```

### 8. Verify and Clean Up
- Ensure no `style={{...}}` attributes remain unless absolutely necessary for truly dynamic, non-variant styles.
- Verify that the component renders correctly.
- Remove any unused imports from the refactored file.

## Key Principles

- **Simplicity**: The goal is to make the high-level component's JSX tree as clean as possible, with minimal visual props.
- **Reusability**: Recipes in `common.tsx` can be reused across multiple components in the same feature area.
- **Variants over inline styles**: Prefer boolean/enum variants for conditional styling.
- **Type safety**: Use `ComponentProps<typeof ...>` for proper type inference.
