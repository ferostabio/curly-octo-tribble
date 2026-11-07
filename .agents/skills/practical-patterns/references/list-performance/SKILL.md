# List Performance

Apply these rules whenever building or reviewing any scrollable list in React Native.

---

## Use a List Virtualizer for Any List

Use LegendList or FlashList instead of ScrollView with mapped children — even
for short lists. Virtualizers only render visible items, reducing memory usage
and mount time.

**Incorrect (ScrollView renders all items at once):**

```tsx
function Feed({ items }: { items: Item[] }) {
  return (
    <ScrollView>
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </ScrollView>
  )
}
// 50 items = 50 components mounted, even if only 10 visible
```

**Correct (LegendList):**

```tsx
import { LegendList } from '@legendapp/list'

function Feed({ items }: { items: Item[] }) {
  return (
    <LegendList
      data={items}
      renderItem={({ item }) => <ItemCard item={item} />}
      keyExtractor={(item) => item.id}
      estimatedItemSize={80}
    />
  )
}
```

**Alternative (FlashList):**

```tsx
import { FlashList } from '@shopify/flash-list'

function Feed({ items }: { items: Item[] }) {
  return (
    <FlashList
      data={items}
      renderItem={({ item }) => <ItemCard item={item} />}
      keyExtractor={(item) => item.id}
    />
  )
}
```

---

## Stable Object References

Don't map or filter data before passing to virtualized lists. Virtualization
relies on object reference stability — new references cause full re-renders of
all visible items.

**Incorrect (creates new object references on every render):**

```tsx
function DomainSearch() {
  const { keyword, setKeyword } = useKeywordStore()
  const { data: tlds } = useTlds()
  // Bad: creates new objects on every render, reparenting the entire list
  const domains = tlds.map((tld) => ({ domain: `${keyword}.${tld.name}`, ...tld }))
  return <LegendList data={domains} renderItem={({ item }) => <DomainItem item={item} />} />
}
```

**Correct (stable references, transform inside items):**

```tsx
const renderItem = ({ item }) => <DomainItem tld={item} />

function DomainSearch() {
  const { data: tlds } = useTlds()
  return <LegendList data={tlds} renderItem={renderItem} />
}

function DomainItem({ tld }: { tld: Tld }) {
  // Transform within items; use Zustand selector for dynamic data
  const domain = useKeywordStore((s) => s.keyword + '.' + tld.name)
  return <Text>{domain}</Text>
}
```

Sorting creates a new array instance but is fine when inner object references
are stable:

```tsx
const sortedTlds = tlds.toSorted((a, b) => a.name.localeCompare(b.name))
return <LegendList data={sortedTlds} renderItem={renderItem} />
```

---

## Hoist Callbacks to the Root of Lists

When passing callback functions to list items, create a single instance at the
root. Items call it with their identifier.

**Incorrect (creates a new callback on each render):**

```tsx
<LegendList
  renderItem={({ item }) => {
    const onPress = () => handlePress(item.id) // bad: new function every render
    return <Item item={item} onPress={onPress} />
  }}
/>
```

**Correct (single function instance):**

```tsx
const onPress = useCallback((id: string) => handlePress(id), [handlePress])

<LegendList
  renderItem={({ item }) => <Item item={item} onPress={onPress} />}
/>
```

---

## Avoid Inline Objects in renderItem

Don't create new objects inside `renderItem` — they break memoization by
creating new references on every render.

**Incorrect:**

```tsx
renderItem={({ item }) => (
  <UserRow
    user={{ id: item.id, name: item.name }}          // bad: new object every render
    style={{ backgroundColor: item.isActive ? 'green' : 'gray' }} // bad: same issue
  />
)}
```

**Correct (pass item directly, hoist static styles):**

```tsx
const activeStyle = { backgroundColor: 'green' }
const inactiveStyle = { backgroundColor: 'gray' }

renderItem={({ item }) => (
  <UserRow
    user={item}
    style={item.isActive ? activeStyle : inactiveStyle}
  />
)}
```

Note: with React Compiler enabled, these manual optimizations become less critical.

---

## Pass Primitives to List Items for Memoization

Primitive props (strings, numbers, booleans) enable shallow comparison in
`memo()` to work correctly, skipping re-renders when values haven't changed.

**Incorrect (object prop — memo compares by reference):**

```tsx
const UserRow = memo(function UserRow({ user }: { user: User }) {
  return <Text>{user.name}</Text>
})
renderItem={({ item }) => <UserRow user={item} />}
```

**Correct (primitive props — memo compares by value):**

```tsx
const UserRow = memo(function UserRow({ id, name }: { id: string; name: string }) {
  return <Text>{name}</Text>
})
renderItem={({ item }) => <UserRow id={item.id} name={item.name} />}
```

For callbacks, pass ID and handle inside child:

```tsx
// Incorrect
<UserRow name={item.name} onPress={() => handlePress(item.id)} />

// Correct
<UserRow id={item.id} name={item.name} />

const UserRow = memo(function UserRow({ id, name }: Props) {
  const handlePress = useCallback(() => { /* use id */ }, [id])
  return <Pressable onPress={handlePress}><Text>{name}</Text></Pressable>
})
```

---

## Keep List Items Lightweight

List items should be as inexpensive to render as possible. No queries, minimal
hooks, limited Context access. Virtualized lists render many items during
scroll — expensive items cause jank.

**Incorrect (heavy list item):**

```tsx
function ProductRow({ id }: { id: string }) {
  const { data: product } = useQuery(['product', id], () => fetchProduct(id)) // bad
  const theme = useContext(ThemeContext) // bad
  const cart = useContext(CartContext)   // bad
  const recommendations = useMemo(() => computeRecommendations(product), [product]) // bad
  return <View>{/* ... */}</View>
}
```

**Correct (lightweight, receives pre-computed props):**

```tsx
function ProductRow({ name, price, imageUrl }: Props) {
  return (
    <View>
      <Image source={{ uri: imageUrl }} />
      <Text>{name}</Text>
      <Text>{price}</Text>
    </View>
  )
}
```

For shared values, prefer Zustand selectors over Context:

```tsx
// Context re-renders on any cart change
const { items } = useContext(CartContext)
const inCart = items.includes(id) // bad

// Zustand selector — only re-renders when this item's value changes
const inCart = useCartStore((s) => s.items.has(id)) // good
```

---

## Use Compressed Images in Lists

Always load compressed, appropriately-sized images. Full-resolution images
consume excessive memory and cause scroll jank.

**Incorrect:**

```tsx
// Loading a 4000x3000 image for a 100x100 thumbnail
<Image source={{ uri: product.imageUrl }} style={{ width: 100, height: 100 }} />
```

**Correct (request sized image from CDN, use expo-image):**

```tsx
import { Image } from 'expo-image'

const thumbnailUrl = `${product.imageUrl}?w=200&h=200&fit=cover` // 2x for retina

<Image
  source={{ uri: thumbnailUrl }}
  style={{ width: 100, height: 100 }}
  contentFit="cover"
/>
```

---

## Use Item Types for Heterogeneous Lists

When a list has different item layouts (messages, images, headers), provide
`getItemType` to put items into separate recycling pools so they don't get
recycled into wrong component types.

**Incorrect (single component with conditionals):**

```tsx
function ListItem({ item }: { item: Item }) {
  if (item.isHeader) return <HeaderItem title={item.text} />
  if (item.imageUrl) return <ImageItem url={item.imageUrl} />
  return <MessageItem text={item.text} />
}

<LegendList data={items} renderItem={({ item }) => <ListItem item={item} />} recycleItems />
```

**Correct (typed items, getItemType):**

```tsx
type FeedItem = HeaderItem | MessageItem | ImageItem

<LegendList
  data={items}
  keyExtractor={(item) => item.id}
  getItemType={(item) => item.type}
  getEstimatedItemSize={(index, item, itemType) => {
    switch (itemType) {
      case 'header': return 48
      case 'message': return 72
      case 'image': return 300
      default: return 72
    }
  }}
  renderItem={({ item }) => {
    switch (item.type) {
      case 'header': return <SectionHeader title={item.title} />
      case 'message': return <MessageRow text={item.text} />
      case 'image': return <ImageRow url={item.url} />
    }
  }}
  recycleItems
/>
```
