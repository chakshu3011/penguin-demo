import "./App.css";
import { Canvas, useFrame } from "@react-three/fiber";
import { XR, ARButton, Interactive, useHitTest, useXR } from "@react-three/xr";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ======================================================
// CONFIG & CONSTANTS
// ======================================================
const MINDAR_SCRIPT = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";
const TARGET_SRC = "/targets/icy-marker.mind";

const GAME_SIZES = {
  android: {
    iceModelScale: 0.09,
    iceGroundRadius: 1.9,
    penguinScale: 0.9,
    fishScale: 0.0075,
    fishY: 0.34,
    fishMinRadius: 0.65,
    fishMaxRadius: 1.35,
  }
};

// ======================================================
// HELPERS
// ======================================================

function isIOSDevice() {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

// 70% Fish, 20% Krill, 10% Plastic
function getRandomItemType() {
  const random = Math.random();
  if (random < 0.70) return "fish";
  if (random < 0.90) return "krill";
  return "plastic";
}

const getRandomAndroidPosition = () => {
  const s = GAME_SIZES.android;
  const angle = Math.random() * Math.PI * 2;
  const radius = s.fishMinRadius + Math.random() * (s.fishMaxRadius - s.fishMinRadius);
  return [Math.cos(angle) * radius, s.fishY, Math.sin(angle) * radius];
};

// ======================================================
// COMPONENTS
// ======================================================

function Penguin() {
  const group = useRef();
  const { scene, animations } = useGLTF("/models/penguin.glb");
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    if (actions && Object.keys(actions).length > 0) {
      actions[Object.keys(actions)[0]].reset().fadeIn(0.25).play();
    }
  }, [actions]);

  return <primitive ref={group} object={scene} scale={GAME_SIZES.android.penguinScale} position={[0, 0.03, 0]} />;
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
        <primitive object={model} scale={GAME_SIZES.android.fishScale} />
      </group>
    </Interactive>
  );
}

// ======================================================
// MAIN APP
// ======================================================

export default function App() {
  const [mode, setMode] = useState("intro"); // intro | android-webxr
  const [androidGamePosition, setAndroidGamePosition] = useState(null);
  const [androidItem, setAndroidItem] = useState({ type: "fish", position: getRandomAndroidPosition() });
  
  const [fishCount, setFishCount] = useState(0);
  const [krillCount, setKrillCount] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState(null); // win | plastic | timeup

  const collectSound = useRef(new Audio("/audios/fish_collect.mp3"));

  const handleCollection = (type) => {
    if (isGameOver) return;

    if (type === "plastic") {
      setGameResult("plastic");
      setIsGameOver(true);
      return;
    }

    collectSound.current.currentTime = 0;
    collectSound.current.play().catch(() => {});

    const newFish = type === "fish" ? fishCount + 1 : fishCount;
    const newKrill = type === "krill" ? krillCount + 1 : krillCount;

    setFishCount(newFish);
    setKrillCount(newKrill);

    if (newFish >= 10 || newKrill >= 5) {
      setGameResult("win");
      setIsGameOver(true);
    } else {
      setAndroidItem({ type: getRandomItemType(), position: getRandomAndroidPosition() });
    }
  };

  const resetGame = () => {
    setFishCount(0);
    setKrillCount(0);
    setIsGameOver(false);
    setGameResult(null);
    setAndroidItem({ type: "fish", position: getRandomAndroidPosition() });
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#07111f" }}>
      
      {/* HUD (Absolute, does not unmount) */}
      <div style={{ position: "absolute", zIndex: 10, width: "100%", padding: "20px", color: "white", pointerEvents: "none" }}>
        <h1>🐟 {fishCount} | 🦐 {krillCount}</h1>
      </div>

      {/* GAME OVER SCREEN */}
      {isGameOver && (
        <div style={{ position: "absolute", zIndex: 20, inset: 0, background: "rgba(0,0,0,0.9)", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h1>{gameResult === "win" ? "ICY IS SAFE!" : "GAME OVER"}</h1>
          <p>{gameResult === "plastic" ? "You fed ICY plastic! It's deadly." : "Try again!"}</p>
          <button onClick={() => { resetGame(); setMode("intro"); }} style={{ padding: "10px 20px" }}>Restart</button>
        </div>
      )}

      {/* INTRO SCREEN */}
      {mode === "intro" && (
        <div style={{ position: "absolute", zIndex: 5, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white" }}>
          <h1>ICY AR</h1>
          <p>Goal: 10 Fish or 5 Krill. Avoid Plastic!</p>
          <ARButton onClick={() => setMode("android-webxr")} />
        </div>
      )}

      {/* STABLE CANVAS (Always Mounted) */}
      <Canvas style={{ position: "absolute", inset: 0, zIndex: 1 }} camera={{ position: [0, 0, 0], fov: 60 }}>
        <XR>
          <ambientLight intensity={2} />
          {!androidGamePosition ? (
            <Interactive onSelect={(e) => setAndroidGamePosition(e.intersection.point.toArray())}>
              <mesh rotation={[-Math.PI/2, 0, 0]}><planeGeometry args={[2,2]} /><meshBasicMaterial opacity={0.1} transparent/></mesh>
            </Interactive>
          ) : (
            <group position={androidGamePosition}>
              <Penguin />
              {!isGameOver && <AndroidItem item={androidItem} onCollect={handleCollection} />}
            </group>
          )}
        </XR>
      </Canvas>
    </div>
  );
}