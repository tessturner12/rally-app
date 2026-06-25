// TfL line colours, used to show a small coloured dot next to each leg of a
// journey on the Results screen - so "Victoria line" reads as a light blue
// dot at a glance, the same way it's coloured on a real tube map.
//
// These are hand-written rather than fetched from an API because TfL's line
// colours essentially never change, and this avoids an extra network call
// just to look up eleven fixed hex codes.

const LINE_COLOURS: Record<string, string> = {
  bakerloo: '#B36305',
  central: '#E32017',
  circle: '#FFD300',
  district: '#00782A',
  'hammersmith & city': '#F3A9BB',
  jubilee: '#A0A5A9',
  metropolitan: '#9B0056',
  northern: '#000000',
  piccadilly: '#003688',
  victoria: '#0098D4',
  'waterloo & city': '#95CDBA',
  'elizabeth line': '#773DBD',
  dlr: '#00A4A7',
  overground: '#EE7C0E',
  bus: '#E32017',
  walking: '#9E9E9E',
}

const FALLBACK_COLOUR = '#9E9E9E'

// Looks up the colour for a journey leg, trying the specific line name
// first (e.g. "Victoria"), then the more general mode (e.g. "bus" for an
// unrecognised bus route number), then finally a neutral grey if neither
// is one we know about.
export function colourForLine(lineName: string | undefined, mode: string): string {
  if (lineName) {
    const byLineName = LINE_COLOURS[lineName.toLowerCase()]
    if (byLineName) {
      return byLineName
    }
  }

  const byMode = LINE_COLOURS[mode.toLowerCase()]
  if (byMode) {
    return byMode
  }

  return FALLBACK_COLOUR
}
