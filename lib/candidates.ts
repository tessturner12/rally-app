// This file holds the list of "candidate" stations — the places Rally is allowed
// to suggest as the meeting point. For v1 we don't search every station in London;
// we just check this fixed shortlist of well-connected stations across Zones 1-3.
//
// Why a fixed list instead of "all London stations"? Two reasons:
// 1. Speed/cost — checking journey times from every person to every station in
//    London would mean thousands of slow TfL API calls instead of a few dozen.
// 2. Quality — a station with great transport links (lots of tube/rail lines
//    meeting there) is more likely to be a genuinely easy place to meet than some
//    random suburban stop that happens to be geographically central.
//
// The coordinates below were pulled directly from TfL's own StopPoint Search API
// (the same API Rally uses elsewhere), so they match what TfL's Journey Planner
// expects — not hand-typed estimates.

export type Candidate = {
  // A short, stable identifier for this station (comes from TfL).
  id: string
  // The friendly name shown to users, e.g. "Oxford Circus".
  name: string
  // Latitude/longitude TfL uses to calculate journey times to this station.
  lat: number
  lng: number
  // TfL's fare zone for this station. Some interchange stations sit across two
  // zones (e.g. "1+2"), which is why this is text rather than a single number.
  zone: string
}

export const CANDIDATE_STATIONS: Candidate[] = [
  { id: 'HUBKGX', name: "King's Cross St Pancras", lat: 51.531683, lng: -0.123538, zone: '1' },
  { id: 'HUBLST', name: 'Liverpool Street', lat: 51.517940, lng: -0.083162, zone: '1' },
  { id: 'HUBBAN', name: 'Bank', lat: 51.513395, lng: -0.089095, zone: '1' },
  { id: '940GZZLUOXC', name: 'Oxford Circus', lat: 51.515224, lng: -0.141903, zone: '1' },
  { id: 'HUBBDS', name: 'Bond Street', lat: 51.513362, lng: -0.148795, zone: '1' },
  { id: '940GZZLUGPK', name: 'Green Park', lat: 51.506947, lng: -0.142787, zone: '1' },
  { id: 'HUBVIC', name: 'Victoria', lat: 51.495812, lng: -0.143826, zone: '1' },
  { id: 'HUBWAT', name: 'Waterloo', lat: 51.504269, lng: -0.113356, zone: '1' },
  { id: 'HUBWSM', name: 'Westminster', lat: 51.501603, lng: -0.125984, zone: '1' },
  { id: 'HUBPAD', name: 'Paddington', lat: 51.516981, lng: -0.176160, zone: '1' },
  { id: '940GZZLUBST', name: 'Baker Street', lat: 51.522883, lng: -0.157130, zone: '1' },
  { id: 'HUBLBG', name: 'London Bridge', lat: 51.505881, lng: -0.086807, zone: '1' },
  { id: 'HUBZFD', name: 'Farringdon', lat: 51.520214, lng: -0.105054, zone: '1' },
  { id: '940GZZLUAGL', name: 'Angel', lat: 51.532624, lng: -0.105898, zone: '1' },
  { id: 'HUBOLD', name: 'Old Street', lat: 51.526065, lng: -0.088193, zone: '1' },
  { id: '940GZZLUHBN', name: 'Holborn', lat: 51.517580, lng: -0.120475, zone: '1' },
  { id: 'HUBTCR', name: 'Tottenham Court Road', lat: 51.516018, lng: -0.130888, zone: '1' },
  { id: '940GZZLUADE', name: 'Aldgate East', lat: 51.515037, lng: -0.072384, zone: '1' },
  { id: 'HUBZWL', name: 'Whitechapel', lat: 51.519498, lng: -0.059858, zone: '2' },
  { id: 'HUBSRA', name: 'Stratford', lat: 51.541508, lng: -0.002410, zone: '2/3' },
  { id: 'HUBZCW', name: 'Canada Water', lat: 51.498053, lng: -0.049667, zone: '2' },
  { id: 'HUBVXH', name: 'Vauxhall', lat: 51.485739, lng: -0.123303, zone: '1+2' },
  { id: 'HUBEPH', name: 'Elephant & Castle', lat: 51.494505, lng: -0.099185, zone: '1+2' },
  { id: 'HUBBRX', name: 'Brixton', lat: 51.462961, lng: -0.114531, zone: '2' },
  { id: '940GZZLUCTN', name: 'Camden Town', lat: 51.539292, lng: -0.142740, zone: '2' },
  { id: 'HUBHHY', name: 'Highbury & Islington', lat: 51.546269, lng: -0.103538, zone: '2' },
  { id: 'HUBFPK', name: 'Finsbury Park', lat: 51.564778, lng: -0.105876, zone: '2' },
  { id: 'HUBCLJ', name: 'Clapham Junction', lat: 51.463724, lng: -0.168997, zone: '2' },

  // Added 2026-07-08 to cover more popular/trendy hangout areas, on top of
  // the original well-connected-hub list above. Same sourcing rule as
  // everything else in this file: coordinates and zones pulled live from
  // TfL's StopPoint Search API, not typed from memory.
  { id: 'HUBBAL', name: 'Balham', lat: 51.443259, lng: -0.152707, zone: '3' },
  { id: '910GHACKNYW', name: 'Hackney Wick', lat: 51.543410, lng: -0.024920, zone: '2' },
  { id: 'HUBHMS', name: 'Hammersmith', lat: 51.492304, lng: -0.223619, zone: '2' },
  { id: 'HUBEAL', name: 'Ealing Broadway', lat: 51.514993, lng: -0.302131, zone: '3' },
  { id: '940GZZLUSSQ', name: 'Sloane Square', lat: 51.492270, lng: -0.156377, zone: '1' },
  { id: '940GZZLUFBY', name: 'Fulham Broadway', lat: 51.480081, lng: -0.195422, zone: '2' },
  { id: '910GWAPPING', name: 'Wapping', lat: 51.504388, lng: -0.055931, zone: '2' },
  { id: '910GSHRDHST', name: 'Shoreditch High Street', lat: 51.523375, lng: -0.075246, zone: '1' },
  { id: '910GHOXTON', name: 'Hoxton', lat: 51.531512, lng: -0.075681, zone: '1+2' },
  { id: '910GDALS', name: 'Dalston Junction', lat: 51.546116, lng: -0.075137, zone: '2' },
  { id: '910GHACKNYC', name: 'Hackney Central', lat: 51.547105, lng: -0.056058, zone: '2' },
  { id: '910GLONFLDS', name: 'London Fields', lat: 51.541153, lng: -0.057753, zone: '2' },
  { id: '910GPCKHMRY', name: 'Peckham Rye', lat: 51.470034, lng: -0.069414, zone: '2' },
  { id: '940GZZLUBOR', name: 'Borough', lat: 51.501199, lng: -0.093370, zone: '1' },
  { id: '940GZZLUBMY', name: 'Bermondsey', lat: 51.497750, lng: -0.063993, zone: '2' },
  { id: 'HUBCUT', name: 'Cutty Sark for Maritime Greenwich', lat: 51.481675, lng: -0.010802, zone: '2+3' },
  { id: '940GZZLUCPC', name: 'Clapham Common', lat: 51.461742, lng: -0.138317, zone: '2' },
  { id: '910GHERNEH', name: 'Herne Hill', lat: 51.453305, lng: -0.102289, zone: '2+3' },
  { id: '940GZZLUTBY', name: 'Tooting Broadway', lat: 51.427630, lng: -0.168374, zone: '3' },
  { id: 'HUBCYP', name: 'Crystal Palace', lat: 51.418111, lng: -0.072605, zone: '3+4' },
  { id: 'HUBNXG', name: 'New Cross Gate', lat: 51.475132, lng: -0.040399, zone: '2' },
  { id: '940GZZLUNHG', name: 'Notting Hill Gate', lat: 51.509128, lng: -0.196104, zone: '1+2' },
  { id: '940GZZLULAD', name: 'Ladbroke Grove', lat: 51.517449, lng: -0.210391, zone: '2' },
  { id: 'HUBKTN', name: 'Kentish Town', lat: 51.550409, lng: -0.140545, zone: '2' },
  { id: 'HUBWHC', name: 'Walthamstow Central', lat: 51.582948, lng: -0.019842, zone: '3' },
  { id: 'HUBCAW', name: 'Canary Wharf', lat: 51.503734, lng: -0.019121, zone: '2' },
  { id: '940GZZLUWKN', name: 'West Kensington', lat: 51.490459, lng: -0.206636, zone: '2' },
]
