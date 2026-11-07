# Rendering Rules

---

## Wrap Strings in Text Components

Strings must be rendered inside `<Text>`. React Native crashes at runtime if a
string is a direct child of `<View>`.

**Incorrect (crashes):**

```tsx
import { View } from 'react-native'

function Greeting({ name }: { name: string }) {
  return <View>Hello, {name}!</View>
  // Error: Text strings must be rendered within a <Text> component.
}
```

**Correct:**

```tsx
import { View, Text } from 'react-native'

function Greeting({ name }: { name: string }) {
  return (
    <View>
      <Text>Hello, {name}!</Text>
    </View>
  )
}
```

Also watch for falsy `&&` patterns that can render `0` unexpectedly:

```tsx
// Incorrect — renders "0" when count is 0
{count && <Badge count={count} />}

// Correct — coerce to boolean
{count > 0 && <Badge count={count} />}
{!!count && <Badge count={count} />}
```
