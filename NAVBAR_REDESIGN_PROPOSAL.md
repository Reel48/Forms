# Navbar Redesign Proposal - Two-Row Layout

## Current State
- Single row navbar with navigation tabs, search bar, and user info all in one line
- Search bar is positioned with `marginLeft: 'auto'` between nav tabs and user info
- User info shows email, role, and logout button

## Proposed Two-Row Design

### Row 1: Top Bar (Header)
**Layout:**
```
[Logo]  [========== Search Bar ==========]  [User Email] [Role Badge] [Logout]
```

**Components:**
1. **Company Logo** (left side)
   - Placeholder image for now
   - Clickable - links to dashboard/home
   - Size: ~40-50px height, maintains aspect ratio
   - Padding: 0.75rem left, 1rem right

2. **Search Bar** (center, flexible width)
   - Current search functionality (already implemented)
   - Takes up available space between logo and user info
   - Max width: 500px
   - Centered or left-aligned with flex-grow

3. **User Info Section** (right side)
   - User email (truncated if too long)
   - Role badge (small, subtle)
   - Logout button
   - All in a horizontal flex container

**Styling:**
- Height: ~60-70px
- Background: White with subtle border-bottom
- Padding: 0.75rem 1.5rem
- Box shadow: Subtle (0 1px 3px rgba(0,0,0,0.1))

---

### Row 2: Navigation Bar
**Layout:**
```
[Dashboard] [Profile]
```

**Components:**
1. **Navigation Links** (for customers)
   - Dashboard (links to `/` or `/dashboard`)
   - Profile (links to `/profile`)
   - Horizontal tabs with active state highlighting

**Styling:**
- Height: ~50px
- Background: Slightly lighter than top bar (or same)
- Border-top: 1px subtle border
- Tabs: Similar to current nav-tab styling
- Active tab: Highlighted with bottom border or background color

---

## Design Options

### Option 1: Clean & Minimal (Recommended)
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo]  [    Search Bar    ]  [user@email.com] [Role] [X] │ Row 1
├─────────────────────────────────────────────────────────────┤
│ [Dashboard] [Profile]                                      │ Row 2
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Clean separation of concerns
- Easy to scan and navigate
- Professional appearance
- Logo clearly visible

**Cons:**
- Takes slightly more vertical space

---

### Option 2: Compact with Visual Separation
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo]  [    Search Bar    ]  [user@email.com] [Role] [X] │ Row 1
│ ─────────────────────────────────────────────────────────── │
│ [Dashboard] [Profile]                                      │ Row 2
└─────────────────────────────────────────────────────────────┘
```

**Styling:**
- Row 1: White background
- Divider: Subtle gray line (1px)
- Row 2: Light gray background (#f9fafb) to differentiate

---

### Option 3: Sticky with Shadow Separation
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo]  [    Search Bar    ]  [user@email.com] [Role] [X] │ Row 1
│                                                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                             │
│ [Dashboard] [Profile]                                      │ Row 2
└─────────────────────────────────────────────────────────────┘
```

**Styling:**
- Row 1: White, box-shadow bottom
- Row 2: White, slightly inset shadow for depth
- Both rows sticky at top

---

## Recommended Implementation Details

### Row 1 Structure:
```jsx
<div className="navbar-top-row">
  <div className="navbar-logo">
    <img src="/logo-placeholder.png" alt="Company Logo" />
  </div>
  
  <div className="navbar-search">
    {/* Existing search bar */}
  </div>
  
  <div className="navbar-user-section">
    <span className="user-email">{user.email}</span>
    <span className="user-role-badge">{role}</span>
    <button className="logout-button">Logout</button>
  </div>
</div>
```

### Row 2 Structure:
```jsx
<div className="navbar-bottom-row">
  <nav className="navbar-links">
    <Link to="/dashboard">Dashboard</Link>
    <Link to="/profile">Profile</Link>
  </nav>
</div>
```

### CSS Styling Approach:
```css
.navbar-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  height: 70px;
}

.navbar-logo {
  flex-shrink: 0;
  margin-right: 2rem;
}

.navbar-search {
  flex: 1;
  max-width: 500px;
  margin: 0 auto;
}

.navbar-user-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
  margin-left: 2rem;
}

.navbar-bottom-row {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 1.5rem;
  height: 50px;
  display: flex;
  align-items: center;
}

.navbar-links {
  display: flex;
  gap: 0.5rem;
}
```

---

## Responsive Considerations

### Mobile/Tablet (< 768px):
- Row 1: Stack logo and search vertically, or hide logo
- Row 2: Horizontal scroll for nav links if needed
- User info: Could move to dropdown menu

### Desktop (> 768px):
- Full two-row layout as described
- Search bar: Max 500px width, centered
- Logo: Always visible on left

---

## Visual Hierarchy

1. **Logo**: Brand identity (left, prominent)
2. **Search**: Primary action (center, accessible)
3. **User Info**: Secondary (right, compact)
4. **Navigation**: Page structure (second row, clear tabs)

---

## Accessibility

- Maintain skip link
- Logo should have alt text
- Search bar should have proper label
- Navigation links should have aria-labels
- Keyboard navigation support
- Focus states visible

---

## Implementation Steps

1. Restructure Navigation component into two rows
2. Add logo placeholder image
3. Move search bar to top row
4. Move user info to top row
5. Create bottom row with Dashboard/Profile links
6. Update CSS for new layout
7. Test responsive behavior
8. Ensure accessibility

---

## Questions to Consider

1. **Logo size**: What dimensions? (Recommend: 40-50px height)
2. **Logo click action**: Dashboard or home page?
3. **Search bar width**: Fixed or flexible? (Recommend: max 500px, flexible)
4. **User info display**: Email full or truncated? (Recommend: truncate with tooltip)
5. **Role badge style**: Text or colored badge? (Recommend: subtle badge)
6. **Active nav state**: Bottom border or background? (Recommend: bottom border)

