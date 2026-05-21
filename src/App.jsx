import "./App.css";

import { Canvas, useFrame } from "@react-three/fiber";
import { XR, ARButton } from "@react-three/xr";
import { useGLTF } from "@react-three/drei";
import { useRef, useEffect } from "react";

function Penguin() {

  const group = useRef();

  const penguin = useGLTF("/models/penguin.glb");

  useFrame((state) => {

    if (group.current) {

      // group.current.position.x =
        // Math.sin(state.clock.elapsedTime) * 0.5;

      group.current.rotation.y =
        Math.sin(state.clock.elapsedTime) * 0.5;
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
    <mesh
      ref={ref}
      position={[0.5, -1, -1.5]}
      onPointerDown={(e) => {
        e.stopPropagation();
        console.log("Fish collected!");
        onCollect();
      }}
    >
      <boxGeometry args={[0.25, 0.25, 0.25]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}

export default function App() {

  const ambience = useRef(null);
  const collect = useRef(null);
  const footsteps = useRef(null);

  useEffect(() => {

    ambience.current = new Audio(
      "/audios/antarctic_ambience.mp3"
    );

    collect.current = new Audio(
      "/audios/fish_collect.mp3"
    );

    footsteps.current = new Audio(
      "/audios/snow_footsteps.mp3"
    );

    ambience.current.loop = true;
    ambience.current.volume = 0.3;

    footsteps.current.loop = true;
    footsteps.current.volume = 0.2;

  }, []);

  const collectFish = () => {

    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play();
    }

    if (footsteps.current) {
      footsteps.current.play();
    }
  };

  return (
    <>

      <ARButton
        sessionInit={{
          requiredFeatures: ["hit-test"],
        }}
        onClick={() => {

          if (ambience.current) {
            ambience.current.play();
          }
        }}
      />

      <button
        onPointerDown={() => window.location.reload()}
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          padding: "12px 20px",
          fontSize: "18px",
          borderRadius: "12px",
          border: "none",
          background: "rgba(255,255,255,0.8)"
        }}
      >
        Exit AR
      </button>

      <Canvas>

        <XR>

          <ambientLight intensity={2} />

          <Penguin />

          <Fish onCollect={collectFish} />

        </XR>

      </Canvas>

    </>
  );
}