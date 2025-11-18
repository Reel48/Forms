# Form Color Components Implementation Plan

## Overview
Add color selection functionality to forms where admins can define multiple "components" (subjects) and customers can select colors for each component. Also update form background to solid dark color (#292c2f).

---

## Phase 1: Form Background Update (Simple)

### 1.1 Update Default Form Theme
**Files to modify:**
- `frontend/src/hooks/useFormBuilder.ts` - Update default theme
- `frontend/src/pages/PublicFormView.tsx` - Ensure background is applied correctly

**Changes:**
- Set default `backgroundType` to `'solid'` (instead of `'gradient'`)
- Set default `backgroundColor` to `'#292c2f'`
- Remove gradient logic for new forms
- Ensure existing forms can still use gradients if they have it set

**Implementation:**
```typescript
// In useFormBuilder.ts
theme: {
  primaryColor: '#667eea',
  secondaryColor: '#764ba2',
  fontFamily: 'Inter, system-ui, sans-serif',
  logoUrl: '',
  backgroundType: 'solid',  // Changed from 'gradient'
  backgroundColor: '#292c2f',  // New default
}
```

---

## Phase 2: Component-Based Color Selection System

### 2.1 Database Schema (No changes needed)
**Current structure is sufficient:**
- `form_fields` table already supports `options` (JSONB) for field configurations
- `form_submission_answers` already has `answer_value` (JSONB) for complex answers
- We can store component definitions in field `options` and color selections in `answer_value`

### 2.2 New Field Type: "Component Color Selector"

**Approach Options:**

#### Option A: New Field Type `component_color_selector` (Recommended)
- Create a dedicated field type specifically for component color selection
- Each field represents one component
- Field `options` contains available colors for that component
- More explicit and easier to manage

#### Option B: Extend Existing Field Type
- Use `multiple_choice` or `dropdown` with special configuration
- Add metadata to identify it as a component selector
- Less explicit but reuses existing infrastructure

**Recommendation: Option A** - Cleaner separation of concerns

### 2.3 Field Configuration Structure

**For `component_color_selector` field type:**

```typescript
{
  field_type: 'component_color_selector',
  label: 'Hat Crown Color',  // Component name
  description: 'Select the color for the hat crown',
  required: true,
  options: [
    { 
      label: 'Blue', 
      value: 'blue',
      color: '#2d69ff',  // Display color
      hex: '#2d69ff'      // Stored value
    },
    { 
      label: 'Red', 
      value: 'red',
      color: '#f23f3a',
      hex: '#f23f3a'
    },
    // ... more colors
  ],
  validation_rules: {
    component_id: 'crown',  // Unique identifier for this component
    component_name: 'Hat Crown'
  },
  order_index: 0
}
```

### 2.4 Submission Answer Structure

**When customer selects a color:**
```json
{
  "field_id": "uuid-of-field",
  "answer_text": "Blue",  // Human-readable
  "answer_value": {
    "component_id": "crown",
    "component_name": "Hat Crown",
    "selected_color": {
      "label": "Blue",
      "value": "blue",
      "hex": "#2d69ff"
    }
  }
}
```

---

## Phase 3: Frontend Implementation

### 3.1 Form Builder (Admin Side)

**Files to modify:**
- `frontend/src/lib/fieldRegistry.ts` - Add new field type definition
- `frontend/src/components/forms/FieldConfigPanel.tsx` - Add color configuration UI
- `frontend/src/components/forms/FieldRenderer.tsx` - Add preview rendering

**New Field Type Definition:**
```typescript
{
  value: 'component_color_selector',
  label: 'Component Color Selector',
  category: 'special',
  defaultConfig: {
    field_type: 'component_color_selector',
    label: 'Component Name',
    description: '',
    required: false,
    validation_rules: {
      component_id: '',  // Auto-generated or admin-entered
      component_name: ''
    },
    options: [],  // Array of color options
    order_index: 0,
    conditional_logic: {},
  },
  needsOptions: true,
}
```

**Color Configuration UI:**
- Component name input
- Component ID (auto-generated from name, editable)
- Color picker/selector to add available colors
- List of configured colors with preview
- Ability to remove colors
- Use brand color palette as defaults

**Color Options Structure:**
```typescript
interface ColorOption {
  label: string;      // "Blue", "Red", etc.
  value: string;      // "blue", "red" (lowercase, no spaces)
  hex: string;        // "#2d69ff"
  color?: string;     // Display color (same as hex)
}
```

### 3.2 Public Form View (Customer Side)

**Files to modify:**
- `frontend/src/pages/PublicFormView.tsx` - Add color selector rendering

**Color Selector UI:**
- Display component name as label
- Show color swatches in a grid or horizontal list
- Each swatch shows:
  - Color circle/square with actual color
  - Color name below
  - Pantone code (if provided) in smaller text
- **Color Preview Section** (IMPERATIVE):
  - Large preview area showing selected color
  - Display selected color name, hex code, and Pantone (if available)
  - Visual color swatch (larger than selection swatches)
  - Updates immediately when color is selected
  - Positioned prominently (above or beside swatches)
- Selected color highlighted with border/checkmark
- Click to select
- Mobile-responsive layout

**Rendering Logic:**
```typescript
case 'component_color_selector':
  const selectedColorOption = field.options.find(opt => opt.value === formValues[fieldId]?.value);
  return (
    <div className="component-color-selector">
      <label>{field.label}</label>
      
      {/* COLOR PREVIEW - Prominently displayed */}
      {selectedColorOption && (
        <div className="color-preview">
          <div 
            className="color-preview-swatch"
            style={{ backgroundColor: selectedColorOption.hex }}
          />
          <div className="color-preview-info">
            <div className="color-preview-name">{selectedColorOption.label}</div>
            <div className="color-preview-hex">{selectedColorOption.hex}</div>
            {selectedColorOption.pantone_code && (
              <div className="color-preview-pantone">{selectedColorOption.pantone_code}</div>
            )}
          </div>
        </div>
      )}
      
      {/* COLOR SELECTION SWATCHES */}
      <div className="color-swatches">
        {field.options.map((color) => (
          <button
            key={color.value}
            onClick={() => handleColorSelect(fieldId, color)}
            className={selectedColorOption?.value === color.value ? 'selected' : ''}
            style={{ backgroundColor: color.hex }}
            aria-label={`${color.label} ${color.hex}`}
          >
            <span className="color-swatch-preview" style={{ backgroundColor: color.hex }} />
            <span className="color-name">{color.label}</span>
            {color.pantone_code && (
              <span className="color-pantone">{color.pantone_code}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
```

### 3.3 Styling

**New CSS classes:**
- `.component-color-selector` - Container
- `.color-preview` - Large preview area (IMPERATIVE - must be prominent)
- `.color-preview-swatch` - Large color display in preview
- `.color-preview-info` - Text info in preview (name, hex, pantone)
- `.color-preview-name` - Color name in preview
- `.color-preview-hex` - Hex code in preview
- `.color-preview-pantone` - Pantone code in preview
- `.color-swatches` - Grid/flex container for swatches
- `.color-swatch` - Individual color button
- `.color-swatch.selected` - Selected state with border/checkmark
- `.color-swatch-preview` - Small color circle in swatch button
- `.color-name` - Color label text
- `.color-pantone` - Pantone code text (smaller, muted)

**Design considerations:**
- **Color Preview**: Large, prominent (min 120x120px), positioned at top
- Preview swatch should be clearly visible with good contrast
- Swatches should be large enough to click (min 60x60px)
- Good contrast for text on colored backgrounds
- Responsive: 3-4 columns on desktop, 2-3 on tablet, 2 on mobile
- Smooth transitions for selection state
- Preview updates with animation when color changes

---

## Phase 4: Pantone & Hex Color Support

### 4.1 Color Input Types
Support two color input methods:
1. **Pantone Colors** - Pantone color codes (e.g., "Pantone 19-4052 TCX Classic Blue")
2. **Hex Colors** - Standard hex color codes (e.g., "#2d69ff")

### 4.2 Color Picker in Form Builder
- Input field for Pantone code (optional)
- Input field for hex color (required)
- Color name/label field (e.g., "Classic Blue")
- Live preview of color as admin types hex
- Validation for hex format (#RRGGBB or #RGB)
- Support for both Pantone + Hex or Hex-only entries

### 4.3 Color Option Structure
```typescript
interface ColorOption {
  label: string;           // "Classic Blue" or custom name
  pantone_code?: string;   // "Pantone 19-4052 TCX" (optional)
  hex: string;             // "#1E3A5F" (required)
  value: string;           // Unique identifier (auto-generated)
}
```

### 4.4 Pantone Color Database (Optional Enhancement)
- Could integrate Pantone color library for lookup
- For now: Admin manually enters Pantone code and hex equivalent
- Future: Auto-populate hex from Pantone code if database available

---

## Phase 5: Data Flow & Validation

### 5.1 Form Submission
- Validate that required components have color selected
- Store both human-readable (`answer_text`) and structured data (`answer_value`)
- Ensure `component_id` is unique within a form

### 5.2 Viewing Submissions
- Display component selections clearly in submission view
- Show color swatch next to selected color name
- Group by component if viewing multiple submissions

---

## Phase 6: Migration & Backward Compatibility

### 6.1 Existing Forms
- Existing forms continue to work
- New field type is opt-in
- No breaking changes to existing field types

### 6.2 Default Background
- New forms get `#292c2f` background by default
- Existing forms keep their current theme settings
- Admins can change background in form settings

---

## Implementation Order

1. **Phase 1** - Form background update (quick win)
2. **Phase 3.1** - Add field type to registry
3. **Phase 3.2** - Build admin UI for configuring components
4. **Phase 3.3** - Build customer-facing color selector
5. **Phase 4** - Integrate brand colors
6. **Phase 5** - Test submission flow
7. **Phase 6** - Handle edge cases and polish

---

## Technical Considerations

### Component ID Generation
- Auto-generate from component name: `"Hat Crown"` → `"hat-crown"`
- Sanitize: lowercase, replace spaces with hyphens, remove special chars
- Ensure uniqueness within form (add number suffix if duplicate)

### Color Validation
- Validate hex format: `#RRGGBB` or `#RGB`
- Ensure colors are accessible (contrast ratios)
- Warn if custom color is too similar to existing

### Performance
- Color swatches should render efficiently
- No heavy computations in render loop
- Consider memoization for color option processing

### Accessibility
- Keyboard navigation for color selection
- Screen reader support: "Selected: Blue color"
- Focus indicators on swatches
- ARIA labels for color buttons

---

## Future Enhancements (Out of Scope)

- Color preview on a product mockup
- Image uploads for custom colors
- Color gradients as options
- Bulk color selection across components
- Color history/favorites

---

## Files to Create/Modify

### New Files:
- None (extend existing structure)

### Modified Files:
1. `frontend/src/lib/fieldRegistry.ts` - Add field type
2. `frontend/src/components/forms/FieldConfigPanel.tsx` - Color config UI
3. `frontend/src/components/forms/FieldRenderer.tsx` - Preview rendering
4. `frontend/src/pages/PublicFormView.tsx` - Customer color selector
5. `frontend/src/hooks/useFormBuilder.ts` - Default theme update
6. `frontend/src/pages/FormBuilder.tsx` - May need minor updates
7. `frontend/src/pages/FormSubmissions.tsx` - Display color selections
8. CSS files - New styles for color selector

### Backend:
- No changes needed (uses existing field/answer structure)

---

## Testing Checklist

- [ ] New forms have dark background by default
- [ ] Admin can add component color selector field
- [ ] Admin can configure component name and colors
- [ ] Admin can add multiple components to one form
- [ ] Customer sees color swatches correctly
- [ ] Customer can select colors for each component
- [ ] Required components enforce selection
- [ ] Submissions store color data correctly
- [ ] Submission view displays color selections
- [ ] Mobile layout works well
- [ ] Keyboard navigation works
- [ ] Screen readers announce selections

---

## Estimated Implementation Time

- Phase 1 (Background): 30 minutes
- Phase 2-3 (Field type & Admin UI): 2-3 hours
- Phase 3.2 (Customer UI): 2-3 hours
- Phase 4 (Brand colors): 1 hour
- Phase 5 (Testing & polish): 1-2 hours

**Total: ~6-9 hours**

