import "./App.css";
import { Canvas, useFrame } from "@react-three/fiber";
import { XR, ARButton, Interactive, useHitTest, useXR } from "@react-three/xr";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense, useCallback } from "react";
import * as THREE from "three";

// ======================================================
// CONFIG & MODELS
// ======================================================
const GAME_TIME = 60;
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/krill_antartic.glb");
useGLTF.preload("/models/plastic_water_bottle.glb");
useGLTF.preload("/models/ice_floe.glb");

function getRandomItemType() {
  const random = Math.random();
  if (random < 0.45) return "fish";
  if (random < 0.82) return "krill";
  return "plastic";
}

// ======================================================
// 3D MODELS
// ======================================================

function Penguin() {
  const group = useRef();
  const { scene, animations } = useGLTF("/models/penguin.glb");
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    if (actions && Object.keys(actions).length > 0) {
      const name = Object.keys(actions)[0];
      actions[name].reset().play();
    }
  }, [actions]);

  return <primitive ref={group} object={scene} scale={0.7} position={[0, 0.03, 0]} />;
}

function AndroidItem({ item, onCollect }) {
  const ref = useRef();
  const fish = useGLTF("/models/fish.glb");
  const krill = useGLTF("/models/krill_antartic.glb");
  const plastic = useGLTF("/models/plastic_water_bottle.glb");

  const model = useMemo(() => {
    if (item.type === "krill") return krill.scene;
    if (item.type === "plastic") return plastic.scene;
    return fish.scene;
  }, [item.type, fish, krill, plastic]);

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.035;
      ref.current.position.y = item.position[1] + Math.sin(Date.now() * 0.004) * 0.06;
    }
  });

  return (
    <Interactive onSelect={() => onCollect(item.type)}>
      <group ref={ref} position={item.position}>
        <primitive object={model} scale={0.0075} />
      </group>
    </Interactive>
  );
}

// ======================================================
// MAIN APP
// ======================================================

export default function App() {
  const [androidGamePosition, setAndroidGamePosition] = useState(null);
  const [androidItem, setAndroidItem] = useState({ type: "fish", position: [0, 0.28, 0.5] });
  const [score, setScore] = useState(0);
  const [fishCount, setFishCount] = useState(0);
  const [krillCount, setKrillCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState(null); // 'win', 'plastic', or 'timeup'

  const collectSound = useRef(new Audio("/audios/fish_collect.mp3"));

  // Timer
  useEffect(() => {
    if (androidGamePosition && timeLeft > 0 && !isGameOver) {
      const timer = setInterval(() => setTimeLeft((p) => p - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
      setGameResult("timeup");
    }
  }, [androidGamePosition, timeLeft, isGameOver]);

  const handleCollect = (type) => {
    if (isGameOver) return;
    if (type === "plastic") {
      setIsGameOver(true);
      setGameResult("plastic");
      return;
    }

    collectSound.current.play().catch(() => {});
    const newFish = type === "fish" ? fishCount + 1 : fishCount;
    const newKrill = type === "krill" ? krillCount + 1 : krillCount;
    
    setFishCount(newFish);
    setKrillCount(newKrill);
    setScore(s => s + 1);

    if (newFish >= 10 || newKrill >= 5) {
      setIsGameOver(true);
      setGameResult("win");
    } else {
      setAndroidItem({
        type: getRandomItemType(),
        position: [(Math.random() - 0.5), 0.28, (Math.random() - 0.5)]
      });
    }
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#07111f" }}>
      
      {/* HUD (Absolute positioned to stay on top, does NOT unmount canvas) */}
      <div style={{ position: "absolute", zIndex: 10, width: "100%", padding: "20px", color: "white", pointerEvents: "none" }}>
        <h1>Score: {score} | Time: {timeLeft}s</h1>
      </div>

      {isGameOver && (
        <div style={{ position: "absolute", zIndex: 20, inset: 0, background: "rgba(0,0,0,0.9)", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h1>{gameResult === "win" ? "ICY IS SAFE!" : "GAME OVER"}</h1>
          <p>{gameResult === "plastic" ? "You fed ICY plastic!" : "Try again!"}</p>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px" }}>Restart</button>
        </div>
      )}

      <Canvas camera={{ position: [0, 0, 0], fov: 60 }} style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <XR>
          <ambientLight intensity={2} />
          {!androidGamePosition ? (
             <Interactive onSelect={(e) => setAndroidGamePosition(e.intersection.point.toArray())}>
               <mesh rotation={[-Math.PI/2, 0, 0]}><planeGeometry args={[2,2]} /><meshBasicMaterial opacity={0.1} transparent/></mesh>
             </Interactive>
          ) : (
            <group position={androidGamePosition}>
              <Penguin />
              {!isGameOver && <AndroidItem item={androidItem} onCollect={handleCollect} />}
            </group>
          )}
        </XR>
      </Canvas>
      
      {/* AR Button stays mounted */}
      <ARButton style={{ zIndex: 30 }} />
    </div>
  );
}