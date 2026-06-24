// A single shared connection to the Redis store (hosted by Upstash, set up
// through Vercel's Storage tab). Session data lives here instead of in a
// regular database, because sessions are short-lived (24 hours) and we just
// need fast key/value lookups - exactly what Redis is built for.
//
// Everything else in /lib that needs to read or write a session imports
// `redis` from this one file, so there's only one place that knows how the
// connection is configured.

import { Redis } from '@upstash/redis'

export const redis = Redis.fromEnv()
