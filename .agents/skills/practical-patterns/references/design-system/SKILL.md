# Design System Conventions

Apply these rules when building or extending the component library.

---

## Compound Components Over Polymorphic Children

Don't create components that can accept a string if they aren't a text node.
For components like buttons (which have both a container and text), use compound
components instead of polymorphic `children`.

**Incorrect (polymorphic children — ambiguous API):**

```tsx
type ButtonProps = {
  children: string | React.ReactNode
  icon?: React.ReactNode
}

function Button({ children, icon }: ButtonProps) {
  return (
    <Pressable>
      {icon}
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </Pressable>
  )
}

<Button icon={<Icon />}>Save</Button>
<Button><CustomText>Save</CustomText></Button>
```

**Correct (compound components — explicit and composable):**

```tsx
function Button({ children }: { children: React.ReactNode }) {
  return <Pressable>{children}</Pressable>
}

function ButtonText({ children }: { children: React.ReactNode }) {
  return <Text>{children}</Text>
}

function ButtonIcon({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

<Button>
  <Button.Icon><SaveIcon /></Button.Icon>
  <Button.Text>Save</Button.Text>
</Button>

<Button>
  <Button.Text>Cancel</Button.Text>
</Button>
```

---

## Load Fonts Natively at Build Time

Use the `expo-font` config plugin to embed fonts at build time instead of
`useFonts` or `Font.loadAsync`. Embedded fonts are available immediately at
launch with no loading state needed.

**Incorrect (async font loading):**

```tsx
import { useFonts } from 'expo-font'

function App() {
  const [fontsLoaded] = useFonts({
    'Geist-Bold': require('./assets/fonts/Geist-Bold.otf'),
  })

  if (!fontsLoaded) return null

  return <Text style={{ fontFamily: 'Geist-Bold' }}>Hello</Text>
}
```

**Correct (config plugin, fonts embedded at build):**

```json
// app.json
{
  "expo": {
    "plugins": [
      ["expo-font", { "fonts": ["./assets/fonts/Geist-Bold.otf"] }]
    ]
  }
}
```

```tsx
function App() {
  // No loading state needed — font is already available
  return <Text style={{ fontFamily: 'Geist-Bold' }}>Hello</Text>
}
```

After adding fonts to the config plugin, run `npx expo prebuild` and rebuild.

---

## Import from Design System Folder

Re-export dependencies from a design system folder. App code imports from there,
not directly from packages. This enables global changes and easy refactoring
without touching every consumer.

**Incorrect (imports directly from packages):**

```tsx
import { View, Text } from 'react-native'
import { Button } from '@ui/button'
```

**Correct (imports from design system):**

```tsx
// components/view.tsx
import { View as RNView } from 'react-native'

export function View(
  props: Pick<React.ComponentProps<typeof RNView>, 'style' | 'children'>
) {
  return <RNView {...props} />
}

// components/text.tsx
export { Text } from 'react-native'

// components/button.tsx
export { Button } from '@ui/button'
```

```tsx
import { View } from '@/components/view'
import { Text } from '@/components/text'
import { Button } from '@/components/button'
```

Start by simply re-exporting. Customize later without changing app code.
