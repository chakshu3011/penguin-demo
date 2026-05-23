import "./App.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { XR, ARButton, Interactive, useHitTest, useXR } from "@react-three/xr";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense, useMemo, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ======================================================
// CONFIGURATION
// ======================================================
const GAME_TIME = 60;
const FISH_GOAL = 10;
const KRILL_GOAL = 5;

const GAME_SIZES = {
  android: {
    iceModelScale: 0.09,
    iceGroundRadius: 1.9,
    penguinScale: 0.9,
    fishScale: 0.0075, // Stabilized scale
    itemY: 0.28,
    itemMinRadius: 0.65,
    itemMaxRadius: 1.35,
  },
  mindar: {
    iceGroundRadius: 0.82,
    iceModelScale: 0.12,
    penguinScale: 0.78,
    fishScale: 0.011,
    fishMinRadius: 0.32,
    fishMaxRadius: 0.58,
    fishZ: 0.18,
  },
};

const ITEM_CONFIG = {
  fish: { label: "Fish", icon: "🐟", model: "/models/fish.glb", color: "#38bdf8" },
  krill: { label: "Krill", icon: "🦐", model: "/models/krill_antartic.glb", color: "#fb7185" },
  plastic: { label: "Plastic", icon: "🧴", model: "/models/plastic_water_bottle.glb", color: "#facc15" },
};

// ======================================================
// COMPONENTS
// ======================================================

function AndroidItem({ item, onCollect }) {
  const ref = useRef();
  const config = ITEM_CONFIG[item.type];
  const gltf = useGLTF(config.model);
  const { actions, names } = useAnimations(gltf.animations, ref);

  useEffect(() => {
    if (item.type === "krill" && names && names.length > 0 && actions[names[0]]) {
      actions[names[0]].reset().play();
    }
  }, [item.type, actions, names]);

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.035;
      ref.current.position.y = item.position[1] + Math.sin(Date.now() * 0.004) * 0.06;
    }
  });

  return (
    <Interactive onSelect={() => onCollect(item.type)}>
      <group ref={ref} position={item.position}>
        <primitive object={gltf.scene} scale={GAME_SIZES.android.fishScale} />
        <mesh visible={false}>
          <sphereGeometry args={[0.24, 24, 24]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
    </Interactive>
  );
}

// ======================================================
// MAIN APP
// ======================================================
export default function App() {
  const [mode, setMode] = useState("intro");
  const [score, setScore] = useState(0);
  const [fishCount, setFishCount] = useState(0);
  const [krillCount, setKrillCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  
  const [androidItem, setAndroidItem] = useState({ type: "fish", position: [0, 0.28, 0.5] });
  const [androidGamePosition, setAndroidGamePosition] = useState(null);
  const [isXRPresenting, setIsXRPresenting] = useState(false);

  // Audio refs
  const collectSound = useRef(new Audio("/audios/fish_collect.mp3"));
  const penguinChirp = useRef(new Audio("/audios/baby_penguin.mp3"));

  // Timer logic
  useEffect(() => {
    if (!isGameOver && androidGamePosition && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft((p) => p - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
      setGameResult("timeup");
    }
  }, [androidGamePosition, timeLeft, isGameOver]);

  const handleCollection = (type) => {
    if (isGameOver) return;
    if (type === "plastic") {
      setIsGameOver(true);
      setGameResult("plastic");
      return;
    }

    if (type === "fish") setFishCount(f => f + 1);
    if (type === "krill") setKrillCount(k => k + 1);
    setScore(s => s + 1);
    
    collectSound.current.currentTime = 0;
    collectSound.current.play().catch(() => {});
    
    if (fishCount + (type === "fish" ? 1 : 0) >= FISH_GOAL || krillCount + (type === "krill" ? 1 : 0) >= KRILL_GOAL) {
      setIsGameOver(true);
      setGameResult("win");
      return;
    }

    setAndroidItem({
      type: getRandomItemType(),
      position: [ (Math.random()-0.5), GAME_SIZES.android.itemY, (Math.random()-0.5) ]
    });
  };

  const resetGame = () => {
    setScore(0);
    setFishCount(0);
    setKrillCount(0);
    setTimeLeft(GAME_TIME);
    setIsGameOver(false);
    setGameResult(null);
    setAndroidItem({ type: "fish", position: [0, 0.28, 0.5] });
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", position: "relative", background: "#07111f" }}>
      
      {/* HUD OVERLAY */}
      <div style={{ position: "absolute", zIndex: 10, width: "100%", padding: "20px", pointerEvents: "none" }}>
        <div style={{ color: "white", fontSize: "20px", fontWeight: "bold" }}>
          Score: {score} | Time: {timeLeft}s
        </div>
      </div>

      {isGameOver && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.9)", color: "white" }}>
          <h1>{gameResult === "win" ? "ICY IS SAFE!" : "GAME OVER"}</h1>
          <p>{gameResult === "plastic" ? "You fed plastic to ICY!" : `Score: ${score}`}</p>
          <button onClick={() => { resetGame(); setMode("intro"); }} style={{ padding: "10px 20px" }}>Play Again</button>
        </div>
      )}

      {mode === "intro" && (
        <div style={{ position: "absolute", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", color: "white" }}>
          <h1>ICY AR</h1>
          <p>Goal: 10 Fish or 5 Krill. Avoid Plastic!</p>
          <ARButton onClick={() => { resetGame(); setMode("android-webxr"); }} />
        </div>
      )}

      <Canvas style={{ position: "absolute", inset: 0, zIndex: 2 }}>
        <XR>
          {isXRPresenting ? (
            <>
              <ambientLight intensity={2} />
              {!androidGamePosition ? (
                <Reticle onPlace={setAndroidGamePosition} />
              ) : (
                <group position={androidGamePosition}>
                  <IceFloe />
                  <Penguin />
                  {!isGameOver && <AndroidItem item={androidItem} onCollect={handleCollection} />}
                </group>
              )}
            </>
          ) : (
            <XRTracker onXRStart={() => setIsXRPresenting(true)} />
          )}
        </XR>
      </Canvas>
    </div>
  );
}