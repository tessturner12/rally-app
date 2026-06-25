// A "session" is one Rally search - the set of locations someone has typed in,
// and (once calculated) the winning station and journey times. This file is
// the only place that reads or writes session data in Redis, so the API
// routes never have to think about cache keys or expiry themselves.

import { redis } from './kv'
import type { RankedStation } from './algorithm'

export type LocationInput = {
  name: string
  input: string
  lat: number
  lng: number
}

// Whether the group wants to arrive by a certain time or leave at a certain
// time - this gets passed through to the TfL journey planner. Optional
// because the default search just uses "right now".
export type TimePreference = {
  timeIs: 'arriving' | 'departing'
  time: string
}

export type SessionResults = {
  rankedStations: RankedStation[]
}

export type Session = {
  id: string
  createdAt: number
  locations: LocationInput[]
  timePreference?: TimePreference
  results?: SessionResults
}

// Thrown when an id doesn't match any session - either it was never created,
// or it has expired (sessions only live for 24 hours). Callers (the API
// routes) should turn this into a 404, not a crash.
export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`No session found for id "${id}"`)
    this.name = 'SessionNotFoundError'
  }
}

// Thrown when someone tries to add a 7th location to a session. The spec
// caps Rally at 6 people per search.
export class LocationLimitError extends Error {
  constructor() {
    super(`A session can have at most ${MAX_LOCATIONS} locations`)
    this.name = 'LocationLimitError'
  }
}

// Thrown when someone tries to remove a location at a position that doesn't
// exist in the list - e.g. index 5 when there are only 2 locations. The API
// route never normally produces this from the UI (the index always comes
// from what's currently on screen), but it's a cheap safety net against a
// stale tab racing a removal against a reload.
export class InvalidLocationIndexError extends Error {
  constructor(index: number) {
    super(`No location at index ${index}`)
    this.name = 'InvalidLocationIndexError'
  }
}

const MAX_LOCATIONS = 6
const SESSION_TTL_SECONDS = 24 * 60 * 60

function sessionKey(id: string): string {
  return `session:${id}`
}

async function save(session: Session): Promise<Session> {
  await redis.set(sessionKey(session.id), session, { ex: SESSION_TTL_SECONDS })
  return session
}

export async function createSession(): Promise<Session> {
  const session: Session = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    locations: [],
  }
  return save(session)
}

export async function getSession(id: string): Promise<Session | null> {
  const session = await redis.get<Session>(sessionKey(id))
  return session ?? null
}

export async function addLocation(id: string, location: LocationInput): Promise<Session> {
  const session = await getSession(id)
  if (!session) {
    throw new SessionNotFoundError(id)
  }
  if (session.locations.length >= MAX_LOCATIONS) {
    throw new LocationLimitError()
  }

  session.locations.push(location)
  return save(session)
}

// Sets (or clears, when passed null) the group's preferred arrive-by/depart-at
// time. Clearing it removes the field entirely rather than leaving it as
// `undefined` on the stored object, so old "default to now" behaviour comes
// back cleanly once a time preference is removed.
export async function setTimePreference(
  id: string,
  timePreference: TimePreference | null
): Promise<Session> {
  const session = await getSession(id)
  if (!session) {
    throw new SessionNotFoundError(id)
  }

  if (timePreference === null) {
    delete session.timePreference
  } else {
    session.timePreference = timePreference
  }
  return save(session)
}

export async function removeLocation(id: string, index: number): Promise<Session> {
  const session = await getSession(id)
  if (!session) {
    throw new SessionNotFoundError(id)
  }
  if (index < 0 || index >= session.locations.length) {
    throw new InvalidLocationIndexError(index)
  }

  session.locations.splice(index, 1)
  return save(session)
}

export async function saveResults(id: string, results: SessionResults): Promise<Session> {
  const session = await getSession(id)
  if (!session) {
    throw new SessionNotFoundError(id)
  }

  session.results = results
  return save(session)
}
