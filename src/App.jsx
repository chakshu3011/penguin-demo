import "./App.css";
import { Canvas, useFrame } from "@react-three/fiber";
import { XR, ARButton, Interactive } from "@react-three/xr";
import { useGLTF } from "@react-three/drei";
import { useRef, useEffect, useState } from "react";

function Penguin() {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");

  useFrame((state) => {
    if (group.current) {
      // Gives the penguin a gentle rotation idle animation
      group.current.rotation.y = Math.sin(state.clock.elapsedTime) * 0.5;
    }
  });

  return (
    <primitive
      ref={group}
      object={penguin.scene}
      scale={0.5}
      position={[0, -1.4, -1.5]}
    />
  );
}

function Fish({ onCollect }) {
  const ref = useRef();

  useFrame(() => {
    if (ref.current) {
      // Spins the fish box continuously
      ref.current.rotation.y += 0.02;
    }
  });

  return (
    // <Interactive> enables mobile AR raycast tapping
    <Interactive onSelect={onCollect}>
      <mesh ref={ref} position={[0.5, -1, -1.5]}>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
        <meshStandardMaterial color="orange" />
      </mesh>
    </Interactive>
  );
}

export default function App() {
  const [score, setScore] = useState(0);

  const ambience = useRef(null);
  const collect = useRef(null);

  useEffect(() => {
    ambience.current = new Audio("/audios/antarctic_ambience.mp3");
    ambience.current.loop = true;
    ambience.current.volume = 0.3;

    collect.current = new Audio("/audios/fish_collect.mp3");

    // Cleanup prevents multiple invisible audio tracks from overlapping
    return () => {
      if (ambience.current) {
        ambience.current.pause();
        ambience.current = null;
      }
    };
  }, []);

  const collectFish = () => {
    setScore((s) => s + 1);
    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch((e) => console.log(e));
    }
  };

  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
    window.location.reload();
  };

  return (
    // 1. FULL SCREEN WRAPPER: Forces the canvas to render properly
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#1a1a2e" }}>
      
      {/* 2. DOM OVERLAY ROOT: The UI layer that WebXR places over the camera */}
      <div id="ar-ui-overlay" style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none" }}>
        
        {/* Score Board - Top Left */}
        <div style={{ position: "absolute", top: "30px", left: "20px", color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
          Fish: {score}
        </div>

        {/* Exit Button - Moved to Top Right so it never collides with Enter AR */}
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

      {/* 3. AR ACTIVATION BUTTON */}
      <ARButton
        sessionInit={{
          requiredFeatures: ["hit-test"],
          domOverlay: { root: document.getElementById("ar-ui-overlay") } 
        }}
        onClick={() => {
          if (ambience.current) {
            ambience.current.play().catch(e => console.log("Audio block:", e));
          }
        }}
        // Custom styling overrides the default ugly gray button
        style={{
          position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
          padding: '14px 28px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px',
          border: 'none', background: 'white', color: 'black', cursor: 'pointer', zIndex: 20
        }}
      />

      {/* 4. 3D ENGINE CANVAS */}
      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <XR>
          <ambientLight intensity={2} />
          <Penguin />
          <Fish onCollect={collectFish} />
        </XR>
      </Canvas>

    </div>
  );
}