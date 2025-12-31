
import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { randomRange } from '../utils/math';

const PARTICLE_COUNT = 16000;

const vertexShader = `
  attribute float size;
  attribute vec3 color;
  attribute float phase;
  attribute float angle;
  varying vec3 vColor;
  varying float vPhase;
  varying float vAngle;
  varying float vDistToCenter;
  uniform float uTime;
  uniform vec3 uLightPos;

  void main() {
    vColor = color;
    vPhase = phase;
    vAngle = angle;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    gl_PointSize = size * (400.0 / -mvPosition.z);
    
    vDistToCenter = length(position - uLightPos);
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vPhase;
  varying float vAngle;
  varying float vDistToCenter;
  uniform float uTime;

  void main() {
    float c = cos(vAngle);
    float s = sin(vAngle);
    vec2 rotatedUV = vec2(
        c * (gl_PointCoord.x - 0.5) - s * (gl_PointCoord.y - 0.5) + 0.5,
        s * (gl_PointCoord.x - 0.5) + c * (gl_PointCoord.y - 0.5) + 0.5
    );

    vec2 distVec = (rotatedUV - 0.5) * vec2(1.0, 2.5);
    float dist = length(distVec);
    
    if (dist > 0.5) discard;

    float strokePattern = smoothstep(0.5, 0.0, dist) * (0.8 + 0.2 * sin(rotatedUV.x * 20.0 + vPhase));
    float lightInfluence = 1.0 / (vDistToCenter * 0.15 + 0.5);
    lightInfluence = clamp(lightInfluence, 0.5, 2.5);
    
    float twinkle = 0.8 + 0.2 * sin(uTime * 2.0 + vPhase);
    
    gl_FragColor = vec4(vColor * lightInfluence * twinkle, strokePattern * 0.9);
  }
`;

interface StarryFieldProps {
  lightPos: THREE.Vector3;
  interactionPoints: React.MutableRefObject<Map<number, { x: number; y: number; vx: number; vy: number }>>;
  handInfluence: React.MutableRefObject<{ x: number; y: number; vx: number; vy: number; active: boolean }>;
}

const StarryField: React.FC<StarryFieldProps> = ({ lightPos, interactionPoints, handInfluence }) => {
  const meshRef = useRef<THREE.Points>(null!);
  const { viewport } = useThree();

  const { positions, colors, sizes, phases, angles, initialPositions } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const initPos = new Float32Array(PARTICLE_COUNT * 3);
    const cols = new Float32Array(PARTICLE_COUNT * 3);
    const szs = new Float32Array(PARTICLE_COUNT);
    const phs = new Float32Array(PARTICLE_COUNT);
    const agls = new Float32Array(PARTICLE_COUNT);

    const palette = [
      new THREE.Color('#FFFFFF'),
      new THREE.Color('#E0F7FA'),
      new THREE.Color('#FFF9C4'),
      new THREE.Color('#FFD54F'),
      new THREE.Color('#81D4FA'),
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomRange(1, 15);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = (Math.random() - 0.5) * 4;

      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      initPos[i * 3] = x; initPos[i * 3 + 1] = y; initPos[i * 3 + 2] = z;

      const color = palette[Math.floor(Math.random() * palette.length)];
      cols[i * 3] = color.r; cols[i * 3 + 1] = color.g; cols[i * 3 + 2] = color.b;

      szs[i] = randomRange(0.08, 0.25);
      phs[i] = Math.random() * 10.0;
      agls[i] = Math.random() * Math.PI;
    }

    return { positions: pos, colors: cols, sizes: szs, phases: phs, angles: agls, initialPositions: initPos };
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uLightPos: { value: lightPos }
  }), [lightPos]);

  // 用于平滑挥手产生的“星际风”
  const windVelocity = useRef(0);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    uniforms.uTime.value = time;
    
    const positionsAttr = meshRef.current.geometry.attributes.position;

    // 预计算交互点
    const activePoints = Array.from(interactionPoints.current.values()).map(p => ({
      x: p.x * viewport.width / 2,
      y: p.y * viewport.height / 2,
      v: Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    }));

    // 计算手势风力：vx 取负是因为摄像头图像通常是镜像的，或者根据体感调整
    const targetWind = handInfluence.current.active ? handInfluence.current.vx * -15 : 0;
    windVelocity.current = THREE.MathUtils.lerp(windVelocity.current, targetWind, 0.05);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      let x = initialPositions[i3];
      let y = initialPositions[i3 + 1];
      let z = initialPositions[i3 + 2];

      const dist = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x);
      
      const vortex = Math.sin(time * 0.1 + dist * 0.3) * 0.5;
      const rotationSpeed = (0.04 + vortex * 0.02) * (1.0 / (dist * 0.1 + 1.0));
      const currentAngle = angle + time * rotationSpeed;
      
      let targetX = Math.cos(currentAngle) * dist;
      let targetY = Math.sin(currentAngle) * dist;
      let targetZ = z + Math.sin(time * 0.5 + dist * 0.5) * 0.3;

      // 应用鼠标点引力/斥力
      activePoints.forEach(p => {
        const dx = targetX - p.x;
        const dy = targetY - p.y;
        const mouseDist = Math.sqrt(dx * dx + dy * dy);
        const influenceRadius = 4 + p.v * 10; 
        if (mouseDist < influenceRadius) {
          const factor = (influenceRadius - mouseDist) / influenceRadius;
          targetX += dx * factor * (0.3 + p.v * 2);
          targetY += dy * factor * (0.3 + p.v * 2);
        }
      });

      // 应用挥手风力 (水平偏移)
      targetX += windVelocity.current * (1.0 - dist / 20.0);

      positionsAttr.array[i3] = targetX;
      positionsAttr.array[i3 + 1] = targetY;
      positionsAttr.array[i3 + 2] = targetZ;
    }

    positionsAttr.needsUpdate = true;
    // 整体随时间缓慢转动，挥手速度较快时会加速旋转
    meshRef.current.rotation.z += 0.001 + Math.abs(windVelocity.current) * 0.005;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={colors} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={PARTICLE_COUNT} array={sizes} itemSize={1} />
        <bufferAttribute attach="attributes-phase" count={PARTICLE_COUNT} array={phases} itemSize={1} />
        <bufferAttribute attach="attributes-angle" count={PARTICLE_COUNT} array={angles} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

export default StarryField;
