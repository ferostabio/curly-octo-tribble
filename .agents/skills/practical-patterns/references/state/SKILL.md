# State Management Patterns

Apply these rules when using `useState` in React Native components.

---

## Use Dispatch Updaters for State That Depends on Current Value

When the next state depends on the current state, use a dispatch updater
(`setState(prev => ...)`) instead of reading the state variable directly.
This avoids stale closures and ensures comparison against the latest value.

**Incorrect (reads state directly — stale closure risk):**

```tsx
const [size, setSize] = useState<Size | undefined>(undefined)

const onLayout = (e: LayoutChangeEvent) => {
  const { width, height } = e.nativeEvent.layout
  if (size?.width !== width || size?.height !== height) {
    setSize({ width, height })
  }
}
```

**Correct (dispatch updater — skips re-render if unchanged):**

```tsx
const [size, setSize] = useState<Size | undefined>(undefined)

const onLayout = (e: LayoutChangeEvent) => {
  const { width, height } = e.nativeEvent.layout
  setSize((prev) => {
    if (prev?.width === width && prev?.height === height) return prev
    return { width, height }
  })
}
```

For counters and other primitive state that depends on current value:

```tsx
// Incorrect
const onTap = () => setCount(count + 1)

// Correct
const onTap = () => setCount((prev) => prev + 1)
```

Note: for primitive states where the next value does NOT depend on current
value, set directly without a dispatch updater.

---

## Use Fallback State Instead of initialState

Use `undefined` as initial state and nullish coalescing (`??`) to fall back to
parent or server values. State represents user intent only — `undefined` means
"user hasn't chosen yet." Reactive fallbacks update when the source changes,
not just on initial render.

**Incorrect (syncs state, loses reactivity):**

```tsx
type Props = { fallbackEnabled: boolean }

function Toggle({ fallbackEnabled }: Props) {
  const [enabled, setEnabled] = useState(fallbackEnabled)
  // If fallbackEnabled changes after mount, state is stale
  return <Switch value={enabled} onValueChange={setEnabled} />
}
```

**Correct (state is user intent, reactive fallback):**

```tsx
type Props = { fallbackEnabled: boolean }

function Toggle({ fallbackEnabled }: Props) {
  const [_enabled, setEnabled] = useState<boolean | undefined>(undefined)
  const enabled = _enabled ?? fallbackEnabled
  // undefined = user hasn't touched it, falls back to prop
  // Once user interacts, their choice persists
  return <Switch value={enabled} onValueChange={setEnabled} />
}
```

**With server data:**

```tsx
function ProfileForm({ data }: { data: User }) {
  const [_theme, setTheme] = useState<string | undefined>(undefined)
  const theme = _theme ?? data.theme
  // Shows server value until user overrides
  // Server refetch updates the fallback automatically
  return <ThemePicker value={theme} onChange={setTheme} />
}
```

---

## Minimize State Variables and Derive Values

Use the fewest state variables possible. If a value can be computed from
existing state or props, derive it during render instead of storing it in state.
Redundant state causes unnecessary re-renders and can drift out of sync.

**Incorrect (redundant state + useEffect):**

```tsx
function Cart({ items }: { items: Item[] }) {
  const [total, setTotal] = useState(0)
  const [itemCount, setItemCount] = useState(0)

  useEffect(() => {
    setTotal(items.reduce((sum, item) => sum + item.price, 0))
    setItemCount(items.length)
  }, [items])

  return (
    <View>
      <Text>{itemCount} items</Text>
      <Text>Total: ${total}</Text>
    </View>
  )
}
```

**Correct (derived values):**

```tsx
function Cart({ items }: { items: Item[] }) {
  const total = items.reduce((sum, item) => sum + item.price, 0)
  const itemCount = items.length

  return (
    <View>
      <Text>{itemCount} items</Text>
      <Text>Total: ${total}</Text>
    </View>
  )
}
```

State should be the minimal source of truth. Everything else is derived.
