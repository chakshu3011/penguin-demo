import "./App.css";
import { Canvas, useFrame } from "@react-three/fiber";
import { XR, ARButton, Interactive, useXR } from "@react-three/xr";
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
// GAME MODELS
// ==========================================
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb"); 
useGLTF.preload("/models/ice_floe.glb"); 

function IceFloe() {
  const ice = useGLTF("/models/ice_floe.glb");
  return (
    <primitive 
      object={ice.scene} 
      // X, Y, Z scaling: Stretches the width and depth, keeps the height flat
      scale={[0.15, 0.02, 0.15]} 
      position={[0, -0.05, 0]} 
    />
  );
}

function Penguin({ isGameOver, fishPosition }) {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(penguin.animations, group);

  useEffect(() => {
    if (names && names.length > 0) {
      const defaultAnimation = actions[names[0]];
      defaultAnimation.reset().fadeIn(0.5).play();
    }
  }, [actions, names]);

  useFrame(() => {
    // Forces ICY to constantly rotate and face the active fish
    if (group.current && !isGameOver && fishPosition) {
      group.current.lookAt(fishPosition[0], group.current.position.y, fishPosition[2]);
    }
  });

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
// MAIN APP
// ==========================================
export default function App() {
  const [isARActive, setIsARActive] = useState(false);
  const [hasStarted, setHasStarted] = useState(false); // NEW: Tracks if "Start Game" was clicked
  const [overlayElement, setOverlayElement] = useState(null);
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
    penguinChirp.current.volume = 1.0; 

    return () => {
      if (ambience.current) ambience.current.pause();
      if (footsteps.current) footsteps.current.pause();
      if (penguinChirp.current) penguinChirp.current.pause();
    };
  }, []);

  // Timer Engine
  useEffect(() => {
    let timer;
    // Timer ONLY runs if the game has started
    if (hasStarted && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch(e => console.log(e));
      }
    }
    return () => clearInterval(timer);
  }, [hasStarted, timeLeft, isGameOver]);

  const collectFish = () => {
    if (isGameOver || !hasStarted) return; 

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

  const startGame = () => {
    setHasStarted(true);
  };

  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
    window.location.reload();
  };

  const getEndMessage = () => {
    if (score === 0) return "ICY is sad and starving! 😭";
    if (score <= 3) return "ICY survived, but is still hungry! 🐟";
    if (score <= 7) return "ICY is well-fed and happy! 🐧";
    return "ICY is stuffed and ready to dance! 🎉";
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#0b0f19" }}>
      
      {/* LANDING PAGE */}
      {!isARActive && (
        <div style={{ position: "absolute", zIndex: 5, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyItems: "center", paddingTop: "20vh", color: "white" }}>
          <h1 style={{ fontSize: "40px", marginBottom: "10px" }}>ICY AR</h1>
          <p style={{ fontSize: "18px", opacity: 0.8 }}>An Augmented Reality Experience</p>
        </div>
      )}

      {/* AR HUD OVERLAY */}
      <div ref={setOverlayElement} style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none", display: isARActive ? "flex" : "none", flexDirection: "column", justifyContent: "space-between" }}>
        
        {/* Top Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "20px", width: "100%", boxSizing: "border-box" }}>
          <div style={{ color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
            Fish: {score}
          </div>
          {hasStarted && !isGameOver && (
            <div style={{ color: timeLeft <= 5 ? "#e11d48" : "white", fontSize: "28px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              00:{timeLeft.toString().padStart(2, '0')}
            </div>
          )}
          <button onClick={stopGame} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: "bold", borderRadius: "20px", border: "2px solid white", background: "#e11d48", color: "white", pointerEvents: "auto", cursor: "pointer", maxHeight: "40px" }}>
            Exit AR
          </button>
        </div>

        {/* START GAME BUTTON - Appears after entering AR, disappears when clicked */}
        {!hasStarted && !isGameOver && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "auto" }}>
            <button onClick={startGame} style={{ padding: "15px 40px", fontSize: "24px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "#10b981", color: "white", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.5)" }}>
              Start Game!
            </button>
          </div>
        )}

        {/* GAME OVER SCREEN */}
        {isGameOver && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", zIndex: 50, color: "white", pointerEvents: "auto", textAlign: "center", padding: "20px" }}>
            <h1 style={{ fontSize: "45px", marginBottom: "10px", textShadow: "2px 2px 10px rgba(0,0,0,1)", color: "#10b981" }}>TIME'S UP!</h1>
            <p style={{ fontSize: "22px", marginBottom: "10px" }}>You fed ICY <b>{score}</b> fish!</p>
            <p style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "40px", color: "#60a5fa" }}>
              {getEndMessage()}
            </p>
            <button onClick={stopGame} style={{ padding: "15px 35px", fontSize: "18px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "#2B4BAA", color: "white", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.5)" }}>
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* AR ACTIVATION BUTTON */}
      {overlayElement && (
        <ARButton
          sessionInit={{ requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlayElement } }}
          onClick={() => { if (ambience.current) ambience.current.play().catch(e => console.log(e)); }}
          style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', padding: '14px 28px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', border: 'none', background: 'white', color: 'black', cursor: 'pointer', zIndex: 20 }}
        />
      )}

      {/* 3D ENGINE */}
      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <XR>
          <XRTracker onXRStart={setIsARActive} />
          {isARActive && (
            <>
              <ambientLight intensity={2} />
              {/* INSTANT SPAWN: Game is fixed 1m down and 1.5m in front of the camera start position */}
              <group position={[0, -1, -1.5]}>
                <IceFloe />
                <Penguin isGameOver={isGameOver} fishPosition={fishPosition} />
                {hasStarted && !isGameOver && <Fish position={fishPosition} onCollect={collectFish} />}
              </group>
            </>
          )}
        </XR>
      </Canvas>
    </div>
  );
}