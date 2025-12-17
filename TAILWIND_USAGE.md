# Tailwind CSS Usage Guidelines

## Overview

Tailwind CSS has been integrated with the Reel48 brand color palette. This document provides guidelines on when and how to use Tailwind utilities alongside our existing CSS variable system.

## Brand Colors in Tailwind

Our four brand colors are available as Tailwind utilities:

- **Tidewave Blue** (Primary): `bg-tidewave`, `text-tidewave`, `border-tidewave`
- **Verdant Pulse** (Success): `bg-verdant`, `text-verdant`, `border-verdant`
- **Sunlit Saffron** (Warning): `bg-saffron`, `text-saffron`, `border-saffron`
- **Terra Blush** (Danger/Error): `bg-blush`, `text-blush`, `border-blush`

### Semantic Aliases

- `bg-primary`, `text-primary` → Tidewave Blue
- `bg-success`, `text-success` → Verdant Pulse
- `bg-warning`, `text-warning` → Sunlit Saffron
- `bg-danger`, `text-danger` → Terra Blush

### Color Shades

Each brand color has shade variants (50-900) available:
- `bg-tidewave-500` (default)
- `bg-tidewave-100` (light)
- `bg-tidewave-600` (hover/dark)
- etc.

## When to Use Tailwind

### ✅ Use Tailwind For:

1. **Spacing Utilities**
   - Padding: `p-4`, `px-6`, `py-2`
   - Margin: `m-4`, `mx-auto`, `my-8`
   - Gap: `gap-4`, `gap-x-2`, `gap-y-6`

2. **Layout Utilities**
   - Display: `flex`, `grid`, `hidden`, `block`
   - Flexbox: `flex-col`, `items-center`, `justify-between`
   - Grid: `grid-cols-3`, `grid-rows-2`

3. **Responsive Design**
   - Breakpoints: `md:`, `lg:`, `xl:`
   - Example: `md:flex lg:grid xl:hidden`

4. **Quick Color Applications**
   - Backgrounds: `bg-tidewave`, `bg-verdant-light`
   - Text: `text-tidewave`, `text-verdant`
   - Borders: `border-tidewave`, `border-2`

5. **Border Utilities**
   - Width: `border`, `border-2`, `border-4`
   - Radius: `rounded`, `rounded-lg`, `rounded-full`
   - Style: `border-solid`, `border-dashed`

6. **Typography**
   - Size: `text-sm`, `text-lg`, `text-xl`
   - Weight: `font-normal`, `font-semibold`, `font-bold`
   - Alignment: `text-center`, `text-right`

7. **Quick Styling Needs**
   - Shadows: `shadow`, `shadow-md`, `shadow-lg`
   - Opacity: `opacity-50`, `opacity-75`
   - Transitions: `transition`, `transition-all`

## When to Use CSS Variables

### ✅ Use CSS Variables For:

1. **Complex Component Styles**
   - When you need multiple properties that work together
   - Custom animations and transitions
   - Complex hover states

2. **Theme-Aware Components**
   - Components that need to access colors in JavaScript
   - Dynamic styling based on theme
   - Components that change based on user preferences

3. **Existing Custom Classes**
   - Don't break existing `.btn-primary`, `.card`, etc.
   - Keep component-specific styles in CSS files
   - Maintain consistency with existing patterns

4. **Better Maintainability**
   - When a style is used in multiple places
   - When you need to ensure consistency across components
   - When the style is part of a design system component

## Color Usage Guidelines

### Primary Actions (Tidewave Blue)
```tsx
// Tailwind
<button className="bg-tidewave text-white hover:bg-tidewave-600">
  Click Me
</button>

// CSS Variable
<button className="btn-primary">
  Click Me
</button>
```

### Success States (Verdant Pulse)
```tsx
// Tailwind
<div className="bg-verdant-light text-verdant border border-verdant">
  Success message
</div>

// CSS Variable
<div className="badge-paid">
  Paid
</div>
```

### Warning States (Sunlit Saffron)
```tsx
// Tailwind
<div className="bg-saffron-light text-saffron">
  Warning message
</div>
```

### Error/Danger States (Terra Blush)
```tsx
// Tailwind
<div className="bg-blush-light text-blush border border-blush">
  Error message
</div>

// CSS Variable
<div className="badge-declined">
  Declined
</div>
```

## Examples

### Example 1: Quick Layout with Tailwind
```tsx
<div className="flex flex-col gap-4 p-6 bg-white rounded-lg shadow-md">
  <h2 className="text-xl font-bold text-tidewave">Title</h2>
  <p className="text-gray-600">Description</p>
  <button className="bg-tidewave text-white px-4 py-2 rounded hover:bg-tidewave-600">
    Action
  </button>
</div>
```

### Example 2: Responsive Design
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards */}
</div>
```

### Example 3: Combining Tailwind and CSS Variables
```tsx
<div className="card p-4 flex items-center gap-4">
  {/* Uses existing .card class + Tailwind utilities */}
</div>
```

## Migration Strategy

### Gradual Adoption
- ✅ Use Tailwind for new components
- ✅ Use Tailwind for spacing and layout in existing components
- ✅ Keep existing CSS classes for complex components
- ✅ Gradually migrate utility-heavy styles to Tailwind
- ❌ Don't replace all CSS immediately
- ❌ Don't break existing component styles

### Best Practices

1. **Start Small**: Use Tailwind for spacing and layout first
2. **Be Consistent**: Choose one approach per component
3. **Document Decisions**: Note when you use Tailwind vs CSS variables
4. **Test Thoroughly**: Ensure styles work across browsers
5. **Maintain Brand**: Always use brand colors, never hardcoded colors

## Common Patterns

### Card Component
```tsx
// Tailwind approach
<div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
  {/* Content */}
</div>

// CSS Variable approach (existing)
<div className="card">
  {/* Content */}
</div>
```

### Button Component
```tsx
// Tailwind approach
<button className="bg-tidewave text-white px-6 py-2 rounded font-semibold hover:bg-tidewave-600 transition">
  Click Me
</button>

// CSS Variable approach (existing)
<button className="btn-primary">
  Click Me
</button>
```

### Status Badge
```tsx
// Tailwind approach
<span className="bg-verdant text-white px-3 py-1 rounded-full text-sm font-semibold">
  Success
</span>

// CSS Variable approach (existing)
<span className="badge-paid">
  Paid
</span>
```

## Notes

- Tailwind scans all files in `src/` for class names
- CSS variables remain available for JavaScript access
- Both systems can coexist - use what makes sense
- Tailwind's JIT mode only includes used classes in the final build
- Brand colors are prioritized: Tidewave Blue for primary, Verdant Pulse for success, Sunlit Saffron for warnings, Terra Blush for errors

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Tailwind Color System](https://tailwindcss.com/docs/customizing-colors)
- Reel48 Brand Colors defined in `frontend/src/App.css`

