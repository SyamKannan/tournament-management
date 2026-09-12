// Curated, verified stock sports photography (Unsplash) used for hero/showcase
// backgrounds across the marketing and auth pages. Centralized here so the
// same image never has to be re-picked or re-verified per page.
const unsplash = (id: string, w: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=75`;

export const SPORTS_IMAGES = {
  stadiumNight: unsplash('1522778119026-d647f0596c20', 1600),
  floodlitMist: unsplash('1431324155629-1a6deb1dec8d', 1600),
  tackleAction: unsplash('1543326727-cf6c39e8f84c', 1600),
  womensMatch: unsplash('1624880357913-a8539238245b', 1200),
  sprinklerStadium: unsplash('1607627000458-210e8d2bdb1d', 1600),
  cricketBallGrass: unsplash('1531415074968-036ba1b575da', 1200),
} as const;

// Rotating image sets — each mixes football and cricket so no single showcase
// panel reads as locked to one sport. Order controls carousel sequence.
export const SPORTS_CAROUSELS = {
  hero: [
    SPORTS_IMAGES.floodlitMist,
    SPORTS_IMAGES.cricketBallGrass,
    SPORTS_IMAGES.stadiumNight,
    SPORTS_IMAGES.tackleAction,
  ],
  login: [
    SPORTS_IMAGES.stadiumNight,
    SPORTS_IMAGES.cricketBallGrass,
    SPORTS_IMAGES.floodlitMist,
  ],
  registerClub: [
    SPORTS_IMAGES.tackleAction,
    SPORTS_IMAGES.cricketBallGrass,
    SPORTS_IMAGES.womensMatch,
  ],
  registerPlayer: [
    SPORTS_IMAGES.cricketBallGrass,
    SPORTS_IMAGES.tackleAction,
    SPORTS_IMAGES.sprinklerStadium,
  ],
} as const;
