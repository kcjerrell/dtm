# Frontend state conventions

Use React `useState` for components with only one or two simple, independent state values. For components with several related values or more complicated state transitions, keep component state together in a Valtio proxy created with `useProxyRef`.

```tsx
const { state, snap } = useProxyRef(() => ({
    outputDir: "",
    format: "jpg" as "jpg" | "png",
    error: null as string | null,
}))
```

- Add an explicit type assertion when TypeScript would otherwise infer an overly narrow or ambiguous type, especially for `null`, union values, and empty collections.
- During render, read proxy values from `snap`. This includes JSX values, conditions, labels, and disabled states.
- In event handlers, effects, async callbacks, and other code that runs outside render, read from and write to `state`.
- In effect dependency arrays, list the relevant `snap` properties so React reruns the effect when those rendered values change. Read the current values from `state` inside the effect callback.
- If an exhaustive-dependencies lint rule cannot infer this proxy/snapshot relationship, add a narrow suppression explaining that the snapshot dependencies intentionally trigger proxy reads.
- Keep non-rendering coordination values such as DOM references and async request sequence counters in `useRef`.
- Pass the mutable proxy during render only when a child API explicitly requires it, such as `PanelList`'s `itemsState` prop.

```tsx
<Input
    value={snap.outputDir}
    onChange={(event) => {
        state.outputDir = event.target.value
    }}
/>
```
