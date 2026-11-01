export const ENVIRONMENTS = [
  {
    id: "green-hills", name: "Green hills and meadows", timeOfDay: "dawn",
    biome: "forest", paletteTint: "vec3(0.82,1.08,0.82)", terrain: { biome: "forest", baseHeight: 152, noiseOctaves: 7, ridgeWeight: 0.16, valleyCarving: 0.24, seaLevel: -28 },
    materialMix: { rock: [175, 265], grass: [-18, 105], dryGrass: [82, 142], sand: [-28, -8], snow: [520, 900] },
    water: { type: "river", level: -28, width: 158, color: "#438f91" },
    vegetation: { types: ["meadow-grass"], density: 0.72, clumpSize: 48, grassDensity: 1.0 },
    sun: { position: [-220, 145, -310], intensity: 2.58 }, sky: { horizon: "#b9d5e0", zenith: "#39749a", sun: "#fff1d7" },
    fog: { color: "#c9d9c2", density: 0.000062 }, clouds: { cover: 0.28, speed: 0.8 }, weather: "clear", particles: "pollen",
    camera: { altitude: 420, speed: 42 }, duration: 25
  },
  {
    id: "river-valley", name: "River valley with farmland", timeOfDay: "morning",
    biome: "forest", paletteTint: "vec3(1.02,1.06,0.82)", terrain: { biome: "forest", baseHeight: 88, noiseOctaves: 5, ridgeWeight: 0.015, valleyCarving: 0.30, seaLevel: -28 },
    materialMix: { rock: [230, 370], grass: [-12, 62], dryGrass: [38, 112], sand: [-28, -10], snow: [600, 950] },
    water: { type: "river", level: -28, width: 270, color: "#398f98" },
    vegetation: { types: ["farmland", "field-boundaries"], density: 0, clumpSize: 68 },
    sun: { position: [-90, 260, -340], intensity: 2.38 }, sky: { horizon: "#c7dce0", zenith: "#4b7896", sun: "#fff1d9" },
    fog: { color: "#c2d5d0", density: 0.000064 }, clouds: { cover: 0.22, speed: 0.9 }, weather: "clear", particles: "none",
    camera: { altitude: 390, speed: 44 }, duration: 25
  },
  {
    id: "tropical-beach", name: "Tropical beach and coast", timeOfDay: "noon",
    biome: "islands", paletteTint: "vec3(1.18,1.08,0.82)", terrain: { biome: "islands", baseHeight: 118, noiseOctaves: 6, ridgeWeight: 0.3, valleyCarving: 0.08, seaLevel: -28 },
    materialMix: { rock: [95, 210], grass: [20, 85], dryGrass: [35, 115], sand: [-28, 24], snow: [900, 1400] },
    water: { type: "sea", level: -28, width: 30000, color: "#20aeb0" },
    vegetation: { types: ["palms", "coastal-grass"], density: 0.34, clumpSize: 55 },
    sun: { position: [-260, 420, -310], intensity: 2.8 }, sky: { horizon: "#9fc8d9", zenith: "#244766", sun: "#ffdfb4" },
    fog: { color: "#9fc8d9", density: 0.0000820 }, clouds: { cover: 0.26, speed: 1.0 }, weather: "clear", particles: "sea-spray",
    camera: { altitude: 330, speed: 46 }, duration: 25
  },
  {
    id: "himalayan-range", name: "Himalayan mountain range", timeOfDay: "clear mountain daylight",
    biome: "snow", paletteTint: "vec3(1.08,1.12,1.16)", terrain: { biome: "snow", mountainProfile: "himalayan", baseHeight: 300, noiseOctaves: 7, ridgeWeight: 1.22, valleyCarving: 0.2, seaLevel: -28 },
    materialMix: { rock: [145, 340], grass: [-12, 55], dryGrass: [42, 105], sand: [-28, -10], snow: [78, 245] },
    water: { type: "none", level: -28, width: 0 },
    vegetation: { types: [], density: 0, clumpSize: 62 },
    sun: { position: [-340, 560, -300], intensity: 3.1 }, sky: { horizon: "#d9edfa", zenith: "#2878b7", sun: "#fff8e8" },
    fog: { color: "#c6deed", density: 0.000052 }, clouds: { cover: 0.28, speed: 0.78 }, weather: "clear", particles: "mist",
    camera: { altitude: 520, speed: 40 }, duration: 25
  },
  {
    id: "desert-dunes", name: "Desert and golden dunes", timeOfDay: "sunlit afternoon",
    biome: "desert", paletteTint: "vec3(1.22,1.04,0.78)", terrain: { biome: "desert", baseHeight: 150, noiseOctaves: 5, ridgeWeight: 0.08, valleyCarving: 0.02, seaLevel: -28 },
    materialMix: { rock: [175, 320], grass: [900, 1100], dryGrass: [-30, 220], sand: [-40, 190], snow: [1200, 1500] },
    water: { type: "none", level: -28, width: 0 },
    vegetation: { types: ["desert-shrub"], density: 0.12, clumpSize: 110 },
    sun: { position: [-260, 500, -330], intensity: 3.0 }, sky: { horizon: "#f2d6ad", zenith: "#398bc2", sun: "#fff0ce" },
    fog: { color: "#e9c99e", density: 0.000038 }, clouds: { cover: 0.08, speed: 0.65 }, weather: "clear", particles: "dust",
    camera: { altitude: 390, speed: 43 }, duration: 25
  },
  {
    id: "alpine-lake", name: "Alpine lake with mountains", timeOfDay: "bright afternoon",
    biome: "snow", paletteTint: "vec3(1.04,1.12,1.08)", terrain: { biome: "snow", baseHeight: 230, noiseOctaves: 7, ridgeWeight: 0.78, valleyCarving: 0.22, seaLevel: -28 },
    materialMix: { rock: [180, 360], grass: [-8, 90], dryGrass: [60, 120], sand: [-28, -12], snow: [175, 900] },
    water: { type: "lake", level: -28, width: 8500, color: "#3b929e" },
    vegetation: { types: ["pine", "alpine-grass"], density: 0.62, clumpSize: 54 },
    sun: { position: [-300, 520, -260], intensity: 3.15 }, sky: { horizon: "#d9efff", zenith: "#287ec0", sun: "#fff8e5" },
    fog: { color: "#c9e4f2", density: 0.000048 }, clouds: { cover: 0.32, speed: 0.82 }, weather: "clear", particles: "mist",
    camera: { altitude: 480, speed: 38 }, duration: 25
  }
];

export const ENVIRONMENT_BY_ID = Object.fromEntries(ENVIRONMENTS.map((environment) => [environment.id, environment]));

export function resolveEnvironment(value) {
  if (!value) return null;
  const aliases = { hills: "green-hills", meadow: "green-hills", valley: "river-valley", beach: "tropical-beach", islands: "tropical-beach", lake: "alpine-lake", himalaya: "himalayan-range", mountains: "himalayan-range", desert: "desert-dunes", dunes: "desert-dunes" };
  return ENVIRONMENT_BY_ID[aliases[value] || value] || null;
}
