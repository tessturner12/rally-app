// This is the heart of Rally: the "fairness" maths that decides where everyone
// should meet. It does NOT just find the geographic middle of everyone's
// locations - a station could be slap in the middle of London and still be a
// terrible choice if it's a 45-minute walk from the nearest tube line.
//
// Instead, for every candidate station we work out the longest journey that
// any one person would have to make to get there, and then pick whichever
// candidate has the *shortest* "longest journey". This is called a "minimax"
// - we're minimising the maximum journey time. It means the choice is fair to
// whoever has the worst trip, rather than fair "on average".

import { CANDIDATE_STATIONS } from './candidates'
import { getJourneyTimes } from './tfl'

export type PersonLocation = {
  name: string
  lat: number
  lng: number
}

export type StationResult = {
  winningStation: {
    name: string
    lat: number
    lng: number
    maxJourneyTime: number
  }
  journeyTimes: Array<{ personName: string; minutes: number }>
}

// Thrown when not a single candidate station has a known journey time for
// every person - for example if TfL's API is down, or everyone typed in
// locations nowhere near London. Callers should catch this and show the user
// a friendly explanation rather than a crash.
export class NoViableStationError extends Error {
  constructor() {
    super('Could not find a station with a known journey time for everyone')
    this.name = 'NoViableStationError'
  }
}

export async function findBestStation(locations: PersonLocation[]): Promise<StationResult> {
  // Build every (person, candidate station) pair we need a journey time for,
  // then ask tfl.ts to fetch them all at once (it handles the concurrency
  // limiting so we don't have to think about that here).
  const pairs = locations.flatMap((location) =>
    CANDIDATE_STATIONS.map((station) => ({
      fromLat: location.lat,
      fromLng: location.lng,
      toLat: station.lat,
      toLng: station.lng,
    }))
  )
  const allDurations = await getJourneyTimes(pairs)

  // allDurations is one flat list covering every person x every candidate, in
  // the same order we built `pairs` above (all of person 1's candidates, then
  // all of person 2's, and so on). Slice it back into one row per candidate
  // station so we can work out each station's worst-case journey.
  let best: { station: (typeof CANDIDATE_STATIONS)[number]; maxJourneyTime: number; minutesByPerson: number[] } | null = null

  for (let stationIndex = 0; stationIndex < CANDIDATE_STATIONS.length; stationIndex++) {
    const station = CANDIDATE_STATIONS[stationIndex]
    const minutesByPerson = locations.map(
      (_, personIndex) => allDurations[personIndex * CANDIDATE_STATIONS.length + stationIndex]
    )

    // If TfL couldn't find a route for even one person, we don't know this
    // station's true worst case, so it can't be compared fairly - skip it.
    if (minutesByPerson.some((minutes) => minutes === null)) {
      continue
    }

    const maxJourneyTime = Math.max(...(minutesByPerson as number[]))
    if (best === null || maxJourneyTime < best.maxJourneyTime) {
      best = { station, maxJourneyTime, minutesByPerson: minutesByPerson as number[] }
    }
  }

  if (best === null) {
    throw new NoViableStationError()
  }

  return {
    winningStation: {
      name: best.station.name,
      lat: best.station.lat,
      lng: best.station.lng,
      maxJourneyTime: best.maxJourneyTime,
    },
    journeyTimes: locations.map((location, i) => ({
      personName: location.name,
      minutes: best!.minutesByPerson[i],
    })),
  }
}
