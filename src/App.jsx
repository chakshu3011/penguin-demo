import "./App.css";
import { Canvas, useFrame } from "@react-three/fiber";
import { XR, ARButton, Interactive, useHitTest } from "@react-three/xr";
import { useGLTF } from "@react-three/drei";
import { useRef, useEffect, useState } from "react";

// ==========================================
// MATH HELPER: RANDOM SPAWN GENERATOR
// Calculates a random position around the penguin
// ==========================================
const getRandomSpawnPosition = () => {
  const angle = Math.random() * Math.PI * 2; // Random direction (0 to 360 degrees)
  const radius = 0.4 + Math.random() * 0.8; // Random distance (0.4m to 1.2m away)
  
  // Calculate X and Z coordinates based on angle and radius. Y is 0.25 (floating height)
  return [Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius];
};

// ==========================================
// 1. THE RETICLE (TARGETING RING)
// ==========================================
function Reticle({ onPlace }) {
  const reticleRef = useRef();

  useHitTest((hitMatrix, hit) => {
    if (hit) {
      hitMatrix.decompose(
        reticleRef.current.position,
        reticleRef.current.quaternion,
        reticleRef.current.scale
      );
    }
  });

  return (
    <Interactive onSelect={() => onPlace(reticleRef.current.position.clone())}>
      <mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.2, 32]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </Interactive>
  );
}

// ==========================================
// 2. GAME COMPONENTS
// ==========================================
function Penguin() {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = Math.sin(state.clock.elapsedTime) * 0.5;
    }
  });

  return (
    <primitive
      ref={group}
      object={penguin.scene}
      scale={0.5}
      position={[0, 0, 0]}
    />
  );
}

// NEW: The Fish now accepts a `position` prop from the main App state
function Fish({ position, onCollect }) {
  const ref = useRef();

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.02;
    }
  });

  return (
    <Interactive onSelect={onCollect}>
      <mesh ref={ref} position={position}>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
        <meshStandardMaterial color="orange" />
      </mesh>
    </Interactive>
  );
}

// ==========================================
// 3. MAIN APP
// ==========================================
export default function App() {
  const [score, setScore] = useState(0);
  const [overlayElement, setOverlayElement] = useState(null);
  const [gamePosition, setGamePosition] = useState(null); 
  
  // NEW: State to track exactly where the active fish is
  const [fishPosition, setFishPosition] = useState([0.5, 0.25, 0.5]);

  const ambience = useRef(null);
  const collect = useRef(null);

  useEffect(() => {
    ambience.current = new Audio("/audios/antarctic_ambience.mp3");
    ambience.current.loop = true;
    ambience.current.volume = 0.3;

    collect.current = new Audio("/audios/fish_collect.mp3");

    return () => {
      if (ambience.current) {
        ambience.current.pause();
        ambience.current = null;
      }
    };
  }, []);

  // THE GAME LOOP
  const collectFish = () => {
    // 1. Add point
    setScore((s) => s + 1);
    
    // 2. Play Sound
    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch((e) => console.log(e));
    }
    
    // 3. Teleport the box to a new random location
    setFishPosition(getRandomSpawnPosition());
  };

  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
    window.location.reload();
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#1a1a2e" }}>
      
      <div ref={setOverlayElement} style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none" }}>
        
        <div style={{ position: "absolute", top: "30px", left: "20px", color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
          Fish: {score}
        </div>

        {!gamePosition && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", background: "rgba(0,0,0,0.5)", padding: "10px 20px", borderRadius: "10px" }}>
            Scan the floor and tap the ring to place ICY!
          </div>
        )}

        <button
          onClick={stopGame}
          style={{
            position: "absolute", top: "25px", right: "20px",
            padding: "10px 20px", fontSize: "14px", fontWeight: "bold", borderRadius: "20px",
            border: "2px solid white", background: "#e11d48", color: "white", pointerEvents: "auto", cursor: "pointer"
          }}
        >
          Exit AR
        </button>
      </div>

      {overlayElement && (
        <ARButton
          sessionInit={{
            requiredFeatures: ["hit-test"],
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: overlayElement } 
          }}
          onClick={() => {
            if (ambience.current) {
              ambience.current.play().catch(e => console.log(e));
            }
          }}
          style={{
            position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
            padding: '14px 28px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px',
            border: 'none', background: 'white', color: 'black', cursor: 'pointer', zIndex: 20
          }}
        />
      )}

      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <XR>
          <ambientLight intensity={2} />
          
          {!gamePosition ? (
            <Reticle onPlace={setGamePosition} />
          ) : (
            <group position={gamePosition}>
              <Penguin />
              {/* Pass the dynamic position state and the collect function into the Fish */}
              <Fish position={fishPosition} onCollect={collectFish} />
            </group>
          )}

        </XR>
      </Canvas>
    </div>
  );
}