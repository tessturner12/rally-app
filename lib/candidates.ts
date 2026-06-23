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
  { id: 'HUBEUS', name: 'Euston', lat: 51.527365, lng: -0.132754, zone: '1' },
  { id: '940GZZLUBST', name: 'Baker Street', lat: 51.522883, lng: -0.157130, zone: '1' },
  { id: 'HUBLBG', name: 'London Bridge', lat: 51.505881, lng: -0.086807, zone: '1' },
  { id: 'HUBZFD', name: 'Farringdon', lat: 51.520214, lng: -0.105054, zone: '1' },
  { id: '940GZZLUAGL', name: 'Angel', lat: 51.532624, lng: -0.105898, zone: '1' },
  { id: 'HUBOLD', name: 'Old Street', lat: 51.526065, lng: -0.088193, zone: '1' },
  { id: '940GZZLUHBN', name: 'Holborn', lat: 51.517580, lng: -0.120475, zone: '1' },
  { id: 'HUBTCR', name: 'Tottenham Court Road', lat: 51.516018, lng: -0.130888, zone: '1' },
  { id: '940GZZLUMMT', name: 'Monument', lat: 51.510700, lng: -0.085969, zone: '1' },
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
]
