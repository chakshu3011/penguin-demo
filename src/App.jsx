import "./App.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { XR, ARButton, Interactive, useHitTest } from "@react-three/xr";
import { useGLTF } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";

// ==========================================
// MATH HELPER: RANDOM SPAWN GENERATOR
// ==========================================
const getRandomSpawnPosition = () => {
  const angle = Math.random() * Math.PI * 2; 
  const radius = 0.4 + Math.random() * 0.8; 
  return [Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius];
};

// ==========================================
// 1. THE RETICLE (TARGETING RING)
// ==========================================
function Reticle({ onPlace }) {
  const reticleRef = useRef();
  const { camera } = useThree(); 

  useHitTest((hitMatrix, hit) => {
    if (hit) {
      hitMatrix.decompose(
        reticleRef.current.position,
        reticleRef.current.quaternion,
        reticleRef.current.scale
      );

      const dx = reticleRef.current.position.x - camera.position.x;
      const dz = reticleRef.current.position.z - camera.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      const minDistance = 1.2; 
      if (distance > 0.01 && distance < minDistance) {
        const pushAmount = minDistance - distance;
        reticleRef.current.position.x += (dx / distance) * pushAmount;
        reticleRef.current.position.z += (dz / distance) * pushAmount;
      }
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
// 2. GAME COMPONENTS (MODELS)
// ==========================================
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb"); 
useGLTF.preload("/models/ice_floe.glb"); 

// NEW: The Ice Base Component
function IceFloe() {
  const ice = useGLTF("/models/ice_floe.glb");
  return (
    <primitive 
      object={ice.scene} 
      scale={0.01} // <-- Tweak this just like you did with the fish!
      position={[0, -0.05, 0]} // Placed slightly below 0 so the penguin stands ON it, not IN it
    />
  );
}

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

function Fish({ position, onCollect }) {
  const ref = useRef();
  const fish = useGLTF("/models/fish.glb");

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.02;
    }
  });

  return (
    <Interactive onSelect={onCollect}>
      <group ref={ref} position={position}>
        <primitive object={fish.scene} scale={0.005} />
      </group>
    </Interactive>
  );
}

// ==========================================
// 3. MAIN APP
// ==========================================
export default function App() {
  const [overlayElement, setOverlayElement] = useState(null);
  const [gamePosition, setGamePosition] = useState(null); 
  const [fishPosition, setFishPosition] = useState([0.5, 0.25, 0.5]);
  
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isGameOver, setIsGameOver] = useState(false);

  // Audio Refs
  const ambience = useRef(null);
  const collect = useRef(null);
  const footsteps = useRef(null);

  useEffect(() => {
    ambience.current = new Audio("/audios/antarctic_ambience.mp3");
    ambience.current.loop = true;
    ambience.current.volume = 0.3;

    collect.current = new Audio("/audios/fish_collect.mp3");
    
    footsteps.current = new Audio("/audios/snow_footsteps.mp3");
    footsteps.current.volume = 0.5;

    return () => {
      if (ambience.current) {
        ambience.current.pause();
        ambience.current = null;
      }
      if (footsteps.current) {
        footsteps.current.pause();
        footsteps.current = null;
      }
    };
  }, []);

  // Timer Engine
  useEffect(() => {
    let timer;
    if (gamePosition && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
    }
    
    return () => clearInterval(timer);
  }, [gamePosition, timeLeft, isGameOver]);

  const collectFish = () => {
    if (isGameOver) return; 

    setScore((s) => s + 1);
    
    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch((e) => console.log(e));
    }

    if (footsteps.current) {
      footsteps.current.currentTime = 0;
      footsteps.current.play().catch((e) => console.log(e));
    }

    setFishPosition(getRandomSpawnPosition());
  };

  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
    window.location.reload();
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#1a1a2e" }}>
      
      <div ref={setOverlayElement} style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", padding: "20px", width: "100%", boxSizing: "border-box" }}>
          
          <div style={{ color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
            Fish: {score}
          </div>

          {gamePosition && !isGameOver && (
            <div style={{ color: timeLeft <= 5 ? "#e11d48" : "white", fontSize: "28px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              00:{timeLeft.toString().padStart(2, '0')}
            </div>
          )}

          <button
            onClick={stopGame}
            style={{
              padding: "10px 20px", fontSize: "14px", fontWeight: "bold", borderRadius: "20px",
              border: "2px solid white", background: "#e11d48", color: "white", pointerEvents: "auto", cursor: "pointer", maxHeight: "40px"
            }}
          >
            Exit AR
          </button>
        </div>

        {!gamePosition && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", background: "rgba(0,0,0,0.5)", padding: "10px 20px", borderRadius: "10px" }}>
            Scan the floor and tap the ring to place ICY!
          </div>
        )}

        {isGameOver && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", zIndex: 50, color: "white", pointerEvents: "auto" }}>
            <h1 style={{ fontSize: "45px", marginBottom: "10px", textShadow: "2px 2px 10px rgba(0,0,0,1)", color: "#10b981" }}>TIME'S UP!</h1>
            <p style={{ fontSize: "22px", marginBottom: "40px" }}>You fed ICY <b>{score}</b> fish!</p>
            
            <button
              onClick={stopGame}
              style={{ padding: "15px 35px", fontSize: "18px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "#2B4BAA", color: "white", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.5)" }}
            >
              Play Again
            </button>
          </div>
        )}

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
            <Suspense fallback={null}>
              <group position={gamePosition}>
                {/* NEW: The Ice Base rendered under everything else */}
                <IceFloe />
                <Penguin />
                {!isGameOver && (
                  <Fish position={fishPosition} onCollect={collectFish} />
                )}
              </group>
            </Suspense>
          )}
        </XR>
      </Canvas>
    </div>
  );
}