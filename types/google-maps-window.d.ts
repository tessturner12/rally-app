// @types/google.maps declares the `google` namespace globally, but it
// doesn't say that `window.google` exists - this file adds that one line
// so TypeScript knows `window.google.maps...` is safe to use once the Maps
// script below has loaded.
declare global {
  interface Window {
    google: typeof google;
  }
}

export {};
