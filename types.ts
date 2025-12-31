
export interface ParticleData {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  phases: Float32Array;
  velocities: Float32Array;
}

export interface SwirlPoint {
  x: number;
  y: number;
  strength: number;
  radius: number;
}
