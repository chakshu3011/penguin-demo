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
      ref.current.rotation.y += 0.02;
    }
  });

  return (
    // <Interactive> translates mobile AR screen taps into reliable selection events
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
  
  // Audio Refs
  const ambience = useRef(null);
  const collect = useRef(null);

  useEffect(() => {
    // Initialize audio only once
    ambience.current = new Audio("/audios/antarctic_ambience.mp3");
    ambience.current.loop = true;
    ambience.current.volume = 0.3;

    collect.current = new Audio("/audios/fish_collect.mp3");

    // CLEANUP: Prevents multiple audio tracks from looping infinitely if the component remounts
    return () => {
      if (ambience.current) {
        ambience.current.pause();
        ambience.current = null;
      }
    };
  }, []);

  const collectFish = () => {
    console.log("Fish Collected!");
    
    // Add point
    setScore((prevScore) => prevScore + 1);

    // Play collect sound
    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch(e => console.log("Audio play error", e));
    }
  };

  const stopGame = () => {
    if (ambience.current) {
      ambience.current.pause();
    }
    window.location.reload();
  };

  return (
    <>
      {/* DOM OVERLAY ROOT: This div holds your UI. WebXR will pull this over the camera feed. */}
      <div id="ar-ui-overlay" style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none" }}>
        
        {/* Score Board */}
        <div style={{ position: "absolute", top: "40px", left: "20px", color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
          Fish Collected: {score}
        </div>

        {/* Exit Button */}
        <button
          onClick={stopGame}
          style={{
            position: "absolute", bottom: "40px", left: "50%", transform: "translateX(-50%)",
            padding: "12px 24px", fontSize: "16px", fontWeight: "bold", borderRadius: "30px",
            border: "2px solid white", background: "#2B4BAA", color: "white", pointerEvents: "auto", cursor: "pointer"
          }}
        >
          Exit AR Game
        </button>
      </div>

      <ARButton
        sessionInit={{
          requiredFeatures: ["hit-test"],
          // CRITICAL: Tells WebXR to render the div above as a 2D interface over the camera
          domOverlay: { root: document.getElementById("ar-ui-overlay") } 
        }}
        onClick={() => {
          if (ambience.current) {
            ambience.current.play().catch(e => console.log("Ambience block:", e));
          }
        }}
      />

      <Canvas>
        <XR>
          <ambientLight intensity={2} />
          <Penguin />
          {/* We pass the collectFish function down to the Fish component */}
          <Fish onCollect={collectFish} />
        </XR>
      </Canvas>
    </>
  );
}