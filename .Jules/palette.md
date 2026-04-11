## 2024-05-14 - Modal Accessibility
**Learning:** Found an icon-only close button in a modal component (`DataStudioPage.tsx`) that lacked an ARIA label, making it inaccessible to screen readers.
**Action:** Added `aria-label="Close import panel"` to provide necessary context for assistive technologies without affecting the visual layout.
