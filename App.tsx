
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Float, Sphere, MeshDistortMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import StarryField from './components/StarryField';
import { interpretTheStars } from './services/geminiService';

declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

const Moon: React.FC = () => {
  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <Sphere args={[2, 64, 64]} position={[0, 0, -2]}>
        <MeshDistortMaterial
          color="#fff5b0"
          emissive="#ffbb00"
          emissiveIntensity={2.5}
          speed={2}
          distort={0.15}
          radius={1}
        />
      </Sphere>
      <pointLight intensity={15} distance={25} color="#fffde7" />
    </Float>
  );
};

const GestureCameraHandler: React.FC<{ targetDistance: number; handX: number }> = ({ targetDistance, handX }) => {
  const { camera } = useThree();
  useFrame(() => {
    const currentPos = camera.position.clone();
    const currentLen = currentPos.length();
    
    // 平滑插值距离
    const newLen = THREE.MathUtils.lerp(currentLen, targetDistance, 0.08);
    
    // 根据手部水平位置微调相机角度 (左右挥手带动视角微晃)
    const targetAngleX = handX * 0.2; 
    const currentAngleX = Math.atan2(camera.position.x, camera.position.z);
    const newAngleX = THREE.MathUtils.lerp(currentAngleX, targetAngleX, 0.05);
    
    camera.position.set(
      Math.sin(newAngleX) * newLen,
      camera.position.y,
      Math.cos(newAngleX) * newLen
    );
    camera.lookAt(0, 0, 0);
  });
  return null;
};

const App: React.FC = () => {
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [camDistance, setCamDistance] = useState(18);
  const [isHandTracking, setIsHandTracking] = useState(false);
  const [isWaving, setIsWaving] = useState(false);
  const [camStatus, setCamStatus] = useState<'off' | 'starting' | 'on'>('off');
  
  // 用于传递给 StarryField 的手部状态
  const handState = useRef({ x: 0, y: 0, vx: 0, vy: 0, active: false });
  const prevHandX = useRef(0.5);

  const videoRef = useRef<HTMLVideoElement>(null);
  const lightPos = useMemo(() => new THREE.Vector3(0, 0, -2), []);
  const interactionPoints = useRef<Map<number, { x: number; y: number; vx: number; vy: number }>>(new Map());
  const lastPointerPositions = useRef<Map<number, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (!videoRef.current || !window.Hands || !window.Camera) return;

    setCamStatus('starting');
    const hands = new window.Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    hands.onResults((results: any) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setIsHandTracking(true);
        const landmarks = results.multiHandLandmarks[0];
        
        // 获取手掌中心位置 (使用 0, 5, 17 的平均值)
        const wrist = landmarks[0];
        const currentX = (wrist.x - 0.5) * 2; // 映射到 -1 到 1
        const currentY = -(wrist.y - 0.5) * 2;
        
        const vx = wrist.x - prevHandX.current;
        prevHandX.current = wrist.x;

        // 检测“挥手”：速度超过阈值
        const waving = Math.abs(vx) > 0.04;
        setIsWaving(waving);

        handState.current = { 
          x: currentX, 
          y: currentY, 
          vx: vx * 10, // 放大速度感应
          vy: 0, 
          active: true 
        };

        // 缩放逻辑 (食指尖 8, 拇指尖 4)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        const fingerTips = [8, 12, 16, 20].map(idx => landmarks[idx]);
        const spreadScore = fingerTips.reduce((acc, tip) => 
          acc + Math.hypot(tip.x - wrist.x, tip.y - wrist.y), 0) / 4;

        if (pinchDist < 0.05) {
          setCamDistance(prev => Math.min(prev + 0.4, 35));
        } else if (spreadScore > 0.4) {
          setCamDistance(prev => Math.max(prev - 0.4, 10));
        }
      } else {
        setIsHandTracking(false);
        setIsWaving(false);
        handState.current.active = false;
      }
    });

    const cameraInstance = new window.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await hands.send({ image: videoRef.current });
          setCamStatus('on');
        }
      },
      width: 640,
      height: 480,
    });
    cameraInstance.start();

    return () => {
      cameraInstance.stop();
      hands.close();
    };
  }, []);

  const handleInterpret = useCallback(async () => {
    setLoading(true);
    const text = await interpretTheStars(16000);
    setInterpretation(text || "星空无言，唯有光影流转。");
    setLoading(false);
  }, []);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      lastPointerPositions.current.set(e.pointerId, { x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 });
      interactionPoints.current.set(e.pointerId, { 
        x: (e.clientX / window.innerWidth) * 2 - 1, 
        y: -(e.clientY / window.innerHeight) * 2 + 1,
        vx: 0,
        vy: 0
      });
    };
    const handlePointerMove = (e: PointerEvent) => {
      const currentX = (e.clientX / window.innerWidth) * 2 - 1;
      const currentY = -(e.clientY / window.innerHeight) * 2 + 1;
      const last = lastPointerPositions.current.get(e.pointerId);
      if (last) {
        interactionPoints.current.set(e.pointerId, { x: currentX, y: currentY, vx: currentX - last.x, vy: currentY - last.y });
        lastPointerPositions.current.set(e.pointerId, { x: currentX, y: currentY });
      }
    };
    const handlePointerUp = (e: PointerEvent) => {
      interactionPoints.current.delete(e.pointerId);
      lastPointerPositions.current.delete(e.pointerId);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#020412] overflow-hidden touch-none">
      <video ref={videoRef} className="hidden" playsInline muted />

      <Canvas
        camera={{ position: [0, 0, 18], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={['#02040c']} />
        <StarryField 
          lightPos={lightPos} 
          interactionPoints={interactionPoints} 
          handInfluence={handState}
        />
        <Moon />
        <GestureCameraHandler targetDistance={camDistance} handX={handState.current.active ? handState.current.x : 0} />

        <EffectComposer disableNormalPass>
          <Bloom intensity={2.2} luminanceThreshold={0.15} mipmapBlur />
          <Noise opacity={0.05} />
          <Vignette darkness={1.2} />
          <ChromaticAberration offset={new THREE.Vector2(0.0006, 0.0006)} />
        </EffectComposer>

        <OrbitControls 
          enablePan={false} 
          minDistance={8} 
          maxDistance={40} 
          autoRotate={!isHandTracking}
          autoRotateSpeed={0.2}
        />
      </Canvas>

      <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center p-12 z-10">
        <div className="absolute top-8 right-8 flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${isHandTracking ? (isWaving ? 'bg-blue-400 shadow-[0_0_15px_#60a5fa]' : 'bg-green-400 shadow-[0_0_10px_#4ade80]') : 'bg-white/20'}`} />
            <span className="text-[10px] text-white/50 tracking-[0.2em] uppercase font-mono">
              {camStatus === 'starting' ? '系统启动中...' : isWaving ? '正在挥动手掌' : isHandTracking ? '手势交互中' : '等待手势控制'}
            </span>
          </div>
          <div className="text-[9px] text-white/20 uppercase tracking-widest text-right space-y-1">
            <p>捏合/张开：远离/进入星空</p>
            <p>左右挥手：搅动星辰湍流</p>
          </div>
        </div>

        {interpretation && (
          <div className="bg-black/60 backdrop-blur-3xl border border-white/10 p-10 rounded-[2.5rem] max-w-2xl animate-fade-in pointer-events-auto shadow-2xl">
            <p className="text-yellow-50/90 font-serif leading-[2.2] text-center text-2xl italic tracking-widest whitespace-pre-wrap">
              {interpretation}
            </p>
            <button onClick={() => setInterpretation(null)} className="mt-8 text-[10px] text-blue-400/60 hover:text-white transition-colors w-full text-center tracking-[0.5em] uppercase">
              [ 归于沉静 ]
            </button>
          </div>
        )}

        {!interpretation && (
          <div className="absolute bottom-16 pointer-events-auto">
            <button onClick={handleInterpret} disabled={loading}
              className="group relative px-14 py-6 overflow-hidden rounded-full border border-yellow-200/20 bg-white/5 text-yellow-100/90 font-serif text-lg tracking-[0.4em] hover:text-white transition-all">
              <div className="absolute inset-0 bg-yellow-200/5 translate-y-full group-hover:translate-y-0 transition-transform duration-700" />
              <span className="relative flex items-center gap-4">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '✧ 解读星空'}
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="absolute inset-0 pointer-events-none opacity-20 mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/canvas-orange.png')]" />
      <div className="absolute inset-0 pointer-events-none bg-radial-gradient" />

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(30px); filter: blur(10px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .animate-fade-in { animation: fade-in 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .bg-radial-gradient { background: radial-gradient(circle at center, transparent 0%, rgba(2,4,18,0.9) 100%); }
      `}</style>
    </div>
  );
};

export default App;
