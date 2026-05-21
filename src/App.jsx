import "./App.css";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { XR, ARButton, Interactive, useHitTest } from "@react-three/xr";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";

const getRandomSpawnPosition = () => {
  const angle = Math.random() * Math.PI * 2; 
  // Spawns the fish within the boundaries of the ice floe (0.3m to 0.8m away)
  const radius = 0.3 + Math.random() * 0.5; 
  return [Math.cos(angle) * radius, 0.05, Math.sin(angle) * radius]; 
};

// ==========================================
// 1. THE ENVIRONMENT & TARGETING
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

// NEW: The Ice Stage
function IceFloe() {
  const { scene } = useGLTF("/models/ice_base.glb"); // UPDATE FILENAME IF NEEDED
  return <primitive object={scene} position={[0, -0.05, 0]} scale={1} />;
}


// ==========================================
// 2. THE ACTORS (PENGUIN & FISH)
// ==========================================
function Penguin({ fishPosition, isGameOver }) {
  const group = useRef();
  const { scene, animations } = useGLTF("/models/penguin.glb");
  const { actions } = useAnimations(animations, group);
  
  const footsteps = useRef(new Audio("/audios/snow_footsteps.mp3"));

  useEffect(() => {
    footsteps.current.loop = true;
    footsteps.current.volume = 0.4;
    return () => {
      footsteps.current.pause();
    };
  }, []);

  useFrame((state, delta) => {
    if (!group.current || isGameOver) return;

    // 1. Where is the fish?
    const target = new THREE.Vector3(fishPosition[0], 0, fishPosition[2]);
    const currentPos = group.current.position;
    
    // 2. How far away is it?
    const distance = currentPos.distanceTo(target);

    // Get animation names dynamically (in case they are named differently in Blender)
    const animNames = Object.keys(actions);
    const walkAnim = actions["Walk"] || actions[animNames[1]]; // Guesses the 2nd animation is walk
    const idleAnim = actions["Idle"] || actions[animNames[0]]; // Guesses the 1st animation is idle

    if (distance > 0.15) {
      // THE CHASE: Turn to face the fish and walk towards it
      group.current.lookAt(target);
      group.current.position.lerp(target, 1.5 * delta); // The 1.5 is the walking speed

      // Play walk animation, stop idle
      if (idleAnim) idleAnim.stop();
      if (walkAnim && !walkAnim.isRunning()) walkAnim.play();
      
      // Play footsteps
      if (footsteps.current.paused) footsteps.current.play().catch(() => {});
      
    } else {
      // THE STOP: We reached the fish!
      if (walkAnim) walkAnim.stop();
      if (idleAnim && !idleAnim.isRunning()) idleAnim.play();
      
      // Pause footsteps
      if (!footsteps.current.paused) footsteps.current.pause();
    }
  });

  return <primitive ref={group} object={scene} scale={0.5} position={[0, 0, 0]} />;
}

function Fish({ position, onCollect }) {
  const group = useRef();
  const { scene, animations } = useGLTF("/models/fish.glb"); // UPDATE FILENAME IF NEEDED
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    // Automatically play the fish's wiggling/swimming animation
    const animNames = Object.keys(actions);
    if (animNames.length > 0) {
      actions[animNames[0]].play();
    }
  }, [actions]);

  return (
    <Interactive onSelect={onCollect}>
      <primitive ref={group} object={scene} position={position} scale={0.3} />
    </Interactive>
  );
}

// PRELOAD ASSETS
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/ice_floes.glb");


// ==========================================
// 3. MAIN APP
// ==========================================
export default function App() {
  const [overlayElement, setOverlayElement] = useState(null);
  const [gamePosition, setGamePosition] = useState(null); 
  const [fishPosition, setFishPosition] = useState([0.4, 0.05, 0.4]);
  
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isGameOver, setIsGameOver] = useState(false);

  const ambience = useRef(null);
  const collect = useRef(null);

  useEffect(() => {
    ambience.current = new Audio("/audios/antarctic_ambience.mp3");
    ambience.current.loop = true;
    ambience.current.volume = 0.2; // Lowered slightly so we can hear footsteps

    collect.current = new Audio("/audios/fish_collect.mp3");
    collect.current.volume = 0.8;

    return () => {
      if (ambience.current) ambience.current.pause();
    };
  }, []);

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
          <ambientLight intensity={1.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          
          {!gamePosition ? (
            <Reticle onPlace={setGamePosition} />
          ) : (
            <Suspense fallback={null}>
              <group position={gamePosition}>
                <IceFloe />
                <Penguin fishPosition={fishPosition} isGameOver={isGameOver} />
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