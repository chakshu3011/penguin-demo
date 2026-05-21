import "./App.css";
import * as THREE from "three"; 
import { Canvas, useFrame } from "@react-three/fiber";
import { XR, ARButton, Interactive } from "@react-three/xr";
import { useGLTF, ContactShadows, Sparkles } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";

// ==========================================
// MATH HELPER: WIDE SPAWN RADIUS
// ==========================================
const getRandomSpawnPosition = () => {
  const angle = Math.random() * Math.PI * 2; 
  // Pushed back to a wide 1.5 meter radius so they spread out!
  const radius = 0.5 + Math.random() * 1.5; 
  return [Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius];
};

// ==========================================
// GAME COMPONENTS 
// ==========================================
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb"); 
useGLTF.preload("/models/ice_floe.glb"); 

function IceFloe() {
  const ice = useGLTF("/models/ice_floe.glb");
  return (
    <primitive 
      object={ice.scene} 
      scale={0.01} 
      position={[0, -0.02, 0]} // Sits just slightly above the infinite ice floor
    />
  );
}

function Penguin({ targetPosition }) {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");

  useFrame((state) => {
    if (!group.current) return;

    const currentPos = group.current.position;
    const target = new THREE.Vector3(targetPosition[0], 0, targetPosition[2]); 
    const distance = currentPos.distanceTo(target);

    if (distance > 0.15) {
      group.current.lookAt(target);
      currentPos.lerp(target, 0.03);
      group.current.rotation.z = Math.sin(state.clock.elapsedTime * 15) * 0.2;
      group.current.scale.y = 0.5; 
    } else {
      group.current.rotation.z = 0;
      group.current.scale.y = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.015; 
    }
  });

  return (
    <primitive ref={group} object={penguin.scene} scale={0.5} position={[0, 0, 0]} />
  );
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
  const [overlayElement, setOverlayElement] = useState(null);
  
  // Game States
  const [gameStarted, setGameStarted] = useState(false);
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
    penguinChirp.current.volume = 0.8;

    return () => {
      if (ambience.current) ambience.current.pause();
      if (footsteps.current) footsteps.current.pause();
    };
  }, []);

  // Timer Engine
  useEffect(() => {
    let timer;
    if (gameStarted && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
    }
    return () => clearInterval(timer);
  }, [gameStarted, timeLeft, isGameOver]);

  const collectFish = () => {
    if (isGameOver) return; 

    // We calculate the new score first
    const newScore = score + 1;
    setScore(newScore);
    
    // Play standard collect/footstep sounds every time
    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch((e) => console.log(e));
    }
    if (footsteps.current) {
      footsteps.current.currentTime = 0;
      footsteps.current.play().catch((e) => console.log(e));
    }

    // <-- THE COMBO LOGIC -->
    // The % (modulo) operator checks if the score is perfectly divisible by 5
    if (newScore % 5 === 0) {
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch((e) => console.log(e));
      }
    }
    // <--------------------->

    setFishPosition(getRandomSpawnPosition());
  };

  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
    if (penguinChirp.current) penguinChirp.current.pause();
    window.location.reload();
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#1a1a2e" }}>
      
      <div ref={setOverlayElement} style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        
        {/* HUD */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "20px", width: "100%", boxSizing: "border-box" }}>
          <div style={{ color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
            Fish: {score}
          </div>

          {gameStarted && !isGameOver && (
            <div style={{ color: timeLeft <= 5 ? "#e11d48" : "white", fontSize: "28px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              00:{timeLeft.toString().padStart(2, '0')}
            </div>
          )}

          <button
            onClick={stopGame}
            style={{ padding: "10px 20px", fontSize: "14px", fontWeight: "bold", borderRadius: "20px", border: "2px solid white", background: "#e11d48", color: "white", pointerEvents: "auto", cursor: "pointer", maxHeight: "40px" }}
          >
            Exit AR
          </button>
        </div>

        {/* START SCREEN */}
        {!gameStarted && !isGameOver && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 30, pointerEvents: "auto" }}>
            <button 
              onClick={() => setGameStarted(true)}
              style={{ padding: "20px 40px", fontSize: "24px", fontWeight: "bold", borderRadius: "40px", border: "none", background: "#10b981", color: "white", cursor: "pointer", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}
            >
              Start Game!
            </button>
          </div>
        )}

        {/* GAME OVER SCREEN */}
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
            // Removed hit-test entirely!
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: overlayElement } 
          }}
          onClick={() => {
            if (ambience.current) ambience.current.play().catch(e => console.log(e));
          }}
          style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', padding: '14px 28px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', border: 'none', background: 'white', color: 'black', cursor: 'pointer', zIndex: 20 }}
        />
      )}

      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <XR>
          <ambientLight intensity={2} />
          
          <Suspense fallback={null}>
            {/* This group puts the entire game 1 meter below eye level, 
              and 1.5 meters in front of the camera. It floats with you!
            */}
            <group position={[0, -1, -1.5]}>
              
              {/* THE INFINITE ICE FLOOR */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
                <circleGeometry args={[10, 64]} />
                <meshStandardMaterial color="#a0d8ef" transparent opacity={0.6} />
              </mesh>

              {/* MASSIVE BLIZZARD (Scaled up to cover the big floor) */}
              <Sparkles count={150} scale={8} size={3} speed={0.4} opacity={0.8} color="white" position={[0, 2, 0]} />
              
              <ContactShadows position={[0, -0.01, 0]} opacity={0.6} scale={4} blur={2} far={1} />

              <IceFloe />
              
              <Penguin targetPosition={fishPosition} />
              
              {gameStarted && !isGameOver && (
                <Fish position={fishPosition} onCollect={collectFish} />
              )}
            </group>
          </Suspense>

        </XR>
      </Canvas>
    </div>
  );
}