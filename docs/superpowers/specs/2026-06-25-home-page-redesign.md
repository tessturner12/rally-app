# Home Page Redesign — Design Spec

## Goal
Replace the minimal splash screen with a proper scrollable landing page that explains Rally, how it works, and answers common questions.

## Structure

### 1. Hero
- "Rally" title (large, rose-600)
- Tagline: "Find the fair spot"
- One paragraph: sells the concept, distinguishes from geographic midpoint
- "Find somewhere to meet" CTA button (existing logic unchanged)

### 2. How It Works
Heading + 5 numbered steps:
1. Add where everyone's starting from — up to 6 postcodes or tube stations, no account needed
2. Rally checks real TfL journey times — every starting point vs dozens of candidate stations across zones 1–3
3. Get the fairest meeting point — lowest worst-case journey, not the geographic middle
4. See your exact route — step-by-step transit map with TfL line colours and stop counts
5. Find somewhere to go — nearby pubs, cafés, and restaurants for each suggested station

### 3. FAQ
Accordion (tap to expand). 8 items:
- How is this different from finding the map midpoint? → real TfL times vs geography
- How many people? → up to 6
- Do I need an account? → no
- Is it free? → yes
- Does it work outside London? → London-only for now, TfL network
- How long does a search take? → 10–20 seconds, checking real journey times
- How accurate are the times? → TfL Journey Planner API, same as the official app
- Can I share the session? → yes, share link on the session screen, anyone with it can open and add their location

### 4. Footer
Simple: "Rally · Find the fair spot" + joinrally.place

## Constraints
- Mobile-first (375px+), same rose-600 accent, same Tailwind/font as the rest of the app
- No new dependencies
- CTA button logic unchanged — creates session, redirects to /session/[id]
- No automated tests (UI component, consistent with existing approach)
- Manually verified in browser after implementation
