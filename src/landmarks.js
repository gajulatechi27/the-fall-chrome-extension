// Stage 1 deliberately has no landmark props. The previous placeholder
// houses and cone roofs were positioned at fixed world heights and appeared
// to float because they never sampled the generated terrain surface.
export const themes = [];

export class Landmarks {
  constructor() {
    this.group = null;
    this.objectCount = 0;
  }
  update() {}
  dispose() {}
}
