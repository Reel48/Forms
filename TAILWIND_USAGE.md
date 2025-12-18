# Tailwind CSS Usage Guidelines

## Overview

Tailwind CSS has been integrated with the Reel48 brand color palette. This document provides guidelines on when and how to use Tailwind utilities alongside our existing CSS variable system.

## Color System Overview

We use **two color systems** working together:

1. **Brand Colors** - For primary elements, navigation, and brand consistency
2. **Tailwind Default Colors** - For tags, buttons, UI elements, and variety

## Brand Colors in Tailwind

Reel48 uses a single brand color for primary elements:

- **Reel48 Blue** (Primary): `bg-reel48-blue`, `text-reel48-blue`, `border-reel48-blue`
  - Default: `#1D2134`
  - Light: `bg-reel48-blue-light` (10% opacity)
  - Hover: `bg-reel48-blue-hover` (`#151822`)

### Brand Color Shades

Reel48 Blue has shade variants (50-900) available:
- `bg-reel48-blue-500` (default: #1D2134)
- `bg-reel48-blue-100` (light)
- `bg-reel48-blue-600` (hover/dark)
- etc.

## Tailwind Default Colors

**Use Tailwind's default colors for tags, buttons, and UI elements** throughout the site. All default Tailwind colors are available:

### Available Color Palettes

- **Primary Colors**: `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`
- **Neutral Colors**: `slate`, `gray`, `zinc`, `neutral`, `stone`

### Color Shades

Each color has 11 shades (50-950):
- `bg-blue-50` (lightest)
- `bg-blue-100`
- `bg-blue-200`
- ...
- `bg-blue-500` (default/middle)
- ...
- `bg-blue-900`
- `bg-blue-950` (darkest)

### Examples

```tsx
// Tags with Tailwind colors
<span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">Tag</span>
<span className="bg-green-100 text-green-800 px-2 py-1 rounded">Success</span>
<span className="bg-red-100 text-red-800 px-2 py-1 rounded">Error</span>
<span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">Category</span>

// Buttons with Tailwind colors
<button className="bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600">
  Action
</button>
<button className="bg-emerald-500 text-white px-4 py-2 rounded hover:bg-emerald-600">
  Confirm
</button>

// Status indicators
<div className="bg-yellow-50 border border-yellow-200 text-yellow-800">
  Pending
</div>
<div className="bg-teal-50 border border-teal-200 text-teal-800">
  Active
</div>
```

### When to Use Which Colors

**Use Brand Colors For:**
- Primary navigation
- Main CTAs (Call-to-Action buttons)
- Brand-specific elements
- Headings and primary text
- Footer and utility bars

**Use Tailwind Default Colors For:**
- Tags and badges
- Secondary buttons
- Status indicators
- UI elements that need variety
- Categorization and organization
- Non-brand-specific components

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

### Primary Actions (Use Brand Colors)
```tsx
// Main CTA - Use Reel48 Blue
<button className="bg-reel48-blue text-white hover:bg-reel48-blue-600">
  Primary Action
</button>

// Or use CSS Variable
<button className="btn-primary">
  Primary Action
</button>
```

### Tags and Badges (Use Tailwind Default Colors)
```tsx
// Category tags
<span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
  Technology
</span>
<span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">
  Design
</span>
<span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
  Marketing
</span>

// Status badges
<span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-semibold">
  Pending
</span>
<span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-semibold">
  Active
</span>
<span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-semibold">
  Inactive
</span>
```

### Buttons (Use Tailwind Default Colors for Variety)
```tsx
// Secondary buttons with Tailwind colors
<button className="bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600">
  Secondary Action
</button>
<button className="bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600">
  Confirm
</button>
<button className="bg-violet-500 text-white px-4 py-2 rounded hover:bg-violet-600">
  Special Action
</button>
```

### Success States (Brand Color for Brand Consistency)
```tsx
// Brand success - Use Verdant Pulse
<div className="bg-verdant-light text-verdant border border-verdant">
  Success message
</div>

// Or use CSS Variable
<div className="badge-paid">
  Paid
</div>
```

### Warning States (Brand Color for Brand Consistency)
```tsx
// Brand warning - Use Sunlit Saffron
<div className="bg-saffron-light text-saffron">
  Warning message
</div>
```

### Error/Danger States (Brand Color for Brand Consistency)
```tsx
// Brand error - Use Terra Blush
<div className="bg-blush-light text-blush border border-blush">
  Error message
</div>

// Or use CSS Variable
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
// Tailwind default colors for variety
<span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
  Active
</span>
<span className="bg-amber-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
  Pending
</span>
<span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
  Inactive
</span>

// Brand colors for brand-specific statuses
<span className="bg-verdant text-white px-3 py-1 rounded-full text-sm font-semibold">
  Paid (Brand Success)
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
- Reel48 Blue (#1D2134) is used for the navbar and primary brand elements
- Utility bar uses Tailwind blue-500 (rgb(59 130 246))

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Tailwind Color System](https://tailwindcss.com/docs/customizing-colors)
- Reel48 Brand Colors defined in `frontend/src/App.css`

