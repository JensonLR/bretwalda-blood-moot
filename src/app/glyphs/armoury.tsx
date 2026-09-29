// ============================================================
// ARMOURY GLYPHS — the drawn icons for the armoury shop (unit A).
//
// EMPTY ON PURPOSE. This file exists so that the glyphs for this screen family can land without any
// unit editing an import block: src/app/page.tsx (armoury block) and src/app/ui/armouryParts.tsx
// already carry a side-effect import of it, on a line of their own:
//
//     import "../glyphs/armoury";   (from page.tsx: "./glyphs/armoury")
//
// The unit that owns this file adds its components below and turns that one line into a named
// import in place. Shapes are drawn on a 24 grid as filled silhouettes in `currentColor`; anything
// that names a class, a pad, a mark or a currency is drawn here, and Lucide is left to plain
// utilities (arrow, check, lock, copy).
// ============================================================
export {};
