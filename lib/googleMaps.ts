// Both the Session screen (address autocomplete) and the Results screen
// (the map) need the Google Maps JavaScript API loaded in the browser. This
// file makes sure that script is only ever added to the page once, no
// matter how many components ask for it, and gives everyone a promise that
// resolves once it's ready to use.

let loadPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("loadGoogleMaps can only be called in the browser")
    );
  }

  // Someone else already finished loading it - just hand back the result.
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  // Someone else is already in the middle of loading it - wait for that
  // instead of injecting a second copy of the script.
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
