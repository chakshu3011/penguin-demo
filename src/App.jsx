import "./App.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { XR, ARButton, Interactive, useHitTest, useXR } from "@react-three/xr";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";
import * as THREE from "three";

function XRTracker({ onXRStart }) {
  const { isPresenting } = useXR();
  useEffect(() => {
    onXRStart(isPresenting);
  }, [isPresenting, onXRStart]);
  return null;
}

const getRandomSpawnPosition = () => {
  const angle = Math.random() * Math.PI * 2;
  const radius = 0.5 + Math.random() * 0.7;
  return [Math.cos(angle) * radius, 0.15, Math.sin(angle) * radius];
};

// ==========================================
// 1. SNOW PARTICLE SYSTEM
// ==========================================
function IceParticles({ trigger }) {
  const pointsRef = useRef();
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!trigger.id) return;
    
    // Create a burst of 15 ice shards at the fish's collection site
    const count = 15;
    const temp = [];
    for (let i = 0; i < count; i++) {
      temp.push({
        pos: [...trigger.pos],
        vel: [
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.6 + 0.2, // Upward burst velocity
          (Math.random() - 0.5) * 0.5
        ],
        life: 1.0 // Lifespan multiplier
      });
    }
    setParticles(temp);
  }, [trigger]);

  useFrame((state, delta) => {
    if (!pointsRef.current || particles.length === 0) return;

    const positions = [];
    const updated = particles
      .map((p) => {
        p.pos[0] += p.vel[0] * delta;
        p.pos[1] += p.vel[1] * delta;
        p.pos[2] += p.vel[2] * delta;
        p.vel[1] -= 0.98 * delta; // Simulated gravity pulling shards down
        p.life -= delta * 2.0;
        return p;
      })
      .filter((p) => p.life > 0);

    if (updated.length !== particles.length) {
      setParticles(updated);
    }

    updated.forEach((p) => positions.push(...p.pos));
    pointsRef.current.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
  });

  if (particles.length === 0) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry />
      <pointsMaterial color="#e0f2fe" size={0.04} transparent opacity={0.8} />
    </points>
  );
}

// ==========================================
// 2. RETICLE TARGET
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
      const dx = spawnPos.x - camera.position.x;
      const dz = spawnPos.z - camera.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Strict pushback to place the entire model forward into view
      const targetDistance = 1.6;
      if (distance < targetDistance) {
        const push = targetDistance - distance;
        spawnPos.x += (dx / distance) * push;
        spawnPos.z += (dz / distance) * push;
      }
      onPlace(spawnPos);
    }}>
      <mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.2, 32]} />
        <meshStandardMaterial color="#38bdf8" />
      </mesh>
    </Interactive>
  );
}

// ==========================================
// 3. ENVIRONMENT & MODELS
// ==========================================
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/ice_floe.glb");

function IceFloe() {
  const ice = useGLTF("/models/ice_floe.glb");
  return (
    <primitive 
      object={ice.scene} 
      scale={0.004} // CRITICAL FIX: Shrunk to 0.004 so the igloos and hills fall directly into camera range
      position={[0, -0.02, -0.2]} // Slipped slightly forward and down
    />
  );
}

function Penguin() {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(penguin.animations, group);

  useEffect(() => {
    if (names && names.length > 0) {
      // Plays the first active track found inside the skeleton file
      const activeAction = actions[names[0]];
      activeAction.reset().fadeIn(0.3).play();
    }
  }, [actions, names]);

  return <primitive ref={group} object={penguin.scene} scale={0.4} position={[0, 0, 0]} />;
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
        <primitive object={fish.scene} scale={0.004} position={[0, 0.1, 0]} />
      </group>
    </Interactive>
  );
}

// ==========================================
// 4. MAIN GAME ENGINE
// ==========================================
export default function App() {
  const [isARActive, setIsARActive] = useState(false);
  const [overlayElement, setOverlayElement] = useState(null);
  const [gamePosition, setGamePosition] = useState(null);
  const [fishPosition, setFishPosition] = useState([0.4, 0.2, -0.3]);
  const [particleTrigger, setParticleTrigger] = useState({ id: null, pos: [0, 0, 0] });
  
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
    ambience.current.volume = 0.25;

    collect.current = new Audio("/audios/fish_collect.mp3");
    footsteps.current = new Audio("/audios/snow_footsteps.mp3");
    footsteps.current.volume = 0.4;

    penguinChirp.current = new Audio("/audios/baby_penguin.mp3");
    penguinChirp.current.volume = 0.9;

    return () => {
      if (ambience.current) ambience.current.pause();
      if (footsteps.current) footsteps.current.pause();
      if (penguinChirp.current) penguinChirp.current.pause();
    };
  }, []);

  useEffect(() => {
    let timer;
    if (gamePosition && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch((e) => console.log(e));
      }
    }
    return () => clearInterval(timer);
  }, [gamePosition, timeLeft, isGameOver]);

  const collectFish = () => {
    if (isGameOver) return;

    // Trigger haptic rumble immediately on tap
    if (navigator.vibrate) {
      navigator.vibrate(40);
    }

    // Trigger particle burst at the current fish position
    setParticleTrigger({ id: Date.now(), pos: [...fishPosition] });

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

  const getEndMessage = () => {
    if (score === 0) return "ICY is sad and starving! 😭";
    if (score <= 3) return "ICY survived, but is still hungry! 🐟";
    if (score <= 7) return "ICY is well-fed and happy! 🐧";
    return "ICY is stuffed and ready to dance! 🎉";
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#060913" }}>
      
      {!isARActive && (
        <div style={{ position: "absolute", zIndex: 5, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "25vh", color: "white", fontFamily: "sans-serif" }}>
          <h1 style={{ fontSize: "42px", letterSpacing: "2px", marginBottom: "5px" }}>ICY AR</h1>
          <p style={{ fontSize: "16px", opacity: 0.7 }}>Antarctic Research Portal</p>
        </div>
      )}

      <div ref={setOverlayElement} style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none", display: isARActive ? "flex" : "none", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "20px", width: "100%", boxSizing: "border-box" }}>
          <div style={{ color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
            Fish: {score}
          </div>
          {gamePosition && !isGameOver && (
            <div style={{ color: timeLeft <= 5 ? "#ef4444" : "white", fontSize: "28px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              00:{timeLeft.toString().padStart(2, '0')}
            </div>
          )}
          <button onClick={stopGame} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: "bold", borderRadius: "20px", border: "none", background: "#ef4444", color: "white", pointerEvents: "auto", cursor: "pointer" }}>
            Exit AR
          </button>
        </div>

        {!gamePosition && (
          <div style={{ position: "absolute", top: "45%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: "16px", fontWeight: "bold", textAlign: "center", background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.2)", padding: "14px 24px", borderRadius: "30px", width: "80%" }}>
            Scan floor & tap target to drop the Ice Floe!
          </div>
        )}

        {isGameOver && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.9)", zIndex: 50, color: "white", textAlign: "center", padding: "25px" }}>
            <h1 style={{ fontSize: "40px", color: "#10b981", margin: "0 0 10px 0" }}>TIME'S UP!</h1>
            <p style={{ fontSize: "22px", margin: "0 0 15px 0" }}>You brought ICY <b>{score}</b> fish!</p>
            <p style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "40px", color: "#38bdf8" }}>{getEndMessage()}</p>
            <button onClick={stopGame} style={{ padding: "14px 40px", fontSize: "16px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "#0284c7", color: "white", pointerEvents: "auto", cursor: "pointer" }}>
              Reset Mission
            </button>
          </div>
        )}
      </div>

      {overlayElement && (
        <ARButton
          sessionInit={{ requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlayElement } }}
          onClick={() => { if (ambience.current) ambience.current.play().catch((e) => console.log(e)); }}
          style={{ position: 'absolute', bottom: '50px', left: '50%', transform: 'translateX(-50%)', padding: '16px 36px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', border: "1px solid rgba(255,255,255,0.4)", background: 'rgba(15,23,42,0.8)', color: 'white', cursor: 'pointer', zIndex: 20, backdropFilter: "blur(4px)" }}
        />
      )}

      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <XR>
          <XRTracker onXRStart={setIsARActive} />
          {isARActive && (
            <>
              <ambientLight intensity={2.5} />
              {!gamePosition ? (
                <Reticle onPlace={setGamePosition} />
              ) : (
                <Suspense fallback={null}>
                  <group position={gamePosition}>
                    <IceFloe />
                    <Penguin />
                    {!isGameOver && <Fish position={fishPosition} onCollect={collectFish} />}
                    <IceParticles trigger={particleTrigger} />
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