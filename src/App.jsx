import "./App.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { XR, ARButton, Interactive, useHitTest, useXR } from "@react-three/xr";
// NEW: Imported useAnimations to unlock the real 3D animations
import { useGLTF, useAnimations } from "@react-three/drei"; 
import { useRef, useEffect, useState, Suspense } from "react";

function XRTracker({ onXRStart }) {
  const { isPresenting } = useXR();
  useEffect(() => {
    onXRStart(isPresenting);
  }, [isPresenting, onXRStart]);
  return null;
}

const getRandomSpawnPosition = () => {
  const angle = Math.random() * Math.PI * 2; 
  const radius = 0.4 + Math.random() * 0.8; 
  return [Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius];
};

// ==========================================
// 1. THE RETICLE (Targeting Ring)
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
    }
  });

  return (
    <Interactive onSelect={() => {
      const spawnPos = reticleRef.current.position.clone();
      
      // THE SPAWN FIX: Calculate distance to camera. 
      // If you aim at your feet, it forces the game 1.5m away from you!
      const dx = spawnPos.x - camera.position.x;
      const dz = spawnPos.z - camera.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < 1.5) {
        const push = 1.5 - distance;
        spawnPos.x += (dx / distance) * push;
        spawnPos.z += (dz / distance) * push;
      }
      
      onPlace(spawnPos);
    }}>
      <mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.2, 32]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </Interactive>
  );
}

// ==========================================
// 2. GAME MODELS
// ==========================================
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb"); 
useGLTF.preload("/models/ice_floe.glb"); 

function IceFloe() {
  const ice = useGLTF("/models/ice_floe.glb");
  return <primitive object={ice.scene} scale={0.05} position={[0, -0.05, 0]} />;
}

function Penguin({ isGameOver, score }) {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");
  
  // NEW: Grab the baked animations out of the .glb file
  const { actions, names } = useAnimations(penguin.animations, group);

  useEffect(() => {
    // If the file has animations, play the first one automatically
    if (names && names.length > 0) {
      const defaultAnimation = actions[names[0]];
      defaultAnimation.reset().fadeIn(0.5).play();
    }
  }, [actions, names]);

  return <primitive ref={group} object={penguin.scene} scale={0.5} position={[0, 0, 0]} />;
}

function Fish({ position, onCollect }) {
  const ref = useRef();
  const fish = useGLTF("/models/fish.glb");

  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.02;
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
  const [isARActive, setIsARActive] = useState(false);
  const [overlayElement, setOverlayElement] = useState(null);
  const [gamePosition, setGamePosition] = useState(null); 
  const [fishPosition, setFishPosition] = useState([0.5, 0.25, 0.5]);
  
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isGameOver, setIsGameOver] = useState(false);

  const ambience = useRef(null);
  const collect = useRef(null);
  const footsteps = useRef(null);
  const penguinChirp = useRef(null);

  useEffect(() => {
    ambience.current = new Audio("/audios/antarctic_ambience.mp3");
    ambience.current.loop = true;
    ambience.current.volume = 0.3;

    collect.current = new Audio("/audios/fish_collect.mp3");
    
    footsteps.current = new Audio("/audios/snow_footsteps.mp3");
    footsteps.current.volume = 0.5;

    penguinChirp.current = new Audio("/audios/baby_penguin.mp3");
    penguinChirp.current.volume = 1.0; // Boosted volume for the end screen

    return () => {
      if (ambience.current) ambience.current.pause();
      if (footsteps.current) footsteps.current.pause();
      if (penguinChirp.current) penguinChirp.current.pause();
    };
  }, []);

  // Timer Engine
  useEffect(() => {
    let timer;
    if (gamePosition && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
      
      // NEW: Play the penguin voice line exactly when the game ends!
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch(e => console.log(e));
      }
    }
    return () => clearInterval(timer);
  }, [gamePosition, timeLeft, isGameOver]);

  const collectFish = () => {
    if (isGameOver) return; 

    setScore(score + 1);
    
    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch(e => console.log(e));
    }
    if (footsteps.current) {
      footsteps.current.currentTime = 0;
      footsteps.current.play().catch(e => console.log(e));
    }

    setFishPosition(getRandomSpawnPosition());
  };

  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
    window.location.reload();
  };

  // NEW: The Logic for the Celebration Tiers
  const getEndMessage = () => {
    if (score === 0) return "ICY is sad and starving! 😭";
    if (score <= 3) return "ICY survived, but is still hungry! 🐟";
    if (score <= 7) return "ICY is well-fed and happy! 🐧";
    return "ICY is stuffed and ready to dance! 🎉";
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#0b0f19" }}>
      
      {!isARActive && (
        <div style={{ position: "absolute", zIndex: 5, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyItems: "center", paddingTop: "20vh", color: "white" }}>
          <h1 style={{ fontSize: "40px", marginBottom: "10px" }}>ICY AR</h1>
          <p style={{ fontSize: "18px", opacity: 0.8 }}>An Augmented Reality Experience</p>
        </div>
      )}

      <div ref={setOverlayElement} style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none", display: isARActive ? "flex" : "none", flexDirection: "column", justifyContent: "space-between" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", padding: "20px", width: "100%", boxSizing: "border-box" }}>
          <div style={{ color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
            Fish: {score}
          </div>
          {gamePosition && !isGameOver && (
            <div style={{ color: timeLeft <= 5 ? "#e11d48" : "white", fontSize: "28px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              00:{timeLeft.toString().padStart(2, '0')}
            </div>
          )}
          <button onClick={stopGame} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: "bold", borderRadius: "20px", border: "2px solid white", background: "#e11d48", color: "white", pointerEvents: "auto", cursor: "pointer", maxHeight: "40px" }}>
            Exit AR
          </button>
        </div>

        {!gamePosition && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", background: "rgba(0,0,0,0.5)", padding: "10px 20px", borderRadius: "10px" }}>
            Scan the floor and tap the ring to place ICY!
          </div>
        )}

        {isGameOver && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", zIndex: 50, color: "white", pointerEvents: "auto", textAlign: "center", padding: "20px" }}>
            <h1 style={{ fontSize: "45px", marginBottom: "10px", textShadow: "2px 2px 10px rgba(0,0,0,1)", color: "#10b981" }}>TIME'S UP!</h1>
            <p style={{ fontSize: "22px", marginBottom: "10px" }}>You fed ICY <b>{score}</b> fish!</p>
            
            {/* NEW: Displays the dynamic celebration text */}
            <p style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "40px", color: "#60a5fa" }}>
              {getEndMessage()}
            </p>

            <button onClick={stopGame} style={{ padding: "15px 35px", fontSize: "18px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "#2B4BAA", color: "white", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.5)" }}>
              Play Again
            </button>
          </div>
        )}
      </div>

      {overlayElement && (
        <ARButton
          sessionInit={{ requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlayElement } }}
          onClick={() => { if (ambience.current) ambience.current.play().catch(e => console.log(e)); }}
          style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', padding: '14px 28px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', border: 'none', background: 'white', color: 'black', cursor: 'pointer', zIndex: 20 }}
        />
      )}

      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <XR>
          <XRTracker onXRStart={setIsARActive} />
          {isARActive && (
            <>
              <ambientLight intensity={2} />
              {!gamePosition ? (
                <Reticle onPlace={setGamePosition} />
              ) : (
                <Suspense fallback={null}>
                  <group position={gamePosition}>
                    <IceFloe />
                    {/* Passed the game state down so the Penguin component can react later if needed */}
                    <Penguin isGameOver={isGameOver} score={score} />
                    {!isGameOver && <Fish position={fishPosition} onCollect={collectFish} />}
                  </group>
                </Suspense>
              )}
            </>
          )}
        </XR>
      </Canvas>
    </div>
  );
}