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
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ======================================================
// GLOBAL SETTINGS
// ======================================================

const MINDAR_SCRIPT =
  "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";

const TARGET_SRC = "/targets/icy-marker.mind";

const GAME_SIZES = {
  android: {
    iceModelScale: 0.09,
    iceGroundRadius: 1.9,
    penguinScale: 0.9,
    fishScale: 0.0075,
    fishY: 0.34,
    fishMinRadius: 0.65,
    fishMaxRadius: 1.35,
  },

  mindar: {
    iceGroundRadius: 0.82,
    iceModelScale: 0.12,
    penguinScale: 0.78,
    fishScale: 0.011,
    fishMinRadius: 0.32,
    fishMaxRadius: 0.58,
    fishZ: 0.18,
  },
};

// ======================================================
// DEVICE HELPERS
// ======================================================

const isIOSDevice = () => {
  if (typeof window === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1)
  );
};

const getRandomAndroidFishPosition = () => {
  const settings = GAME_SIZES.android;

  const angle = Math.random() * Math.PI * 2;
  const radius =
    settings.fishMinRadius +
    Math.random() * (settings.fishMaxRadius - settings.fishMinRadius);

  return [
    Math.cos(angle) * radius,
    settings.fishY,
    Math.sin(angle) * radius,
  ];
};

const getRandomMindARFishPosition = () => {
  const settings = GAME_SIZES.mindar;

  const angle = Math.random() * Math.PI * 2;
  const radius =
    settings.fishMinRadius +
    Math.random() * (settings.fishMaxRadius - settings.fishMinRadius);

  return new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    settings.fishZ
  );
};

// ======================================================
// MODEL PRELOADS FOR ANDROID WEBXR
// ======================================================

useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/ice_floe.glb");

// ======================================================
// LOAD MINDAR SCRIPT
// ======================================================

function loadMindARScript() {
  return new Promise((resolve, reject) => {
    if (window.MINDAR && window.MINDAR.IMAGE) {
      resolve(window.MINDAR.IMAGE.MindARThree);
      return;
    }

    const existingScript = document.querySelector(
      `script[src="${MINDAR_SCRIPT}"]`
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.MINDAR && window.MINDAR.IMAGE) {
          resolve(window.MINDAR.IMAGE.MindARThree);
        } else {
          reject(new Error("MindAR loaded but not available"));
        }
      });

      existingScript.addEventListener("error", () => {
        reject(new Error("Failed to load MindAR script"));
      });

      return;
    }

    const script = document.createElement("script");
    script.src = MINDAR_SCRIPT;
    script.async = true;

    script.onload = () => {
      if (window.MINDAR && window.MINDAR.IMAGE) {
        resolve(window.MINDAR.IMAGE.MindARThree);
      } else {
        reject(new Error("MindAR loaded but not available"));
      }
    };

    script.onerror = () => {
      reject(new Error("Failed to load MindAR script"));
    };

    document.body.appendChild(script);
  });
}

// ======================================================
// ANDROID WEBXR ICE GROUND
// ======================================================

function BigIceGround({ android = true }) {
  const settings = android ? GAME_SIZES.android : GAME_SIZES.mindar;

  return (
    <group position={[0, -0.025, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[settings.iceGroundRadius, 96]} />
        <meshBasicMaterial
          color="#dff8ff"
          transparent
          opacity={0.88}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry
          args={[
            settings.iceGroundRadius * 0.88,
            settings.iceGroundRadius,
            96,
          ]}
        />
        <meshBasicMaterial
          color="#76d7ff"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry
          args={[
            settings.iceGroundRadius * 0.32,
            settings.iceGroundRadius * 0.35,
            96,
          ]}
        />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ======================================================
// ANDROID WEBXR MODELS
// ======================================================

function IceFloe() {
  const ice = useGLTF("/models/ice_floe.glb");

  return (
    <primitive
      object={ice.scene}
      scale={GAME_SIZES.android.iceModelScale}
      position={[0, -0.01, 0]}
    />
  );
}

function Penguin() {
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

  useFrame(() => {
    if (group.current) {
      group.current.rotation.y += 0.003;
    }
  });

  return (
    <primitive
      ref={group}
      object={penguin.scene}
      scale={GAME_SIZES.android.penguinScale}
      position={[0, 0.03, 0]}
    />
  );
}

// ======================================================
// ANDROID WEBXR TRACKER
// ======================================================

function XRTracker({ onXRStart }) {
  const { isPresenting } = useXR();

  useEffect(() => {
    onXRStart(isPresenting);
  }, [isPresenting, onXRStart]);

  return null;
}

// ======================================================
// ANDROID WEBXR RETICLE
// ======================================================

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

        if (distance > 0 && distance < 1.7) {
          const push = 1.7 - distance;
          spawnPos.x += (dirX / distance) * push;
          spawnPos.z += (dirZ / distance) * push;
        }

        onPlace(spawnPos);
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
// ANDROID WEBXR FISH
// ======================================================

function AndroidFish({ position, onCollect }) {
  const ref = useRef();
  const fish = useGLTF("/models/fish.glb");

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.035;
      ref.current.position.y =
        position[1] + Math.sin(Date.now() * 0.004) * 0.06;
    }
  });

  return (
    <Interactive onSelect={onCollect}>
      <group ref={ref} position={position}>
        <primitive
          object={fish.scene}
          scale={GAME_SIZES.android.fishScale}
          position={[0, 0, 0]}
        />
      </group>
    </Interactive>
  );
}

// ======================================================
// CREATE MINDAR ICE GROUND
// ======================================================

function createMindARIceGround() {
  const group = new THREE.Group();
  const settings = GAME_SIZES.mindar;

  const circleGeometry = new THREE.CircleGeometry(settings.iceGroundRadius, 96);
  const circleMaterial = new THREE.MeshBasicMaterial({
    color: 0xdff8ff,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });

  const circle = new THREE.Mesh(circleGeometry, circleMaterial);
  circle.position.set(0, 0, 0);
  group.add(circle);

  const ringGeometry = new THREE.RingGeometry(
    settings.iceGroundRadius * 0.88,
    settings.iceGroundRadius,
    96
  );

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x76d7ff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });

  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.set(0, 0, 0.004);
  group.add(ring);

  const innerRingGeometry = new THREE.RingGeometry(
    settings.iceGroundRadius * 0.32,
    settings.iceGroundRadius * 0.35,
    96
  );

  const innerRingMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });

  const innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
  innerRing.position.set(0, 0, 0.008);
  group.add(innerRing);

  return group;
}

// ======================================================
// MINDAR MARKER-BASED GAME
// ======================================================

function MindARMarkerGame({
  isActive,
  targetSrc,
  isGameOver,
  onReady,
  onError,
  onTrackingChange,
  onFishCollected,
}) {
  const containerRef = useRef(null);

  const mindarRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);

  const fishGroupRef = useRef(null);
  const fishHitRef = useRef(null);
  const fishBasePosRef = useRef(new THREE.Vector3());
  const markerFoundRef = useRef(false);

  const mixerRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());

  const isGameOverRef = useRef(isGameOver);
  const onFishCollectedRef = useRef(onFishCollected);
  const onTrackingChangeRef = useRef(onTrackingChange);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  const lastCollectTimeRef = useRef(0);

  useEffect(() => {
    isGameOverRef.current = isGameOver;
  }, [isGameOver]);

  useEffect(() => {
    onFishCollectedRef.current = onFishCollected;
  }, [onFishCollected]);

  useEffect(() => {
    onTrackingChangeRef.current = onTrackingChange;
  }, [onTrackingChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const repositionFish = useCallback(() => {
    const pos = getRandomMindARFishPosition();
    fishBasePosRef.current.copy(pos);

    if (fishGroupRef.current) {
      fishGroupRef.current.position.copy(pos);
    }

    if (fishHitRef.current) {
      fishHitRef.current.position.copy(pos);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;

    let disposed = false;
    let pointerHandler = null;

    const setupMindAR = async () => {
      try {
        const MindARThree = await loadMindARScript();

        if (disposed || !containerRef.current) return;

        const mindarThree = new MindARThree({
          container: containerRef.current,
          imageTargetSrc: targetSrc,
          uiScanning: "yes",
          uiLoading: "yes",
          filterMinCF: 0.0001,
          filterBeta: 0.001,
        });

        mindarRef.current = mindarThree;

        const { renderer, scene, camera } = mindarThree;
        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = camera;

        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        renderer.domElement.style.position = "absolute";
        renderer.domElement.style.inset = "0";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.touchAction = "none";

        const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.4);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
        directionalLight.position.set(0, 2, 3);
        scene.add(directionalLight);

        const anchor = mindarThree.addAnchor(0);

        anchor.onTargetFound = () => {
          markerFoundRef.current = true;

          if (onTrackingChangeRef.current) {
            onTrackingChangeRef.current(true);
          }
        };

        anchor.onTargetLost = () => {
          markerFoundRef.current = false;

          if (onTrackingChangeRef.current) {
            onTrackingChangeRef.current(false);
          }
        };

        // Ice ground on marker plane
        const iceGround = createMindARIceGround();
        anchor.group.add(iceGround);

        const loader = new GLTFLoader();

        const [iceGltf, penguinGltf, fishGltf] = await Promise.all([
          loader.loadAsync("/models/ice_floe.glb"),
          loader.loadAsync("/models/penguin.glb"),
          loader.loadAsync("/models/fish.glb"),
        ]);

        if (disposed) return;

        // Ice floe model
        const iceModel = iceGltf.scene;
        iceModel.scale.setScalar(GAME_SIZES.mindar.iceModelScale);
        iceModel.position.set(0, 0, 0.025);
        iceModel.rotation.x = Math.PI / 2;
        anchor.group.add(iceModel);

        // Penguin model
        const penguinRoot = new THREE.Group();
        penguinRoot.position.set(0, -0.03, 0.08);
        penguinRoot.rotation.x = Math.PI / 2;

        const penguinModel = penguinGltf.scene;
        penguinModel.scale.setScalar(GAME_SIZES.mindar.penguinScale);
        penguinRoot.add(penguinModel);
        anchor.group.add(penguinRoot);

        if (penguinGltf.animations && penguinGltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(penguinModel);
          mixerRef.current = mixer;

          const action = mixer.clipAction(penguinGltf.animations[0]);
          action.reset().play();
        }

        // Fish model
        const fishGroup = new THREE.Group();
        fishGroup.rotation.x = Math.PI / 2;

        const fishModel = fishGltf.scene;
        fishModel.scale.setScalar(GAME_SIZES.mindar.fishScale);
        fishGroup.add(fishModel);

        anchor.group.add(fishGroup);
        fishGroupRef.current = fishGroup;

        // Invisible hit target for easy tapping
        const fishHitGeometry = new THREE.SphereGeometry(0.18, 24, 24);
        const fishHitMaterial = new THREE.MeshBasicMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });

        const fishHit = new THREE.Mesh(fishHitGeometry, fishHitMaterial);
        fishHit.name = "fish-hit-target";
        anchor.group.add(fishHit);
        fishHitRef.current = fishHit;

        repositionFish();

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        pointerHandler = (event) => {
          if (!rendererRef.current || !cameraRef.current) return;
          if (!fishHitRef.current) return;
          if (isGameOverRef.current) return;
          if (!markerFoundRef.current) return;

          event.preventDefault();

          const now = Date.now();

          // avoid double tap / double event collection
          if (now - lastCollectTimeRef.current < 250) {
            return;
          }

          const rect = rendererRef.current.domElement.getBoundingClientRect();

          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(pointer, cameraRef.current);

          const hits = raycaster.intersectObject(fishHitRef.current, true);

          if (hits.length > 0) {
            lastCollectTimeRef.current = now;

            if (onFishCollectedRef.current) {
              onFishCollectedRef.current();
            }

            repositionFish();
          }
        };

        renderer.domElement.addEventListener("pointerdown", pointerHandler, {
          passive: false,
        });

        await mindarThree.start();

        if (onReadyRef.current) {
          onReadyRef.current();
        }

        renderer.setAnimationLoop(() => {
          const delta = clockRef.current.getDelta();

          if (mixerRef.current) {
            mixerRef.current.update(delta);
          }

          if (penguinRoot) {
            penguinRoot.rotation.z += 0.004;
          }

          if (fishGroupRef.current && fishHitRef.current) {
            const base = fishBasePosRef.current;
            const floatingZ =
              base.z + Math.sin(Date.now() * 0.004) * 0.035;

            fishGroupRef.current.position.set(base.x, base.y, floatingZ);
            fishHitRef.current.position.set(base.x, base.y, floatingZ);

            fishGroupRef.current.rotation.z += 0.045;
          }

          renderer.render(scene, camera);
        });
      } catch (error) {
        console.error("MindAR setup error:", error);

        if (onErrorRef.current) {
          onErrorRef.current(error);
        }
      }
    };

    setupMindAR();

    return () => {
      disposed = true;

      try {
        if (rendererRef.current && pointerHandler) {
          rendererRef.current.domElement.removeEventListener(
            "pointerdown",
            pointerHandler
          );
        }

        if (rendererRef.current) {
          rendererRef.current.setAnimationLoop(null);
        }

        if (mindarRef.current) {
          mindarRef.current.stop();
        }

        markerFoundRef.current = false;

        if (onTrackingChangeRef.current) {
          onTrackingChangeRef.current(false);
        }
      } catch (error) {
        console.log("MindAR cleanup error:", error);
      }

      mindarRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      fishGroupRef.current = null;
      fishHitRef.current = null;
      mixerRef.current = null;
    };
  }, [isActive, targetSrc, repositionFish]);

  if (!isActive) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        zIndex: 1,
        background: "black",
      }}
    />
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

  // modes:
  // intro
  // android-webxr
  // mindar-marker

  const [isXRPresenting, setIsXRPresenting] = useState(false);
  const [androidGamePosition, setAndroidGamePosition] = useState(null);
  const [androidFishPosition, setAndroidFishPosition] = useState(
    getRandomAndroidFishPosition()
  );

  const [mindARReady, setMindARReady] = useState(false);
  const [mindARError, setMindARError] = useState(null);
  const [markerFound, setMarkerFound] = useState(false);

  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isGameOver, setIsGameOver] = useState(false);

  const ambience = useRef(null);
  const collect = useRef(null);
  const footsteps = useRef(null);
  const penguinChirp = useRef(null);

  // ======================================================
  // PLATFORM CHECK
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
  // AUDIO SETUP
  // ======================================================

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

  // ======================================================
  // GAME ACTIVE CHECK
  // ======================================================

  const gameIsActive = useMemo(() => {
    if (mode === "android-webxr") {
      return isXRPresenting;
    }

    if (mode === "mindar-marker") {
      return mindARReady;
    }

    return false;
  }, [mode, isXRPresenting, mindARReady]);

  const gameHasStartedForTimer = useMemo(() => {
    if (mode === "android-webxr") {
      return Boolean(androidGamePosition);
    }

    if (mode === "mindar-marker") {
      return markerFound;
    }

    return false;
  }, [mode, androidGamePosition, markerFound]);

  // ======================================================
  // TIMER
  // ======================================================

  useEffect(() => {
    let timer;

    if (gameHasStartedForTimer && timeLeft > 0 && !isGameOver) {
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
  }, [gameHasStartedForTimer, timeLeft, isGameOver]);

  // ======================================================
  // GAME ACTIONS
  // ======================================================

  const playAmbience = () => {
    if (ambience.current) {
      ambience.current.play().catch((e) => console.log(e));
    }
  };

  const stopAmbience = () => {
    if (ambience.current) {
      ambience.current.pause();
      ambience.current.currentTime = 0;
    }
  };

  const resetGameState = () => {
    setScore(0);
    setTimeLeft(30);
    setIsGameOver(false);

    setAndroidGamePosition(null);
    setAndroidFishPosition(getRandomAndroidFishPosition());

    setMindARReady(false);
    setMindARError(null);
    setMarkerFound(false);
  };

  const handleFishCollected = useCallback(() => {
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
  }, [isGameOver]);

  const handleAndroidFishCollected = () => {
    handleFishCollected();
    setAndroidFishPosition(getRandomAndroidFishPosition());
  };

  const startMindAR = () => {
    resetGameState();
    setMode("mindar-marker");
    playAmbience();
  };

  const stopGame = () => {
    stopAmbience();
    resetGameState();
    setIsXRPresenting(false);
    setMode("intro");
  };

  const playAgain = () => {
    setScore(0);
    setTimeLeft(30);
    setIsGameOver(false);
    setAndroidGamePosition(null);
    setAndroidFishPosition(getRandomAndroidFishPosition());

    if (mode === "mindar-marker") {
      setMarkerFound(false);
    }

    playAmbience();
  };

  const getEndMessage = () => {
    if (score === 0) return "ICY is sad and starving! 😭";
    if (score <= 3) return "ICY survived, but is still hungry! 🐟";
    if (score <= 7) return "ICY is well-fed and happy! 🐧";
    return "ICY is stuffed and ready to dance! 🎉";
  };

  const handleMindARReady = useCallback(() => {
    setMindARReady(true);
    setMindARError(null);
  }, []);

  const handleMindARError = useCallback((error) => {
    console.error(error);
    setMindARError(error);
  }, []);

  const handleMarkerTrackingChange = useCallback((found) => {
    setMarkerFound(found);
  }, []);

  // ======================================================
  // UI FLAGS
  // ======================================================

  const androidCanUseWebXR = supportChecked && webXRSupported && !isIOS;

  const shouldUseMindAR =
    supportChecked && (isIOS || !webXRSupported || !androidCanUseWebXR);

  const showIntro = mode === "intro" && !isXRPresenting;

  const showHUD = gameIsActive || mode === "mindar-marker";

  // ======================================================
  // RENDER
  // ======================================================

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
      {/* MINDAR IOS / MARKER AR */}
      <MindARMarkerGame
        isActive={mode === "mindar-marker"}
        targetSrc={TARGET_SRC}
        isGameOver={isGameOver}
        onReady={handleMindARReady}
        onError={handleMindARError}
        onTrackingChange={handleMarkerTrackingChange}
        onFishCollected={handleFishCollected}
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
          <div
            style={{
              padding: "12px 20px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              marginBottom: "18px",
              fontSize: "14px",
              letterSpacing: "2px",
            }}
          >
            ANTARCTICA AR EXPERIENCE
          </div>

          <h1
            style={{
              fontSize: "52px",
              marginBottom: "10px",
              lineHeight: 1,
              textShadow: "0 10px 35px rgba(0,0,0,0.5)",
            }}
          >
            ICY AR
          </h1>

          <p
            style={{
              fontSize: "18px",
              opacity: 0.88,
              marginBottom: "28px",
              maxWidth: "360px",
              lineHeight: 1.5,
            }}
          >
            Feed the baby penguin by catching fish in augmented reality.
          </p>

          {!supportChecked && (
            <p style={{ opacity: 0.8 }}>Checking AR support...</p>
          )}

          {shouldUseMindAR && (
            <>
              <p
                style={{
                  maxWidth: "360px",
                  fontSize: "15px",
                  opacity: 0.9,
                  marginBottom: "24px",
                  lineHeight: 1.5,
                }}
              >
                iPhone and unsupported browsers use MindAR image tracking. Point
                your camera at the Antarctica marker to place ICY in the real
                world.
              </p>

              <button
                onClick={startMindAR}
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
                Start Marker AR Game
              </button>
            </>
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
              On Android, press the AR button below to scan the floor and place
              ICY.
            </p>
          )}

          {mindARError && (
            <p
              style={{
                marginTop: "20px",
                color: "#fca5a5",
                maxWidth: "330px",
                lineHeight: 1.4,
              }}
            >
              MindAR could not start. Please check camera permission and make
              sure <b>/targets/icy-marker.mind</b> exists.
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
          display: showHUD ? "flex" : "none",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* TOP HUD */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
            padding: "18px",
            width: "100%",
            boxSizing: "border-box",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              color: "white",
              fontSize: "22px",
              fontWeight: "900",
              padding: "10px 16px",
              borderRadius: "999px",
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.25)",
              backdropFilter: "blur(8px)",
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
            }}
          >
            🐟 {score}
          </div>

          {!isGameOver && (
            <div
              style={{
                color: timeLeft <= 5 ? "#fb7185" : "white",
                fontSize: "24px",
                fontWeight: "900",
                padding: "10px 16px",
                borderRadius: "999px",
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(255,255,255,0.25)",
                backdropFilter: "blur(8px)",
                textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
              }}
            >
              ⏱ 00:{timeLeft.toString().padStart(2, "0")}
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
              background: "rgba(225,29,72,0.9)",
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

        {/* ANDROID INSTRUCTION */}
        {mode === "android-webxr" &&
          isXRPresenting &&
          !androidGamePosition && (
            <div
              style={{
                position: "absolute",
                top: "52%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                color: "white",
                fontSize: "18px",
                fontWeight: "bold",
                textAlign: "center",
                background: "rgba(0,0,0,0.62)",
                padding: "14px 22px",
                borderRadius: "18px",
                maxWidth: "310px",
                border: "1px solid rgba(255,255,255,0.25)",
                backdropFilter: "blur(10px)",
              }}
            >
              Scan the floor and tap the ring to place ICY.
            </div>
          )}

        {/* MINDAR INSTRUCTIONS */}
        {mode === "mindar-marker" && !mindARReady && !mindARError && (
          <div
            style={{
              position: "absolute",
              top: "52%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              background: "rgba(0,0,0,0.7)",
              padding: "14px 24px",
              borderRadius: "18px",
              maxWidth: "320px",
              backdropFilter: "blur(10px)",
            }}
          >
            Loading MindAR camera...
          </div>
        )}

        {mode === "mindar-marker" &&
          mindARReady &&
          !markerFound &&
          !isGameOver && (
            <div
              style={{
                position: "absolute",
                top: "52%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                color: "white",
                fontSize: "18px",
                fontWeight: "bold",
                textAlign: "center",
                background: "rgba(0,0,0,0.7)",
                padding: "14px 24px",
                borderRadius: "18px",
                maxWidth: "320px",
                backdropFilter: "blur(10px)",
                lineHeight: 1.4,
              }}
            >
              Point your camera at the printed Antarctica marker.
            </div>
          )}

        {mode === "mindar-marker" &&
          mindARReady &&
          markerFound &&
          !isGameOver && (
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
                background: "rgba(0,0,0,0.5)",
                padding: "12px 20px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.25)",
                backdropFilter: "blur(10px)",
                whiteSpace: "nowrap",
              }}
            >
              Tap the fish to feed ICY!
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
              background: "rgba(0,0,0,0.86)",
              zIndex: 50,
              color: "white",
              textAlign: "center",
              padding: "20px",
              pointerEvents: "auto",
              backdropFilter: "blur(8px)",
            }}
          >
            <h1
              style={{
                fontSize: "46px",
                marginBottom: "10px",
                textShadow: "2px 2px 10px rgba(0,0,0,1)",
                color: "#38bdf8",
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
                color: "#a7f3d0",
                maxWidth: "330px",
                lineHeight: 1.4,
              }}
            >
              {getEndMessage()}
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

      {/* ANDROID WEBXR CANVAS */}
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
          zIndex: mode === "android-webxr" ? 2 : 0,
          pointerEvents: "none",
          background: "transparent",
        }}
      >
        {mode === "android-webxr" && (
          <XR>
            <XRTracker onXRStart={setIsXRPresenting} />

            {isXRPresenting && (
              <>
                <ambientLight intensity={2.5} />
                <directionalLight position={[0, 4, 3]} intensity={2.2} />

                {!androidGamePosition ? (
                  <Reticle onPlace={setAndroidGamePosition} />
                ) : (
                  <Suspense fallback={null}>
                    <group position={androidGamePosition}>
                      <BigIceGround android />
                      <IceFloe />
                      <Penguin />

                      {!isGameOver && (
                        <AndroidFish
                          position={androidFishPosition}
                          onCollect={handleAndroidFishCollected}
                        />
                      )}
                    </group>
                  </Suspense>
                )}
              </>
            )}
          </XR>
        )}
      </Canvas>
    </div>
  );
}