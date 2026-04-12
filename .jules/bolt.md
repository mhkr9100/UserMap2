## 2024-05-24 - Expensive unmemoized layout computations during high-frequency events
**Learning:** For React visualizations in UserMap (e.g., FlowChartView), expensive tree layout computations (like `buildGraph`) and data mapping (`nodeMap`) were unmemoized, leading to costly O(N) recalculations during frequent local state updates, such as panning or zooming interactions.
**Action:** Always memoize expensive layout computations (e.g., with `useMemo`) that depend only on props/data, so they don't block the main thread during high-frequency interaction state updates (pan/zoom).
