export const ENVIRONMENTS = [
  {
    id: "green-hills", name: "Green hills and meadows", timeOfDay: "dawn",
    biome: "forest", paletteTint: "vec3(0.82,1.08,0.82)", terrain: { biome: "forest", baseHeight: 145, noiseOctaves: 6, ridgeWeight: 0.12, valleyCarving: 0.18, seaLevel: -28 },
    materialMix: { rock: [150, 230], grass: [-10, 85], dryGrass: [70, 125], sand: [-28, -8], snow: [520, 900] },
    water: { type: "river", level: -28, width: 110, color: "#4c9d9a" },
    vegetation: { types: ["meadow-grass", "deciduous-trees"], density: 0.55, clumpSize: 42 },
    sun: { position: [-220, 95, -310], intensity: 2.455 }, sky: { horizon: "#a9c5d5", zenith: "#315675", sun: "#fff0d2" },
    fog: { color: "#b5c9d0", density: 0.000075 }, clouds: { cover: 0.24, speed: 0.8 }, weather: "clear", particles: "pollen",
    camera: { altitude: 420, speed: 42 }, duration: 42
  },
  {
    id: "river-valley", name: "River valley with farmland", timeOfDay: "morning",
    biome: "forest", paletteTint: "vec3(1.02,1.06,0.82)", terrain: { biome: "forest", baseHeight: 112, noiseOctaves: 6, ridgeWeight: 0.06, valleyCarving: 0.62, seaLevel: -28 },
    materialMix: { rock: [190, 320], grass: [-12, 55], dryGrass: [45, 105], sand: [-28, -10], snow: [600, 950] },
    water: { type: "river", level: -28, width: 180, color: "#4caaa5" },
    vegetation: { types: ["farmland", "hedgerows", "deciduous-trees"], density: 0.42, clumpSize: 68 },
    sun: { position: [-90, 210, -340], intensity: 2.25 }, sky: { horizon: "#b9d0d5", zenith: "#426985", sun: "#fff0cf" },
    fog: { color: "#b7cbd0", density: 0.000078 }, clouds: { cover: 0.22, speed: 0.9 }, weather: "clear", particles: "none",
    camera: { altitude: 390, speed: 44 }, duration: 42
  },
  {
    id: "tropical-beach", name: "Tropical beach and coast", timeOfDay: "noon",
    biome: "islands", paletteTint: "vec3(1.18,1.08,0.82)", terrain: { biome: "islands", baseHeight: 118, noiseOctaves: 6, ridgeWeight: 0.3, valleyCarving: 0.08, seaLevel: -28 },
    materialMix: { rock: [95, 210], grass: [20, 85], dryGrass: [35, 115], sand: [-28, 24], snow: [900, 1400] },
    water: { type: "sea", level: -28, width: 30000, color: "#20aeb0" },
    vegetation: { types: ["palms", "coastal-grass"], density: 0.34, clumpSize: 55 },
    sun: { position: [-260, 420, -310], intensity: 2.8 }, sky: { horizon: "#9fc8d9", zenith: "#244766", sun: "#ffdfb4" },
    fog: { color: "#9fc8d9", density: 0.0000820 }, clouds: { cover: 0.26, speed: 1.0 }, weather: "clear", particles: "sea-spray",
    camera: { altitude: 330, speed: 46 }, duration: 42
  },
  {
    id: "alpine-lake", name: "Alpine lake with mountains", timeOfDay: "golden hour",
    biome: "snow", paletteTint: "vec3(0.84,0.98,1.12)", terrain: { biome: "snow", baseHeight: 230, noiseOctaves: 7, ridgeWeight: 0.78, valleyCarving: 0.22, seaLevel: -28 },
    materialMix: { rock: [180, 360], grass: [-8, 90], dryGrass: [60, 120], sand: [-28, -12], snow: [175, 900] },
    water: { type: "lake", level: -28, width: 8500, color: "#3b929e" },
    vegetation: { types: ["pine", "alpine-grass"], density: 0.28, clumpSize: 76 },
    sun: { position: [-300, 180, -260], intensity: 2.0 }, sky: { horizon: "#d7a77f", zenith: "#304968", sun: "#ffd39d" },
    fog: { color: "#b9c3c7", density: 0.0001 }, clouds: { cover: 0.2, speed: 0.72 }, weather: "clear", particles: "mist",
    camera: { altitude: 480, speed: 38 }, duration: 42
  }
];

export const ENVIRONMENT_BY_ID = Object.fromEntries(ENVIRONMENTS.map((environment) => [environment.id, environment]));

export function resolveEnvironment(value) {
  if (!value) return null;
  const aliases = { hills: "green-hills", meadow: "green-hills", valley: "river-valley", beach: "tropical-beach", islands: "tropical-beach", lake: "alpine-lake" };
  return ENVIRONMENT_BY_ID[aliases[value] || value] || null;
}
