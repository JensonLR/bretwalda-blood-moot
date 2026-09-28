// ============================================================
// LOBBY GLYPHS — the drawn icons for the lobby, muster, training and class cards (unit L).
//
// EMPTY ON PURPOSE. This file exists so that the glyphs for this screen family can land without any
// unit editing an import block: src/app/page.tsx (lobby, create, training, muster) and
// src/app/ui/lobbyParts.tsx already carry a side-effect import of it, on a line of their own:
//
//     import "../glyphs/lobby";   (from page.tsx: "./glyphs/lobby")
//
// The unit that owns this file adds its components below and turns that one line into a named
// import in place. Shapes are drawn on a 24 grid as filled silhouettes in `currentColor`; anything
// that names a class, a pad, a mark or a currency is drawn here, and Lucide is left to plain
// utilities (arrow, check, lock, copy).
// ============================================================
export {};
