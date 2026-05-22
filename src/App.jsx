import "./App.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  XR,
  ARButton,
  Interactive,
  useHitTest,
  useXR,
} from "@react-three/xr";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense, useMemo } from "react";
import * as THREE from "three";
 
// ==========================================
// DEVICE HELPERS
// ==========================================
const isIOSDevice = () => {
  if (typeof window === "undefined") return false;
 
  return (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1)
  );
};
 
const getRandomSpawnPosition = () => {
  const angle = Math.random() * Math.PI * 2;
  const radius = 0.5 + Math.random() * 0.6;
 
  return [
    Math.cos(angle) * radius,
    0.05,
    Math.sin(angle) * radius,
  ];
};
 
// ==========================================
// MODEL PRELOADS
// ==========================================
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/ice_floe.glb");
 
// ==========================================
// SHARED MODELS
// ==========================================
function IceFloe({ iosMode = false }) {
  const ice = useGLTF("/models/ice_floe.glb");
 
  return (
<primitive
      object={ice.scene}
      scale={iosMode ? 0.045 : 0.035}
      position={[0, -0.01, 0]}
    />
  );
}
 
function Penguin({ iosMode = false }) {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(penguin.animations, group);
 
  useEffect(() => {
    if (names && names.length > 0) {
      const activeAction = actions[names[0]];
      if (activeAction) {
        activeAction.reset().fadeIn(0.25).play();
      }
    }
  }, [actions, names]);
 
  return (
<primitive
      ref={group}
      object={penguin.scene}
      scale={iosMode ? 0.5 : 0.4}
      position={[0, 0, 0]}
    />
  );
}
 
// ==========================================
// ANDROID WEBXR TRACKER
// ==========================================
function XRTracker({ onXRStart }) {
  const { isPresenting } = useXR();
 
  useEffect(() => {
    onXRStart(isPresenting);
  }, [isPresenting, onXRStart]);
 
  return null;
}
 
// ==========================================
// ANDROID WEBXR RETICLE
// ==========================================
function Reticle({ onPlace }) {
  const reticleRef = useRef();
  const { camera } = useThree();
 
  useHitTest((hitMatrix, hit) => {
    if (hit && reticleRef.current) {
      hitMatrix.decompose(
        reticleRef.current.position,
        reticleRef.current.quaternion,
        reticleRef.current.scale
      );
    }
  });
 
  return (
<Interactive
      onSelect={() => {
        if (!reticleRef.current) return;
 
        const spawnPos = reticleRef.current.position.clone();
 
        const dirX = spawnPos.x - camera.position.x;
        const dirZ = spawnPos.z - camera.position.z;
        const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);
 
        if (distance > 0 && distance < 1.4) {
          const push = 1.4 - distance;
          spawnPos.x += (dirX / distance) * push;
          spawnPos.z += (dirZ / distance) * push;
        }
 
        onPlace(spawnPos);
      }}
>
<mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]}>
<ringGeometry args={[0.15, 0.2, 32]} />
<meshStandardMaterial color="white" />
</mesh>
</Interactive>
  );
}
 
// ==========================================
// ANDROID WEBXR FISH
// ==========================================
function AndroidFish({ position, onCollect }) {
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
<primitive object={fish.scene} scale={0.0015} position={[0, 0.05, 0]} />
</group>
</Interactive>
  );
}
 
// ==========================================
// IOS / FALLBACK CLICKABLE FISH
// ==========================================
function IOSFish({ position, onCollect }) {
  const ref = useRef();
  const fish = useGLTF("/models/fish.glb");
 
  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.03;
      ref.current.position.y =
        position[1] + Math.sin(Date.now() * 0.003) * 0.03;
    }
  });
 
  return (
<group
      ref={ref}
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onCollect();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onCollect();
      }}
>
<primitive object={fish.scene} scale={0.0022} position={[0, 0.05, 0]} />
</group>
  );
}
 
// ==========================================
// IOS CAMERA BACKGROUND
// ==========================================
function IOSCameraBackground({ isActive, onReady, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
 
  useEffect(() => {
    if (!isActive) return;
 
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
 
        streamRef.current = stream;
 
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", true);
          videoRef.current.setAttribute("webkit-playsinline", true);
          await videoRef.current.play();
          onReady();
        }
      } catch (error) {
        console.error("Camera error:", error);
        onError();
      }
    };
 
    startCamera();
 
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isActive, onReady, onError]);
 
  if (!isActive) return null;
 
  return (
<video
      ref={videoRef}
      muted
      playsInline
      autoPlay
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: 0,
        background: "black",
      }}
    />
  );
}
 
// ==========================================
// IOS GAME SCENE
// ==========================================
function IOSGameScene({
  gameStarted,
  fishPosition,
  collectFish,
  isGameOver,
}) {
  return (
<>
<ambientLight intensity={2.2} />
<directionalLight position={[0, 4, 3]} intensity={2} />
 
      {gameStarted && (
<Suspense fallback={null}>
<group position={[0, -0.75, -2.4]} rotation={[0, 0, 0]}>
<IceFloe iosMode />
<Penguin iosMode />
            {!isGameOver && (
<IOSFish position={fishPosition} onCollect={collectFish} />
            )}
</group>
</Suspense>
      )}
</>
  );
}
 
// ==========================================
// MAIN APP
// ==========================================
export default function App() {
  const [overlayElement, setOverlayElement] = useState(null);
 
  const [isIOS, setIsIOS] = useState(false);
  const [webXRSupported, setWebXRSupported] = useState(false);
  const [supportChecked, setSupportChecked] = useState(false);
 
  const [mode, setMode] = useState("intro");
  // mode:
  // intro
  // android-webxr
  // ios-camera
 
  const [isXRPresenting, setIsXRPresenting] = useState(false);
  const [iosCameraReady, setIOSCameraReady] = useState(false);
  const [iosCameraError, setIOSCameraError] = useState(false);
 
  const [gamePosition, setGamePosition] = useState(null);
  const [fishPosition, setFishPosition] = useState([0.4, 0.05, 0.4]);
 
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isGameOver, setIsGameOver] = useState(false);
 
  const ambience = useRef(null);
  const collect = useRef(null);
  const footsteps = useRef(null);
  const penguinChirp = useRef(null);
 
  const gameIsActive = useMemo(() => {
    if (mode === "android-webxr") {
      return isXRPresenting;
    }
 
    if (mode === "ios-camera") {
      return iosCameraReady;
    }
 
    return false;
  }, [mode, isXRPresenting, iosCameraReady]);
 
  // ==========================================
  // CHECK PLATFORM SUPPORT
  // ==========================================
  useEffect(() => {
    const checkSupport = async () => {
      const ios = isIOSDevice();
      setIsIOS(ios);
 
      if (
        typeof navigator !== "undefined" &&
        navigator.xr &&
        !ios
      ) {
        try {
          const supported = await navigator.xr.isSessionSupported(
            "immersive-ar"
          );
          setWebXRSupported(supported);
        } catch (error) {
          console.error("WebXR check failed:", error);
          setWebXRSupported(false);
        }
      } else {
        setWebXRSupported(false);
      }
 
      setSupportChecked(true);
    };
 
    checkSupport();
  }, []);
 
  // ==========================================
  // AUDIO SETUP
  // ==========================================
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
      if (collect.current) collect.current.pause();
      if (footsteps.current) footsteps.current.pause();
      if (penguinChirp.current) penguinChirp.current.pause();
    };
  }, []);
 
  // ==========================================
  // TIMER
  // ==========================================
  useEffect(() => {
    let timer;
 
    const hasPlacedGame =
      mode === "android-webxr"
        ? Boolean(gamePosition)
        : mode === "ios-camera" && iosCameraReady;
 
    if (hasPlacedGame && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
 
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch((e) => console.log(e));
      }
    }
 
    return () => clearInterval(timer);
  }, [
    mode,
    gamePosition,
    iosCameraReady,
    timeLeft,
    isGameOver,
  ]);
 
  // ==========================================
  // GAME ACTIONS
  // ==========================================
  const playAmbience = () => {
    if (ambience.current) {
      ambience.current.play().catch((e) => console.log(e));
    }
  };
 
  const collectFish = () => {
    if (isGameOver) return;
 
    if (
      typeof window !== "undefined" &&
      window.navigator &&
      window.navigator.vibrate
    ) {
      window.navigator.vibrate(50);
    }
 
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
 
  const startIOSGame = () => {
    resetGameStateOnly();
    setMode("ios-camera");
    playAmbience();
  };
 
  const resetGameStateOnly = () => {
    setScore(0);
    setTimeLeft(30);
    setIsGameOver(false);
    setGamePosition(null);
    setFishPosition(getRandomSpawnPosition());
    setIOSCameraReady(false);
    setIOSCameraError(false);
  };
 
  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
 
    resetGameStateOnly();
    setMode("intro");
    setIsXRPresenting(false);
  };
 
  const playAgain = () => {
    if (mode === "ios-camera") {
      setScore(0);
      setTimeLeft(30);
      setIsGameOver(false);
      setFishPosition(getRandomSpawnPosition());
      playAmbience();
    } else {
      setScore(0);
      setTimeLeft(30);
      setIsGameOver(false);
      setGamePosition(null);
      setFishPosition(getRandomSpawnPosition());
      playAmbience();
    }
  };
 
  const getEndMessage = () => {
    if (score === 0) return "ICY is sad and starving! 😭";
    if (score <= 3) return "ICY survived, but is still hungry! 🐟";
    if (score <= 7) return "ICY is well-fed and happy! 🐧";
    return "ICY is stuffed and ready to dance! 🎉";
  };
 
  // ==========================================
  // UI FLAGS
  // ==========================================
  const showIntro = mode === "intro" && !isXRPresenting;
  const showHUD = gameIsActive || mode === "ios-camera";
  const androidCanUseWebXR =
    supportChecked && webXRSupported && !isIOS;
 
  const shouldUseIOSFallback =
    supportChecked && (isIOS || !webXRSupported);
 
  // ==========================================
  // RENDER
  // ==========================================
  return (
<div
      style={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#0b0f19",
        touchAction: "none",
      }}
>
      {/* IOS CAMERA BACKGROUND */}
<IOSCameraBackground
        isActive={mode === "ios-camera"}
        onReady={() => setIOSCameraReady(true)}
        onError={() => setIOSCameraError(true)}
      />
 
      {/* INTRO PAGE */}
      {showIntro && (
<div
          style={{
            position: "absolute",
            zIndex: 5,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            padding: "24px",
            boxSizing: "border-box",
            textAlign: "center",
          }}
>
<h1
            style={{
              fontSize: "44px",
              marginBottom: "10px",
              lineHeight: 1,
            }}
>
            ICY AR
</h1>
 
          <p
            style={{
              fontSize: "18px",
              opacity: 0.85,
              marginBottom: "28px",
            }}
>
            An Augmented Reality Experience
</p>
 
          {!supportChecked && (
<p style={{ opacity: 0.8 }}>Checking AR support...</p>
          )}
 
          {shouldUseIOSFallback && (
<>
<p
                style={{
                  maxWidth: "320px",
                  fontSize: "15px",
                  opacity: 0.85,
                  marginBottom: "24px",
                }}
>
                Your device will use camera play mode. Move your phone and tap
                the fish to feed ICY.
</p>
 
              <button
                onClick={startIOSGame}
                style={{
                  padding: "15px 32px",
                  fontSize: "17px",
                  fontWeight: "bold",
                  borderRadius: "30px",
                  border: "none",
                  background: "white",
                  color: "#0b0f19",
                  cursor: "pointer",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
                }}
>
                Start AR Game
</button>
</>
          )}
 
          {supportChecked && !webXRSupported && !isIOS && (
<p
              style={{
                marginTop: "18px",
                maxWidth: "320px",
                color: "#facc15",
                fontSize: "14px",
              }}
>
              WebXR is not available on this browser, so camera play mode is
              used instead.
</p>
          )}
 
          {iosCameraError && (
<p
              style={{
                marginTop: "20px",
                color: "#fca5a5",
                maxWidth: "320px",
              }}
>
              Camera permission was blocked. Please allow camera access and try
              again.
</p>
          )}
</div>
      )}
 
      {/* HUD OVERLAY */}
<div
        ref={setOverlayElement}
        style={{
          position: "absolute",
          zIndex: 10,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          display: showHUD ? "flex" : "none",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
>
<div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
            padding: "20px",
            width: "100%",
            boxSizing: "border-box",
            alignItems: "flex-start",
          }}
>
<div
            style={{
              color: "white",
              fontSize: "24px",
              fontWeight: "bold",
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
            }}
>
            Fish: {score}
</div>
 
          {!isGameOver && (
<div
              style={{
                color: timeLeft <= 5 ? "#e11d48" : "white",
                fontSize: "28px",
                fontWeight: "bold",
                textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
              }}
>
              00:{timeLeft.toString().padStart(2, "0")}
</div>
          )}
 
          <button
            onClick={stopGame}
            style={{
              padding: "10px 18px",
              fontSize: "14px",
              fontWeight: "bold",
              borderRadius: "20px",
              border: "2px solid white",
              background: "#e11d48",
              color: "white",
              pointerEvents: "auto",
              cursor: "pointer",
              maxHeight: "42px",
            }}
>
            Exit
</button>
</div>
 
        {mode === "android-webxr" && isXRPresenting && !gamePosition && (
<div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              background: "rgba(0,0,0,0.55)",
              padding: "12px 22px",
              borderRadius: "12px",
              maxWidth: "300px",
            }}
>
            Scan the floor and tap the ring to place ICY!
</div>
        )}
 
        {mode === "ios-camera" && !iosCameraReady && !iosCameraError && (
<div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              background: "rgba(0,0,0,0.65)",
              padding: "12px 22px",
              borderRadius: "12px",
              maxWidth: "300px",
            }}
>
            Opening camera...
</div>
        )}
 
        {mode === "ios-camera" && iosCameraReady && !isGameOver && (
<div
            style={{
              position: "absolute",
              bottom: "35px",
              left: "50%",
              transform: "translateX(-50%)",
              color: "white",
              fontSize: "16px",
              fontWeight: "bold",
              textAlign: "center",
              background: "rgba(0,0,0,0.45)",
              padding: "10px 18px",
              borderRadius: "24px",
            }}
>
            Tap the fish to feed ICY!
</div>
        )}
 
        {isGameOver && (
<div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.85)",
              zIndex: 50,
              color: "white",
              textAlign: "center",
              padding: "20px",
              pointerEvents: "auto",
            }}
>
<h1
              style={{
                fontSize: "45px",
                marginBottom: "10px",
                textShadow: "2px 2px 10px rgba(0,0,0,1)",
                color: "#10b981",
              }}
>
              TIME&apos;S UP!
</h1>
 
            <p style={{ fontSize: "22px", marginBottom: "10px" }}>
              You fed ICY <b>{score}</b> fish!
</p>
 
            <p
              style={{
                fontSize: "20px",
                fontWeight: "bold",
                marginBottom: "35px",
                color: "#60a5fa",
              }}
>
              {getEndMessage()}
</p>
 
            <button
              onClick={playAgain}
              style={{
                padding: "15px 35px",
                fontSize: "18px",
                fontWeight: "bold",
                borderRadius: "30px",
                border: "none",
                background: "#2B4BAA",
                color: "white",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
              }}
>
              Play Again
</button>
</div>
        )}
</div>
 
      {/* ANDROID WEBXR START BUTTON */}
      {androidCanUseWebXR && overlayElement && (
<ARButton
          sessionInit={{
            requiredFeatures: ["hit-test"],
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: overlayElement },
          }}
          onClick={() => {
            setMode("android-webxr");
            resetGameStateOnly();
            playAmbience();
          }}
          style={{
            position: "absolute",
            bottom: "40px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "14px 28px",
            fontSize: "16px",
            fontWeight: "bold",
            borderRadius: "30px",
            border: "none",
            background: "white",
            color: "black",
            cursor: "pointer",
            zIndex: 20,
          }}
        />
      )}
 
      {/* 3D CANVAS */}
<Canvas
        camera={{
          position: [0, 0, 0],
          fov: 60,
          near: 0.01,
          far: 100,
        }}
        gl={{
          alpha: true,
          antialias: true,
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 2,
          pointerEvents: mode === "ios-camera" ? "auto" : "none",
          background: "transparent",
        }}
>
        {/* ANDROID WEBXR SCENE */}
        {mode === "android-webxr" && (
<XR>
<XRTracker onXRStart={setIsXRPresenting} />
 
            {isXRPresenting && (
<>
<ambientLight intensity={2} />
 
                {!gamePosition ? (
<Reticle onPlace={setGamePosition} />
                ) : (
<Suspense fallback={null}>
<group position={gamePosition}>
<IceFloe />
<Penguin />
                      {!isGameOver && (
<AndroidFish
                          position={fishPosition}
                          onCollect={collectFish}
                        />
                      )}
</group>
</Suspense>
                )}
</>
            )}
</XR>
        )}
 
        {/* IOS / FALLBACK CAMERA GAME SCENE */}
        {mode === "ios-camera" && (
<IOSGameScene
            gameStarted={iosCameraReady}
            fishPosition={fishPosition}
            collectFish={collectFish}
            isGameOver={isGameOver}
          />
        )}
</Canvas>
</div>
  );
}