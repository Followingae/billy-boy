/** Billy's colour, as an icon colour: very light bodies (cream, pale yellow) are darkened
 *  toward ink so icons stay readable on the white goo. */
export function toneOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#5b4bdb'
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255]
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
  if (L < 0.45) return '#' + m[1]
  const k = Math.min(0.75, (L - 0.45) * 1.6 + 0.35), ink = [29, 27, 24]
  return '#' + c.map((v, i) => Math.round(v * (1 - k) + ink[i] * k).toString(16).padStart(2, '0')).join('')
}
