# UI Patterns

Apply these rules when building screens, layouts, and UI components.

---

## Use expo-image for Optimized Images

Use `expo-image` instead of React Native's built-in `Image`. It provides
memory-efficient caching, blurhash placeholders, progressive loading, and better
performance in lists.

**Incorrect:**

```tsx
import { Image } from 'react-native'
<Image source={{ uri: url }} style={styles.avatar} />
```

**Correct:**

```tsx
import { Image } from 'expo-image'

<Image source={{ uri: url }} style={styles.avatar} />

// With placeholder and caching:
<Image
  source={{ uri: url }}
  placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }}
  contentFit="cover"
  transition={200}
  priority="high"
  cachePolicy="memory-disk"
  style={styles.image}
/>
```

Key props: `placeholder`, `contentFit` (cover/contain/fill/scale-down),
`transition` (fade ms), `priority` (low/normal/high),
`cachePolicy` (memory/disk/memory-disk/none), `recyclingKey`.

---

## Measuring View Dimensions

Use both `useLayoutEffect` (synchronous on mount) and `onLayout` (for updates).
Use a dispatch updater with comparison to avoid unnecessary re-renders.

```tsx
import { useLayoutEffect, useRef, useState } from 'react'
import { View, LayoutChangeEvent } from 'react-native'

type Size = { width: number; height: number }

function MeasuredBox({ children }: { children: React.ReactNode }) {
  const ref = useRef<View>(null)
  const [size, setSize] = useState<Size | undefined>(undefined)

  useLayoutEffect(() => {
    // Sync measurement on mount (RN 0.82+)
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setSize({ width: rect.width, height: rect.height })
  }, [])

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize((prev) => {
      if (prev?.width === width && prev?.height === height) return prev
      return { width, height }
    })
  }

  return (
    <View ref={ref} onLayout={onLayout}>
      {children}
    </View>
  )
}
```

Use functional setState to compare — don't read state directly in the callback.

---

## Native Modals Over JS-Based Bottom Sheets

Use native `<Modal>` with `presentationStyle="formSheet"` or React Navigation
v7's native form sheet. Native modals have built-in gestures, accessibility,
and better performance.

**Incorrect (JS-based bottom sheet library):**

```tsx
import BottomSheet from 'custom-js-bottom-sheet'

function MyScreen() {
  const sheetRef = useRef<BottomSheet>(null)
  return (
    <View style={{ flex: 1 }}>
      <Button onPress={() => sheetRef.current?.expand()} title="Open" />
      <BottomSheet ref={sheetRef} snapPoints={['50%', '90%']}>
        <Text>Sheet content</Text>
      </BottomSheet>
    </View>
  )
}
```

**Correct (native Modal):**

```tsx
function MyScreen() {
  const [visible, setVisible] = useState(false)
  return (
    <View style={{ flex: 1 }}>
      <Button onPress={() => setVisible(true)} title="Open" />
      <Modal
        visible={visible}
        presentationStyle="formSheet"
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <Text>Sheet content</Text>
      </Modal>
    </View>
  )
}
```

**Correct (React Navigation v7 native form sheet):**

```tsx
<Stack.Screen
  name="Details"
  component={DetailsScreen}
  options={{ presentation: 'formSheet', sheetAllowedDetents: 'fitToContents' }}
/>
```

---

## contentInsetAdjustmentBehavior for Safe Areas

Use `contentInsetAdjustmentBehavior="automatic"` on the root ScrollView instead
of wrapping content in SafeAreaView or adding manual padding. This lets iOS
handle safe area insets natively.

**Incorrect:**

```tsx
<SafeAreaView style={{ flex: 1 }}>
  <ScrollView>{children}</ScrollView>
</SafeAreaView>

// Also incorrect:
const insets = useSafeAreaInsets()
<ScrollView contentContainerStyle={{ paddingTop: insets.top }}>{children}</ScrollView>
```

**Correct:**

```tsx
<ScrollView contentInsetAdjustmentBehavior="automatic">
  {children}
</ScrollView>
```

Handles dynamic safe areas (keyboard, toolbars) and allows content to scroll
behind the status bar naturally.

---

## contentInset for Dynamic ScrollView Spacing

When adding space to a ScrollView that may change (keyboard, toolbars, dynamic
content), use `contentInset` instead of padding. Changing `contentInset` doesn't
trigger layout recalculation.

**Incorrect (padding causes layout recalculation):**

```tsx
<ScrollView contentContainerStyle={{ paddingBottom: bottomOffset }}>
  {children}
</ScrollView>
```

**Correct (contentInset only adjusts scroll bounds):**

```tsx
<ScrollView
  contentInset={{ bottom: bottomOffset }}
  scrollIndicatorInsets={{ bottom: bottomOffset }}
>
  {children}
</ScrollView>
```

Use `scrollIndicatorInsets` alongside `contentInset` to keep the scroll
indicator aligned. For static spacing that never changes, padding is fine.

---

## Modern Styling Patterns

**borderRadius — always pair with `borderCurve: 'continuous'`:**

```tsx
// Incorrect
{ borderRadius: 12 }

// Correct — smoother iOS-style corners
{ borderRadius: 12, borderCurve: 'continuous' }
```

**Spacing — use `gap` on parent, not `margin` on children:**

```tsx
// Incorrect
<View>
  <Text style={{ marginBottom: 8 }}>Title</Text>
  <Text style={{ marginBottom: 8 }}>Subtitle</Text>
</View>

// Correct
<View style={{ gap: 8 }}>
  <Text>Title</Text>
  <Text>Subtitle</Text>
</View>
```

**Gradients — use `experimental_backgroundImage`:**

```tsx
// Incorrect — third-party gradient library
<LinearGradient colors={['#000', '#fff']} />

// Correct — native CSS gradient syntax
<View style={{ experimental_backgroundImage: 'linear-gradient(to bottom, #000, #fff)' }} />
```

**Shadows — use CSS `boxShadow` string:**

```tsx
// Incorrect
{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1 }
{ elevation: 4 }

// Correct
{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }
```

**Typography — limit font sizes; use weight and color for hierarchy:**

```tsx
// Incorrect — varying font sizes
<Text style={{ fontSize: 18 }}>Title</Text>
<Text style={{ fontSize: 14 }}>Subtitle</Text>

// Correct — consistent size, vary weight and color
<Text style={{ fontWeight: '600' }}>Title</Text>
<Text style={{ color: '#666' }}>Subtitle</Text>
<Text style={{ color: '#999' }}>Caption</Text>
```
