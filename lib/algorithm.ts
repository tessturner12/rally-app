// This is the heart of Rally: the "fairness" maths that decides where everyone
// should meet. It does NOT just find the geographic middle of everyone's
// locations - a station could be slap in the middle of London and still be a
// terrible choice if it's a 45-minute walk from the nearest tube line.
//
// Instead, for every candidate station we work out the longest journey that
// any one person would have to make to get there, and then rank candidates by
// whichever has the *shortest* "longest journey". This is called a "minimax"
// - we're minimising the maximum journey time. It means the choice is fair to
// whoever has the worst trip, rather than fair "on average".
//
// Rather than only keeping the single best station, this keeps the top few -
// so if the absolute best option doesn't suit the group (no good pub nearby,
// say), there are a couple of nearly-as-fair alternatives to look at instead.

import { CANDIDATE_STATIONS } from './candidates'
import { getJourneys } from './tfl'
import type { JourneyLeg, TimePreference } from './tfl'

export type PersonLocation = {
  name: string
  lat: number
  lng: number
}

export type RankedStation = {
  name: string
  lat: number
  lng: number
  maxJourneyTime: number
  // How much worse the unluckiest person's journey is than the luckiest
  // person's, for this station (max minus min). A small number means
  // everyone has a roughly similar trip; a large number means it's much
  // better for some people than others.
  timeDifference: number
  averageTime: number
  journeyTimes: Array<{
    personName: string
    minutes: number
    legs: JourneyLeg[]
    originLat: number
    originLng: number
  }>
}

// Thrown when not a single candidate station has a known journey for every
// person - for example if TfL's API is down, or everyone typed in locations
// nowhere near London. Callers should catch this and show the user a
// friendly explanation rather than a crash.
export class NoViableStationError extends Error {
  constructor() {
    super('Could not find a station with a known journey time for everyone')
    this.name = 'NoViableStationError'
  }
}

const DEFAULT_RANKED_COUNT = 3

export async function findBestStations(
  locations: PersonLocation[],
  timePreference?: TimePreference,
  count: number = DEFAULT_RANKED_COUNT
): Promise<RankedStation[]> {
  // Build every (person, candidate station) pair we need a journey for, then
  // ask tfl.ts to fetch them all at once (it handles the concurrency limiting
  // so we don't have to think about that here).
  const pairs = locations.flatMap((location) =>
    CANDIDATE_STATIONS.map((station) => ({
      fromLat: location.lat,
      fromLng: location.lng,
      toLat: station.lat,
      toLng: station.lng,
    }))
  )
  const allJourneys = await getJourneys(pairs, timePreference)

  // allJourneys is one flat list covering every person x every candidate, in
  // the same order we built `pairs` above (all of person 1's candidates, then
  // all of person 2's, and so on). Slice it back into one row per candidate
  // station so we can work out each station's fairness stats.
  const viableStations: RankedStation[] = []

  for (let stationIndex = 0; stationIndex < CANDIDATE_STATIONS.length; stationIndex++) {
    const station = CANDIDATE_STATIONS[stationIndex]
    const journeysByPerson = locations.map(
      (_, personIndex) => allJourneys[personIndex * CANDIDATE_STATIONS.length + stationIndex]
    )

    // If TfL couldn't find a route for even one person, we don't know this
    // station's true worst case, so it can't be compared fairly - skip it.
    if (journeysByPerson.some((journey) => journey === null)) {
      continue
    }

    const knownJourneys = journeysByPerson as NonNullable<(typeof journeysByPerson)[number]>[]
    const minutesByPerson = knownJourneys.map((journey) => journey.durationMinutes)
    const maxJourneyTime = Math.max(...minutesByPerson)
    const minJourneyTime = Math.min(...minutesByPerson)
    const averageTime = Math.round(
      minutesByPerson.reduce((sum, minutes) => sum + minutes, 0) / minutesByPerson.length
    )

    viableStations.push({
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      maxJourneyTime,
      timeDifference: maxJourneyTime - minJourneyTime,
      averageTime,
      journeyTimes: locations.map((location, i) => ({
        personName: location.name,
        minutes: knownJourneys[i].durationMinutes,
        legs: knownJourneys[i].legs,
        originLat: location.lat,
        originLng: location.lng,
      })),
    })
  }

  if (viableStations.length === 0) {
    throw new NoViableStationError()
  }

  return viableStations.sort((a, b) => a.maxJourneyTime - b.maxJourneyTime).slice(0, count)
}
