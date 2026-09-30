// ============================================================
// LANDING GLYPHS — the drawn icons for the title screen and the menu shell (unit T).
//
// EMPTY ON PURPOSE. This file exists so that the glyphs for this screen family can land without any
// unit editing an import block: src/app/page.tsx (landing block) and src/app/ui/shell.tsx already
// carry a side-effect import of it, on a line of their own:
//
//     import "../glyphs/landing";   (from page.tsx: "./glyphs/landing")
//
// The unit that owns this file adds its components below and turns that one line into a named
// import in place. Shapes are drawn on a 24 grid as filled silhouettes in `currentColor`; anything
// that names a class, a pad, a mark or a currency is drawn here, and Lucide is left to plain
// utilities (arrow, check, lock, copy).
// ============================================================
export {};
