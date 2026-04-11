## 2026-04-11 - Memoize Graph Layout in FlowChartView
**Learning:** In React visualizations like FlowChartView, expensive layout computations like `buildGraph(tree)` and mapping operations like `nodeMap` should be memoized. Because pan and zoom interactions frequently trigger re-renders, unmemoized O(N) operations cause main thread blocking and noticeable jitter during interactions.
**Action:** Always wrap heavy data transformation or layout logic in `useMemo` in components handling frequent high-frequency interactions (like drag, pan, zoom), unless the data explicitly changes.
