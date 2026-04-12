## 2026-04-12 - Adding aria-labels to UserMap mind map view
**Learning:** The interactive nodes in the UserMap view utilize multiple icon-only buttons (Expand/Collapse, Edit, Add, Delete, Privacy) that rely entirely on title attributes or context. While title attributes are useful, ARIA labels are required to ensure robust and consistent screen reader accessibility.
**Action:** Add explicit `aria-label` attributes to all icon-only buttons and bare inline inputs throughout UI components, especially in complex interactive trees like UserMapView.
