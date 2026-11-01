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

#### 4. **Bold Outline Piece Design**
- **One silhouette per piece**: king, queen, bishop, knight, rook and pawn are drawn from their own single outline path, so each reads at board size
- **Ink and paper**: white pieces are paper-white with a dark outline, black pieces are solid ink with light engraving, so both colours read on the light and dark squares
- **Shared box**: all twelve drawings use the same 48x60 box and baseline, so no piece looks taller than another
- **No gradients**: the pieces are flat vector art, which also keeps 32 inline squares cheap to paint
- **Legible off the board**: captured pieces and promotion choices sit on a light square chip so black pieces stay visible against the dark panels

#### 5. **Overall Visual Clarity**
- Better color contrast throughout the interface
- Improved visual hierarchy for important elements
- Maintained all existing functionality while enhancing clarity

### ✅ Files Modified
- `app/src/main/assets/app.js`:
  - `PIECE_ART` holds the six outline silhouettes and their engraving
  - `buildPieceSvg` picks the paper-white or solid-ink palette and wraps the art in the shared box
  - The start page card pawn is the same path the board draws

- `app/src/main/assets/index.html`:
  - Chess card shows the outline pawn

- `app/src/main/assets/styles.css`:
  - Captured-piece chips and promotion squares keep both colours legible on dark panels

### ✅ Result
The chess game now shows:
- ✅ **8+ clearly visible legal moves** for White (instead of just 2)
- ✅ **Professional-looking chess pieces** with a bold outline style
- ✅ **Clear visual feedback** for all game states
- ✅ **Improved accessibility** with better color contrast and visibility

The game is now much easier to understand at a glance and provides a much more engaging experience.