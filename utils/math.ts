
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const createSwirl = (x: number, y: number, z: number, time: number) => {
  const angle = Math.atan2(y, x);
  const dist = Math.sqrt(x * x + y * y);
  const swirlFactor = 2.0 / (dist + 0.1);
  const newAngle = angle + swirlFactor * 0.1 + time * 0.2;
  
  return {
    x: Math.cos(newAngle) * dist,
    y: Math.sin(newAngle) * dist,
    z: z + Math.sin(time + dist * 0.5) * 0.1
  };
};

export const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;
