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
import {
  useRef,
  useEffect,
  useState,
  Suspense,
  useMemo,
  useCallback,
} from "react";
import * as THREE from "three";
 
// ======================================================
// STABLE VERSION
// Android = WebXR floor AR
// iOS / unsupported Android = camera AR style game
// ======================================================
 
const GAME_TIME = 60;
const FISH_GOAL = 10;
const KRILL_GOAL = 5;
 
const GAME_SIZES = {
  android: {
    iceRadius: 2.3,
    iceModelSize: 0.8,
    penguinSize: 0.7,
    itemSize: 0.18,
    plasticSize: 0.2,
    minRadius: 0.85,
    maxRadius: 2.0,
    itemY: 0.28,
  },
  ios: {
    iceRadius: 1.35,
    iceModelSize: 0.55,
    penguinSize: 0.52,
    itemSize: 0.18,
    plasticSize: 0.2,
    minRadius: 0.5,
    maxRadius: 1.05,
    itemY: 0.22,
  },
};
 
const ITEM_CONFIG = {
  fish: {
    label: "Fish",
    icon: "🐟",
    model: "/models/fish.glb",
    color: "#38bdf8",
  },
  krill: {
    label: "Krill",
    icon: "🦐",
    model: "/models/krill_antartic.glb",
    color: "#fb7185",
  },
  plastic: {
    label: "Plastic Bottle",
    icon: "🧴",
    model: "/models/plastic_water_bottle.glb",
    color: "#facc15",
  },
};
 
// ======================================================
// HELPERS
// ======================================================
 
const isIOSDevice = () => {
  if (typeof window === "undefined") return false;
 
  return (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1)
  );
};
 
function getRandomItemType() {
  const random = Math.random();
 
  if (random < 0.45) return "fish";
  if (random < 0.82) return "krill";
  return "plastic";
}
 
function getRandomPosition(mode) {
  const s = mode === "android" ? GAME_SIZES.android : GAME_SIZES.ios;
 
  const angle = Math.random() * Math.PI * 2;
  const radius = s.minRadius + Math.random() * (s.maxRadius - s.minRadius);
 
  return [Math.cos(angle) * radius, s.itemY, Math.sin(angle) * radius];
}
 
function createTarget(mode = "android") {
  const type = getRandomItemType();
 
  return {
    id: `${type}-${Date.now()}-${Math.random()}`,
    type,
    androidPosition: getRandomPosition("android"),
    iosPosition: getRandomPosition("ios"),
  };
}
 
function lerpAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}
 
function normalizeModelToSize(scene, targetSize) {
  const clone = scene.clone(true);
 
  const box = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
 
  box.getSize(size);
  box.getCenter(center);
 
  const maxAxis = Math.max(size.x, size.y, size.z);
  const scale = maxAxis > 0 ? targetSize / maxAxis : 1;
 
  clone.position.sub(center);
  clone.scale.setScalar(scale);
 
  const group = new THREE.Group();
  group.add(clone);
 
  return group;
}
 
// ======================================================
// iOS CAMERA BACKGROUND
// ======================================================
 
function IOSCameraBackground({ active, onReady, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
 
  useEffect(() => {
    if (!active) return;
 
    let cancelled = false;
 
    async function startCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API is not available");
        }
 
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
 
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
 
        streamRef.current = stream;
 
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.setAttribute("webkit-playsinline", "true");
          videoRef.current.muted = true;
 
          await videoRef.current.play();
 
          onReady();
        }
      } catch (error) {
        console.error("Camera error:", error);
        onError(error);
      }
    }
 
    startCamera();
 
    return () => {
      cancelled = true;
 
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [active, onReady, onError]);
 
  if (!active) return null;
 
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
        zIndex: 1,
        background: "black",
      }}
    />
  );
}
 
// ======================================================
// 3D PARTS
// ======================================================
 
function IceGround({ mode }) {
  const s = mode === "android" ? GAME_SIZES.android : GAME_SIZES.ios;
 
  return (
    <group position={[0, -0.05, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[s.iceRadius, 96]} />
        <meshBasicMaterial
          color="#dff8ff"
          transparent
          opacity={0.82}
          side={THREE.DoubleSide}
        />
      </mesh>
 
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[s.iceRadius * 0.88, s.iceRadius, 96]} />
        <meshBasicMaterial
          color="#76d7ff"
          transparent
          opacity={0.9}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
 
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry args={[s.iceRadius * 0.32, s.iceRadius * 0.35, 96]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.55}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
 
function NormalizedModel({
  url,
  size,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}) {
  const gltf = useGLTF(url);
 
  const model = useMemo(() => {
    return normalizeModelToSize(gltf.scene, size);
  }, [gltf.scene, size]);
 
  return <primitive object={model} position={position} rotation={rotation} />;
}
 
function Penguin({ target, mode }) {
  const ref = useRef(null);
  const gltf = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(gltf.animations, ref);
 
  const s = mode === "android" ? GAME_SIZES.android : GAME_SIZES.ios;
 
  const model = useMemo(() => {
    return normalizeModelToSize(gltf.scene, s.penguinSize);
  }, [gltf.scene, s.penguinSize]);
 
  useEffect(() => {
    if (names && names.length > 0) {
      const action = actions[names[0]];
 
      if (action) {
        action.reset().fadeIn(0.25).play();
      }
    }
  }, [actions, names]);
 
  useFrame(() => {
    if (!ref.current || !target) return;
 
    const position =
      mode === "android" ? target.androidPosition : target.iosPosition;
 
    const [x, , z] = position;
    const desiredAngle = Math.atan2(x, z);
 
    ref.current.rotation.y = lerpAngle(
      ref.current.rotation.y,
      desiredAngle,
      0.07
    );
  });
 
  return <primitive ref={ref} object={model} position={[0, 0.03, 0]} />;
}
 
function Collectable({ target, mode, onCollect }) {
  const ref = useRef(null);
  const collectedRef = useRef(false);
 
  const config = ITEM_CONFIG[target.type];
  const gltf = useGLTF(config.model);
 
  const s = mode === "android" ? GAME_SIZES.android : GAME_SIZES.ios;
 
  const finalSize =
    target.type === "plastic" ? s.plasticSize : s.itemSize;
 
  const model = useMemo(() => {
    return normalizeModelToSize(gltf.scene, finalSize);
  }, [gltf.scene, finalSize, target.id]);
 
  const position =
    mode === "android" ? target.androidPosition : target.iosPosition;
 
  useEffect(() => {
    collectedRef.current = false;
  }, [target.id]);
 
  useFrame(() => {
    if (!ref.current) return;
 
    ref.current.position.y =
      position[1] + Math.sin(Date.now() * 0.003) * 0.035;
 
    ref.current.rotation.y += 0.02;
  });
 
  const handleCollect = useCallback(
    (event) => {
      if (event) {
        event.stopPropagation();
      }
 
      if (collectedRef.current) return;
 
      collectedRef.current = true;
      onCollect(target.type);
    },
    [onCollect, target.type]
  );
 
  const content = (
    <group ref={ref} position={position}>
      <primitive object={model} />
 
      {/* Invisible larger tap area */}
      <mesh>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
 
  if (mode === "android") {
    return <Interactive onSelect={handleCollect}>{content}</Interactive>;
  }
 
  return (
    <group
      onPointerDown={handleCollect}
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </group>
  );
}
 
// ======================================================
// ANDROID XR
// ======================================================
 
function XRTracker({ onXRStart }) {
  const { isPresenting } = useXR();
 
  useEffect(() => {
    onXRStart(isPresenting);
  }, [isPresenting, onXRStart]);
 
  return null;
}
 
function Reticle({ onPlace }) {
  const reticleRef = useRef(null);
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
 
        const spawnPosition = reticleRef.current.position.clone();
 
        const dirX = spawnPosition.x - camera.position.x;
        const dirZ = spawnPosition.z - camera.position.z;
        const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);
 
        if (distance > 0 && distance < 1.7) {
          const push = 1.7 - distance;
          spawnPosition.x += (dirX / distance) * push;
          spawnPosition.z += (dirZ / distance) * push;
        }
 
        onPlace(spawnPosition);
      }}
    >
      <mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.24, 48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
      </mesh>
    </Interactive>
  );
}
 
// ======================================================
// iOS CAMERA GAME SCENE
// ======================================================
 
function IOSGameScene({ ready, target, isGameOver, onCollect }) {
  return (
    <>
      <ambientLight intensity={2.7} />
      <directionalLight position={[0, 4, 3]} intensity={2.4} />
 
      {ready && (
        <Suspense fallback={null}>
          <group position={[0, -0.95, -2.7]}>
            <IceGround mode="ios" />
 
            <NormalizedModel
              url="/models/ice_floe.glb"
              size={GAME_SIZES.ios.iceModelSize}
              position={[0, 0.01, 0]}
            />
 
            <Penguin target={target} mode="ios" />
 
            {!isGameOver && target && (
              <Collectable
                key={target.id}
                target={target}
                mode="ios"
                onCollect={onCollect}
              />
            )}
          </group>
        </Suspense>
      )}
    </>
  );
}
 
// ======================================================
// SMALL UI
// ======================================================
 
function InfoBox({ text }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "90px",
        transform: "translateX(-50%)",
        color: "white",
        background: "rgba(0,0,0,0.62)",
        border: "1px solid rgba(255,255,255,0.25)",
        padding: "12px 18px",
        borderRadius: "18px",
        fontWeight: "800",
        textAlign: "center",
        maxWidth: "330px",
        lineHeight: 1.4,
        backdropFilter: "blur(8px)",
      }}
    >
      {text}
    </div>
  );
}
 
// ======================================================
// MAIN APP
// ======================================================
 
export default function App() {
  const [overlayElement, setOverlayElement] = useState(null);
 
  const [isIOS, setIsIOS] = useState(false);
  const [webXRSupported, setWebXRSupported] = useState(false);
  const [supportChecked, setSupportChecked] = useState(false);
 
  const [mode, setMode] = useState("intro");
  // intro | android-webxr | ios-camera
 
  const [isXRPresenting, setIsXRPresenting] = useState(false);
  const [androidGamePosition, setAndroidGamePosition] = useState(null);
 
  const [iosCameraReady, setIOSCameraReady] = useState(false);
  const [iosCameraError, setIOSCameraError] = useState(null);
 
  const [target, setTarget] = useState(() => createTarget("android"));
 
  const [fishCount, setFishCount] = useState(0);
  const [krillCount, setKrillCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [gameResult, setGameResult] = useState(null);
 
  const ambience = useRef(null);
  const collectSound = useRef(null);
  const footsteps = useRef(null);
  const penguinChirp = useRef(null);
 
  const isGameOver = Boolean(gameResult);
 
  // ======================================================
  // SUPPORT CHECK
  // ======================================================
 
  useEffect(() => {
    const checkSupport = async () => {
      const ios = isIOSDevice();
      setIsIOS(ios);
 
      if (typeof navigator !== "undefined" && navigator.xr && !ios) {
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
 
  // ======================================================
  // AUDIO
  // ======================================================
 
  useEffect(() => {
    ambience.current = new Audio("/audios/antarctic_ambience.mp3");
    ambience.current.loop = true;
    ambience.current.volume = 0.3;
 
    collectSound.current = new Audio("/audios/fish_collect.mp3");
    collectSound.current.volume = 0.8;
 
    footsteps.current = new Audio("/audios/snow_footsteps.mp3");
    footsteps.current.volume = 0.4;
 
    penguinChirp.current = new Audio("/audios/baby_penguin.mp3");
    penguinChirp.current.volume = 1.0;
 
    return () => {
      ambience.current?.pause();
      collectSound.current?.pause();
      footsteps.current?.pause();
      penguinChirp.current?.pause();
    };
  }, []);
 
  const playAmbience = useCallback(() => {
    ambience.current?.play().catch(() => {});
  }, []);
 
  const stopAmbience = useCallback(() => {
    if (ambience.current) {
      ambience.current.pause();
      ambience.current.currentTime = 0;
    }
  }, []);
 
  const playCollectSound = useCallback(() => {
    if (collectSound.current) {
      collectSound.current.currentTime = 0;
      collectSound.current.play().catch(() => {});
    }
 
    if (footsteps.current) {
      footsteps.current.currentTime = 0;
      footsteps.current.play().catch(() => {});
    }
 
    window.navigator?.vibrate?.(50);
  }, []);
 
  // ======================================================
  // RESET / START / STOP
  // ======================================================
 
  const resetGameState = useCallback(() => {
    setFishCount(0);
    setKrillCount(0);
    setTimeLeft(GAME_TIME);
    setGameResult(null);
    setTarget(createTarget("android"));
    setAndroidGamePosition(null);
    setIOSCameraReady(false);
    setIOSCameraError(null);
  }, []);
 
  const startIOSGame = () => {
    resetGameState();
    setMode("ios-camera");
    playAmbience();
  };
 
  const stopGame = () => {
    stopAmbience();
    resetGameState();
    setIsXRPresenting(false);
    setMode("intro");
  };
 
  const playAgain = () => {
    setFishCount(0);
    setKrillCount(0);
    setTimeLeft(GAME_TIME);
    setGameResult(null);
    setTarget(createTarget(mode === "ios-camera" ? "ios" : "android"));
 
    if (mode === "android-webxr") {
      setAndroidGamePosition(null);
    }
 
    playAmbience();
  };
 
  // ======================================================
  // TIMER
  // ======================================================
 
  const gameHasStartedForTimer = useMemo(() => {
    if (mode === "android-webxr") {
      return Boolean(androidGamePosition);
    }
 
    if (mode === "ios-camera") {
      return iosCameraReady;
    }
 
    return false;
  }, [mode, androidGamePosition, iosCameraReady]);
 
  useEffect(() => {
    let timer;
 
    if (gameHasStartedForTimer && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (gameHasStartedForTimer && timeLeft === 0 && !isGameOver) {
      setGameResult("timeup");
      stopAmbience();
 
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch(() => {});
      }
    }
 
    return () => clearInterval(timer);
  }, [gameHasStartedForTimer, timeLeft, isGameOver, stopAmbience]);
 
  // ======================================================
  // COLLECT OBJECT
  // ======================================================
 
  const handleObjectCollected = useCallback(
    (type) => {
      if (isGameOver) return;
 
      // Plastic = instant fail
      if (type === "plastic") {
        setGameResult("plastic");
        stopAmbience();
        return;
      }
 
      playCollectSound();
 
      let nextFish = fishCount;
      let nextKrill = krillCount;
 
      if (type === "fish") {
        nextFish = fishCount + 1;
        setFishCount(nextFish);
      }
 
      if (type === "krill") {
        nextKrill = krillCount + 1;
        setKrillCount(nextKrill);
      }
 
      if (nextFish >= FISH_GOAL || nextKrill >= KRILL_GOAL) {
        setGameResult("win");
        stopAmbience();
        return;
      }
 
      setTarget(createTarget(mode === "ios-camera" ? "ios" : "android"));
    },
    [
      isGameOver,
      fishCount,
      krillCount,
      mode,
      playCollectSound,
      stopAmbience,
    ]
  );
 
  // ======================================================
  // UI TEXT
  // ======================================================
 
  const androidCanUseWebXR = supportChecked && webXRSupported && !isIOS;
  const showIntro = mode === "intro" && !isXRPresenting;
 
  const gameIsActive = useMemo(() => {
    if (mode === "android-webxr") return isXRPresenting;
    if (mode === "ios-camera") return true;
    return false;
  }, [mode, isXRPresenting]);
 
  const getResultTitle = () => {
    if (gameResult === "win") return "ICY IS SAFE!";
    if (gameResult === "plastic") return "OH NO!";
    if (gameResult === "timeup") return "TIME IS UP!";
    return "";
  };
 
  const getResultMessage = () => {
    if (gameResult === "win") {
      return `Great job! You helped ICY survive by collecting ${fishCount} fish and ${krillCount} krill.`;
    }
 
    if (gameResult === "plastic") {
      return "Plastic pollution is dangerous for penguins. If a penguin eats plastic, it can block the stomach, reduce hunger, cause injury, and even lead to death.";
    }
 
    if (gameResult === "timeup") {
      return `ICY needed ${FISH_GOAL} fish or ${KRILL_GOAL} krill within one minute. You collected ${fishCount} fish and ${krillCount} krill. Try again and move faster!`;
    }
 
    return "";
  };
 
  return (
    <div
      style={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#07111f",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {/* CAMERA BACKGROUND FOR iOS / CAMERA MODE */}
      <IOSCameraBackground
        active={mode === "ios-camera"}
        onReady={() => setIOSCameraReady(true)}
        onError={(error) => setIOSCameraError(error)}
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
            background:
              "radial-gradient(circle at top, rgba(66,153,225,0.35), rgba(7,17,31,0.95))",
          }}
        >
          <h1
            style={{
              fontSize: "52px",
              marginBottom: "10px",
              textShadow: "0 10px 35px rgba(0,0,0,0.5)",
            }}
          >
            ICY AR
          </h1>
 
          <p
            style={{
              fontSize: "18px",
              opacity: 0.9,
              marginBottom: "18px",
              maxWidth: "370px",
              lineHeight: 1.5,
            }}
          >
            Help ICY survive by collecting fish and krill. Avoid plastic waste.
          </p>
 
          <p
            style={{
              fontSize: "15px",
              opacity: 0.78,
              marginBottom: "28px",
              maxWidth: "380px",
              lineHeight: 1.5,
            }}
          >
            Goal: collect <b>{FISH_GOAL} fish</b> or{" "}
            <b>{KRILL_GOAL} krill</b> within one minute. If you tap plastic, the
            game fails.
          </p>
 
          {!supportChecked && <p style={{ opacity: 0.8 }}>Checking AR support...</p>}
 
          {supportChecked && isIOS && (
            <button
              onClick={startIOSGame}
              style={{
                padding: "16px 34px",
                fontSize: "17px",
                fontWeight: "bold",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(135deg, #ffffff, #b7ecff)",
                color: "#07111f",
                cursor: "pointer",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              }}
            >
              Start iOS AR Game
            </button>
          )}
 
          {supportChecked && !isIOS && !androidCanUseWebXR && (
            <button
              onClick={startIOSGame}
              style={{
                padding: "16px 34px",
                fontSize: "17px",
                fontWeight: "bold",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(135deg, #ffffff, #b7ecff)",
                color: "#07111f",
                cursor: "pointer",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              }}
            >
              Start Camera AR Game
            </button>
          )}
 
          {androidCanUseWebXR && (
            <p
              style={{
                maxWidth: "360px",
                fontSize: "15px",
                opacity: 0.9,
                marginTop: "16px",
                lineHeight: 1.5,
              }}
            >
              On Android, press the AR button below, scan the floor, and place
              ICY.
            </p>
          )}
        </div>
      )}
 
      {/* HUD */}
      <div
        ref={setOverlayElement}
        style={{
          position: "absolute",
          zIndex: 10,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          display: gameIsActive ? "flex" : "none",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* TOP HUD */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "8px",
            padding: "14px",
            width: "100%",
            boxSizing: "border-box",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              color: "white",
              fontSize: "15px",
              fontWeight: "900",
              padding: "10px 12px",
              borderRadius: "18px",
              background: "rgba(0,0,0,0.52)",
              border: "1px solid rgba(255,255,255,0.25)",
              backdropFilter: "blur(8px)",
              lineHeight: 1.5,
            }}
          >
            🐟 {fishCount}/{FISH_GOAL}
            <br />
            🦐 {krillCount}/{KRILL_GOAL}
          </div>
 
          {!isGameOver && (
            <div
              style={{
                color: timeLeft <= 10 ? "#fb7185" : "white",
                fontSize: "22px",
                fontWeight: "900",
                padding: "10px 14px",
                borderRadius: "999px",
                background: "rgba(0,0,0,0.52)",
                border: "1px solid rgba(255,255,255,0.25)",
                backdropFilter: "blur(8px)",
              }}
            >
              ⏱ {timeLeft}s
            </div>
          )}
 
          <button
            onClick={stopGame}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: "bold",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.4)",
              background: "rgba(225,29,72,0.92)",
              color: "white",
              pointerEvents: "auto",
              cursor: "pointer",
              maxHeight: "44px",
              backdropFilter: "blur(8px)",
            }}
          >
            Exit
          </button>
        </div>
 
        {/* STATUS MESSAGES */}
        {mode === "android-webxr" &&
          isXRPresenting &&
          !androidGamePosition && (
            <InfoBox text="Scan the floor and tap the white ring to place ICY." />
          )}
 
        {mode === "ios-camera" && !iosCameraReady && !iosCameraError && (
          <InfoBox text="Opening camera AR mode..." />
        )}
 
        {mode === "ios-camera" && iosCameraError && (
          <InfoBox text="Camera permission blocked. Allow camera access and refresh." />
        )}
 
        {gameHasStartedForTimer && !isGameOver && target && (
          <div
            style={{
              position: "absolute",
              bottom: "32px",
              left: "50%",
              transform: "translateX(-50%)",
              color: "white",
              fontSize: "16px",
              fontWeight: "900",
              textAlign: "center",
              background: "rgba(0,0,0,0.58)",
              padding: "12px 18px",
              borderRadius: "999px",
              border: `2px solid ${ITEM_CONFIG[target.type].color}`,
              backdropFilter: "blur(10px)",
              whiteSpace: "nowrap",
            }}
          >
            Tap: {ITEM_CONFIG[target.type].icon}{" "}
            {ITEM_CONFIG[target.type].label}
          </div>
        )}
 
        {/* GAME OVER */}
        {isGameOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.88)",
              zIndex: 50,
              color: "white",
              textAlign: "center",
              padding: "22px",
              pointerEvents: "auto",
              backdropFilter: "blur(8px)",
            }}
          >
            <h1
              style={{
                fontSize: "42px",
                marginBottom: "14px",
                color:
                  gameResult === "win"
                    ? "#86efac"
                    : gameResult === "plastic"
                    ? "#fb7185"
                    : "#38bdf8",
              }}
            >
              {getResultTitle()}
            </h1>
 
            <p
              style={{
                fontSize: "18px",
                marginBottom: "22px",
                maxWidth: "360px",
                lineHeight: 1.5,
              }}
            >
              {getResultMessage()}
            </p>
 
            <button
              onClick={playAgain}
              style={{
                padding: "15px 36px",
                fontSize: "18px",
                fontWeight: "bold",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(135deg, #2563eb, #38bdf8)",
                color: "white",
                cursor: "pointer",
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              }}
            >
              Restart Game
            </button>
          </div>
        )}
      </div>
 
      {/* ANDROID WEBXR BUTTON */}
      {androidCanUseWebXR && overlayElement && (
        <ARButton
          sessionInit={{
            requiredFeatures: ["hit-test"],
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: overlayElement },
          }}
          onClick={() => {
            resetGameState();
            setMode("android-webxr");
            playAmbience();
          }}
          style={{
            position: "absolute",
            bottom: "42px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "16px 34px",
            fontSize: "17px",
            fontWeight: "bold",
            borderRadius: "999px",
            border: "none",
            background: "linear-gradient(135deg, #ffffff, #b7ecff)",
            color: "#07111f",
            cursor: "pointer",
            zIndex: 20,
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
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
          powerPreference: "high-performance",
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: mode === "android-webxr" || mode === "ios-camera" ? 2 : 0,
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
                <ambientLight intensity={2.6} />
                <directionalLight position={[0, 4, 3]} intensity={2.2} />
 
                {!androidGamePosition ? (
                  <Reticle onPlace={setAndroidGamePosition} />
                ) : (
                  <Suspense fallback={null}>
                    <group position={androidGamePosition}>
                      <IceGround mode="android" />
 
                      <NormalizedModel
                        url="/models/ice_floe.glb"
                        size={GAME_SIZES.android.iceModelSize}
                        position={[0, 0.01, 0]}
                      />
 
                      <Penguin target={target} mode="android" />
 
                      {!isGameOver && target && (
                        <Collectable
                          key={target.id}
                          target={target}
                          mode="android"
                          onCollect={handleObjectCollected}
                        />
                      )}
                    </group>
                  </Suspense>
                )}
              </>
            )}
          </XR>
        )}
 
        {/* iOS / CAMERA AR SCENE */}
        {mode === "ios-camera" && (
          <IOSGameScene
            ready={iosCameraReady}
            target={target}
            isGameOver={isGameOver}
            onCollect={handleObjectCollected}
          />
        )}
      </Canvas>
    </div>
  );
}
 
// Optional preload
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/ice_floe.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/krill_antartic.glb");
useGLTF.preload("/models/plastic_water_bottle.glb");