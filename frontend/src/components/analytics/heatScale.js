// Shared color-coded heat scale: red (low) → orange → yellow → green (high), 0–100.
// Thresholds align with the mastery bands (Beginner 40 → red, Intermediate 60 → orange,
// Advanced 80 → yellow-green, Mastered 95 → green).
export const heatColor = (v) => {
  if (v < 50) return '#E04A3F'   // red
  if (v < 65) return '#F08A3C'   // orange
  if (v < 80) return '#F4C430'   // yellow
  if (v < 90) return '#A6CE39'   // yellow-green
  return '#5AB552'               // green
}

// White text on the dark red/orange cells, ink on the lighter yellow→green ones.
export const heatText = (v) => (v < 65 ? '#FFFFFF' : '#1A1E27')

export const HEAT_GRADIENT = 'linear-gradient(90deg, #E04A3F, #F08A3C, #F4C430, #A6CE39, #5AB552)'
