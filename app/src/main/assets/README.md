## Chess Visual Improvements Completed

### ✅ Problem Solved
The chess game's visual design has been significantly enhanced to make it easier to understand game state and more visually appealing.

### ✅ Key Improvements Made

#### 1. **Move Indicators (Board Visuals)**
- **Valid moves**: Now 42% of square size (larger) with bright green (#10b981) and subtle glow effect
- **Valid captures**: Larger rings with bright border for better visibility
- **Contrast**: Improved visibility against dark and light squares

#### 2. **Quiz Markers**
- **Valid moves**: Larger green dots with stronger glow effect
- **Blunders**: More visible red markers with enhanced contrast
- **Clear visual distinction**: Different styles for valid vs. invalid moves

#### 3. **Cburnett Piece Set**
- **The set chess.com and lichess ship**: the twelve pieces are Colin M.L. Burnett's Cburnett set, not hand-drawn lookalikes
- **One shared 45x45 box**: every piece is drawn in the same box, so the set keeps its intended proportions on every square
- **Legible off the board**: captured pieces and promotion choices sit on a light square chip so black pieces stay visible against the dark panels
- **Attribution and licence**: `chess-pieces.js` carries the Cburnett credit (CC BY-SA 3.0 / GFDL) alongside the artwork, and that file ships inside the APK

#### 4. **Overall Visual Clarity**
- Better color contrast throughout the interface
- Improved visual hierarchy for important elements
- Maintained all existing functionality while enhancing clarity

### ✅ Files Modified
- `app/src/main/assets/chess-pieces.js`:
  - The twelve Cburnett SVGs in one map, with the licence and attribution note
  - `CHESS_PIECE_SVG[colour][type]` is the single source of piece art

- `app/src/main/assets/app.js`:
  - `getPieceSvg` reads the shared Cburnett map, so the board, captured trays and promotion picker draw identical art

- `app/src/main/assets/index.html`:
  - Loads `chess-pieces.js` before `app.js`
  - The chess card shows the same Cburnett white pawn the board draws

- `app/src/main/assets/styles.css`:
  - Board tracks use `minmax(0, 1fr)` and zero-minimum squares, so all 64 cells stay exactly equal
  - Captured-piece chips and promotion squares keep both colours legible on dark panels

### ✅ Result
The chess game now shows:
- ✅ **8+ clearly visible legal moves** for White (instead of just 2)
- ✅ **Professional-looking chess pieces** drawn with the Cburnett set chess.com and lichess use
- ✅ **Clear visual feedback** for all game states
- ✅ **Improved accessibility** with better color contrast and visibility

The game is now much easier to understand at a glance and provides a much more engaging experience.