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

const GAME_TIME = 60;
const FISH_GOAL = 10;
const KRILL_GOAL = 5;

const GAME_SIZES = {
  android: {
    iceModelScale: 0.11,
    iceGroundRadius: 3.2,
    penguinScale: 1.05,
    itemY: 0.38,
    minRadius: 1.25,
    maxRadius: 3.1,
  },

  mindar: {
    iceGroundRadius: 0.95,
    iceModelScale: 0.14,
    penguinScale: 0.85,
    minRadius: 0.38,
    maxRadius: 0.72,
    itemZ: 0.22,
  },
};

const ITEM_CONFIG = {
  fish: {
    label: "Fish",
    icon: "🐟",
    model: "/models/fish.glb",
    androidScale: 0.009,
    mindarScale: 0.013,
    color: "#38bdf8",
  },
  krill: {
    label: "Krill",
    icon: "🦐",
    model: "/models/krill_antartic.glb",
    androidScale: 0.012,
    mindarScale: 0.018,
    color: "#fb7185",
  },
  plastic: {
    label: "Plastic Bottle",
    icon: "🧴",
    model: "/models/plastic_water_bottle.glb",
    androidScale: 0.018,
    mindarScale: 0.026,
    color: "#facc15",
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

const getRandomItemType = () => {
  const random = Math.random();

  if (random < 0.42) return "fish";
  if (random < 0.76) return "krill";
  return "plastic";
};

const getRandomAndroidPosition = () => {
  const settings = GAME_SIZES.android;
  const angle = Math.random() * Math.PI * 2;
  const radius =
    settings.minRadius + Math.random() * (settings.maxRadius - settings.minRadius);

  return [
    Math.cos(angle) * radius,
    settings.itemY,
    Math.sin(angle) * radius,
  ];
};

const getRandomMindARPosition = () => {
  const settings = GAME_SIZES.mindar;
  const angle = Math.random() * Math.PI * 2;
  const radius =
    settings.minRadius + Math.random() * (settings.maxRadius - settings.minRadius);

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: settings.itemZ,
  };
};

const createNewTarget = () => {
  const type = getRandomItemType();

  return {
    id: `${type}-${Date.now()}-${Math.random()}`,
    type,
    androidPosition: getRandomAndroidPosition(),
    mindarPosition: getRandomMindARPosition(),
  };
};

const lerpAngle = (a, b, t) => {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
};

// ======================================================
// MODEL PRELOADS
// ======================================================

useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/krill_antartic.glb");
useGLTF.preload("/models/plastic_water_bottle.glb");
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
// SHARED ICE GROUND
// ======================================================

function BigIceGround({ android = true }) {
  const settings = android ? GAME_SIZES.android : GAME_SIZES.mindar;

  return (
    <group position={[0, -0.025, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[settings.iceGroundRadius, 128]} />
        <meshBasicMaterial
          color="#dff8ff"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry
          args={[
            settings.iceGroundRadius * 0.9,
            settings.iceGroundRadius,
            128,
          ]}
        />
        <meshBasicMaterial
          color="#67d9ff"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry
          args={[
            settings.iceGroundRadius * 0.35,
            settings.iceGroundRadius * 0.37,
            128,
          ]}
        />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.65}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

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

// ======================================================
// ANDROID PENGUIN
// ======================================================

function Penguin({ target }) {
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
    if (!group.current || !target) return;

    const [x, , z] = target.androidPosition;
    const desiredAngle = Math.atan2(x, z);

    group.current.rotation.y = lerpAngle(
      group.current.rotation.y,
      desiredAngle,
      0.06
    );
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
// ANDROID XR TRACKER
// ======================================================

function XRTracker({ onXRStart }) {
  const { isPresenting } = useXR();

  useEffect(() => {
    onXRStart(isPresenting);
  }, [isPresenting, onXRStart]);

  return null;
}

// ======================================================
// ANDROID RETICLE
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

        if (distance > 0 && distance < 2.0) {
          const push = 2.0 - distance;
          spawnPos.x += (dirX / distance) * push;
          spawnPos.z += (dirZ / distance) * push;
        }

        onPlace(spawnPos);
      }}
    >
      <mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.28, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
      </mesh>
    </Interactive>
  );
}

// ======================================================
// ANDROID COLLECTABLE OBJECT
// ======================================================

function AndroidCollectable({ target, onCollect }) {
  const ref = useRef();
  const config = ITEM_CONFIG[target.type];
  const gltf = useGLTF(config.model);

  const clonedScene = useMemo(() => {
    return gltf.scene.clone(true);
  }, [gltf.scene, target.id]);

  useFrame(() => {
    if (!ref.current) return;

    ref.current.rotation.y += 0.035;
    ref.current.position.y =
      target.androidPosition[1] + Math.sin(Date.now() * 0.004) * 0.08;
  });

  return (
    <Interactive onSelect={() => onCollect(target.type)}>
      <group ref={ref} position={target.androidPosition}>
        <primitive
          object={clonedScene}
          scale={config.androidScale}
          position={[0, 0, 0]}
        />

        <mesh visible={false}>
          <sphereGeometry args={[0.32, 24, 24]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
    </Interactive>
  );
}

// ======================================================
// MINDAR ICE GROUND
// ======================================================

function createMindARIceGround() {
  const group = new THREE.Group();
  const settings = GAME_SIZES.mindar;

  const circle = new THREE.Mesh(
    new THREE.CircleGeometry(settings.iceGroundRadius, 128),
    new THREE.MeshBasicMaterial({
      color: 0xdff8ff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  );
  circle.position.set(0, 0, 0);
  group.add(circle);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(
      settings.iceGroundRadius * 0.9,
      settings.iceGroundRadius,
      128
    ),
    new THREE.MeshBasicMaterial({
      color: 0x67d9ff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  );
  ring.position.set(0, 0, 0.005);
  group.add(ring);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(
      settings.iceGroundRadius * 0.35,
      settings.iceGroundRadius * 0.37,
      128
    ),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    })
  );
  innerRing.position.set(0, 0, 0.01);
  group.add(innerRing);

  return group;
}

// ======================================================
// MINDAR MARKER GAME
// ======================================================

function MindARMarkerGame({
  isActive,
  targetSrc,
  currentTarget,
  isGameOver,
  onReady,
  onError,
  onTrackingChange,
  onObjectCollected,
}) {
  const containerRef = useRef(null);

  const mindarRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);

  const itemContainerRef = useRef(null);
  const fishHitRef = useRef(null);
  const penguinRootRef = useRef(null);
  const markerFoundRef = useRef(false);

  const modelsRef = useRef({});
  const mixerRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());

  const currentTargetRef = useRef(currentTarget);
  const isGameOverRef = useRef(isGameOver);
  const onObjectCollectedRef = useRef(onObjectCollected);
  const onTrackingChangeRef = useRef(onTrackingChange);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  const lastCollectTimeRef = useRef(0);

  const updateMindARTarget = useCallback(() => {
    const target = currentTargetRef.current;
    const itemContainer = itemContainerRef.current;
    const hitSphere = fishHitRef.current;

    if (!target || !itemContainer || !hitSphere) return;
    if (!modelsRef.current[target.type]) return;

    while (itemContainer.children.length > 0) {
      itemContainer.remove(itemContainer.children[0]);
    }

    const config = ITEM_CONFIG[target.type];
    const clonedModel = modelsRef.current[target.type].clone(true);

    clonedModel.scale.setScalar(config.mindarScale);
    itemContainer.add(clonedModel);

    itemContainer.position.set(
      target.mindarPosition.x,
      target.mindarPosition.y,
      target.mindarPosition.z
    );

    hitSphere.position.set(
      target.mindarPosition.x,
      target.mindarPosition.y,
      target.mindarPosition.z
    );

    itemContainer.visible = !isGameOverRef.current;
    hitSphere.visible = !isGameOverRef.current;
  }, []);

  useEffect(() => {
    currentTargetRef.current = currentTarget;
    updateMindARTarget();
  }, [currentTarget, updateMindARTarget]);

  useEffect(() => {
    isGameOverRef.current = isGameOver;

    if (itemContainerRef.current) {
      itemContainerRef.current.visible = !isGameOver;
    }

    if (fishHitRef.current) {
      fishHitRef.current.visible = !isGameOver;
    }
  }, [isGameOver]);

  useEffect(() => {
    onObjectCollectedRef.current = onObjectCollected;
  }, [onObjectCollected]);

  useEffect(() => {
    onTrackingChangeRef.current = onTrackingChange;
  }, [onTrackingChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!isActive) return;

    let disposed = false;
    let pointerHandler = null;

    const setupMindAR = async () => {
      try {
        const targetCheck = await fetch(targetSrc, { cache: "no-store" });

        if (!targetCheck.ok) {
          throw new Error(
            `MindAR target file not found: ${targetSrc}. Check public/targets/icy-marker.mind`
          );
        }

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
        cameraRef.current = camera;

        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        renderer.domElement.style.position = "absolute";
        renderer.domElement.style.inset = "0";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.touchAction = "none";
        renderer.domElement.style.zIndex = "2";

        const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.8);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.4);
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

        const iceGround = createMindARIceGround();
        anchor.group.add(iceGround);

        const loader = new GLTFLoader();

        const [
          iceGltf,
          penguinGltf,
          fishGltf,
          krillGltf,
          plasticGltf,
        ] = await Promise.all([
          loader.loadAsync("/models/ice_floe.glb"),
          loader.loadAsync("/models/penguin.glb"),
          loader.loadAsync("/models/fish.glb"),
          loader.loadAsync("/models/krill_antartic.glb"),
          loader.loadAsync("/models/plastic_water_bottle.glb"),
        ]);

        if (disposed) return;

        modelsRef.current = {
          fish: fishGltf.scene,
          krill: krillGltf.scene,
          plastic: plasticGltf.scene,
        };

        const iceModel = iceGltf.scene;
        iceModel.scale.setScalar(GAME_SIZES.mindar.iceModelScale);
        iceModel.position.set(0, 0, 0.025);
        iceModel.rotation.x = Math.PI / 2;
        anchor.group.add(iceModel);

        const penguinRoot = new THREE.Group();
        penguinRoot.position.set(0, -0.05, 0.09);
        penguinRoot.rotation.x = Math.PI / 2;

        const penguinModel = penguinGltf.scene;
        penguinModel.scale.setScalar(GAME_SIZES.mindar.penguinScale);
        penguinRoot.add(penguinModel);
        anchor.group.add(penguinRoot);
        penguinRootRef.current = penguinRoot;

        if (penguinGltf.animations && penguinGltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(penguinModel);
          mixerRef.current = mixer;

          const action = mixer.clipAction(penguinGltf.animations[0]);
          action.reset().play();
        }

        const itemContainer = new THREE.Group();
        itemContainer.rotation.x = Math.PI / 2;
        anchor.group.add(itemContainer);
        itemContainerRef.current = itemContainer;

        const hitSphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 32, 32),
          new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          })
        );
        hitSphere.name = "ar-hit-target";
        anchor.group.add(hitSphere);
        fishHitRef.current = hitSphere;

        updateMindARTarget();

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        pointerHandler = (event) => {
          if (!rendererRef.current || !cameraRef.current) return;
          if (!fishHitRef.current) return;
          if (!currentTargetRef.current) return;
          if (isGameOverRef.current) return;
          if (!markerFoundRef.current) return;

          event.preventDefault();

          const now = Date.now();

          if (now - lastCollectTimeRef.current < 280) {
            return;
          }

          const rect = rendererRef.current.domElement.getBoundingClientRect();

          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(pointer, cameraRef.current);

          const hits = raycaster.intersectObject(fishHitRef.current, true);

          if (hits.length > 0) {
            lastCollectTimeRef.current = now;

            if (onObjectCollectedRef.current) {
              onObjectCollectedRef.current(currentTargetRef.current.type);
            }
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

          const target = currentTargetRef.current;

          if (target && penguinRootRef.current) {
            const desiredAngle =
              Math.atan2(target.mindarPosition.y, target.mindarPosition.x) -
              Math.PI / 2;

            penguinRootRef.current.rotation.z = lerpAngle(
              penguinRootRef.current.rotation.z,
              desiredAngle,
              0.06
            );
          }

          if (target && itemContainerRef.current && fishHitRef.current) {
            const base = target.mindarPosition;
            const floatingZ = base.z + Math.sin(Date.now() * 0.004) * 0.04;

            itemContainerRef.current.position.set(base.x, base.y, floatingZ);
            fishHitRef.current.position.set(base.x, base.y, floatingZ);

            itemContainerRef.current.rotation.z += 0.045;
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
      cameraRef.current = null;
      itemContainerRef.current = null;
      fishHitRef.current = null;
      penguinRootRef.current = null;
      mixerRef.current = null;
      modelsRef.current = {};
    };
  }, [isActive, targetSrc, updateMindARTarget]);

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

  const [isXRPresenting, setIsXRPresenting] = useState(false);
  const [androidGamePosition, setAndroidGamePosition] = useState(null);

  const [mindARReady, setMindARReady] = useState(false);
  const [mindARError, setMindARError] = useState(null);
  const [markerFound, setMarkerFound] = useState(false);

  const [currentTarget, setCurrentTarget] = useState(createNewTarget);

  const [fishCount, setFishCount] = useState(0);
  const [krillCount, setKrillCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);

  const [gameResult, setGameResult] = useState(null);

  const ambience = useRef(null);
  const collect = useRef(null);
  const footsteps = useRef(null);
  const penguinChirp = useRef(null);

  const isGameOver = Boolean(gameResult);

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
  // AUDIO
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

  const playCollectSound = () => {
    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch((e) => console.log(e));
    }

    if (footsteps.current) {
      footsteps.current.currentTime = 0;
      footsteps.current.play().catch((e) => console.log(e));
    }

    if (
      typeof window !== "undefined" &&
      window.navigator &&
      window.navigator.vibrate
    ) {
      window.navigator.vibrate(50);
    }
  };

  // ======================================================
  // TIMER
  // ======================================================

  const gameHasStartedForTimer = useMemo(() => {
    if (mode === "android-webxr") {
      return Boolean(androidGamePosition);
    }

    if (mode === "mindar-marker") {
      return markerFound;
    }

    return false;
  }, [mode, androidGamePosition, markerFound]);

  useEffect(() => {
    let timer;

    if (gameHasStartedForTimer && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && !isGameOver) {
      setGameResult("timeup");

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

  const resetGameState = () => {
    setFishCount(0);
    setKrillCount(0);
    setTimeLeft(GAME_TIME);
    setGameResult(null);
    setCurrentTarget(createNewTarget());

    setAndroidGamePosition(null);

    setMindARReady(false);
    setMindARError(null);
    setMarkerFound(false);
  };

  const handleObjectCollected = useCallback(
    (type) => {
      if (isGameOver) return;

      if (type === "plastic") {
        setGameResult("plastic");
        stopAmbience();
        return;
      }

      playCollectSound();

      const nextFish = type === "fish" ? fishCount + 1 : fishCount;
      const nextKrill = type === "krill" ? krillCount + 1 : krillCount;

      setFishCount(nextFish);
      setKrillCount(nextKrill);

      if (nextFish >= FISH_GOAL || nextKrill >= KRILL_GOAL) {
        setGameResult("win");
        stopAmbience();
        return;
      }

      setCurrentTarget(createNewTarget());
    },
    [isGameOver, fishCount, krillCount]
  );

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
    setFishCount(0);
    setKrillCount(0);
    setTimeLeft(GAME_TIME);
    setGameResult(null);
    setCurrentTarget(createNewTarget());

    if (mode === "android-webxr") {
      setAndroidGamePosition(null);
    }

    playAmbience();
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

  const gameIsActive = useMemo(() => {
    if (mode === "android-webxr") {
      return isXRPresenting;
    }

    if (mode === "mindar-marker") {
      return true;
    }

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
      return `ICY needed 10 fish or 5 krill within one minute. You collected ${fishCount} fish and ${krillCount} krill. Try again and move faster!`;
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
      {/* MINDAR IOS / MARKER AR */}
      <MindARMarkerGame
        isActive={mode === "mindar-marker"}
        targetSrc={TARGET_SRC}
        currentTarget={currentTarget}
        isGameOver={isGameOver}
        onReady={handleMindARReady}
        onError={handleMindARError}
        onTrackingChange={handleMarkerTrackingChange}
        onObjectCollected={handleObjectCollected}
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
            Goal: collect <b>10 fish</b> or <b>5 krill</b> within one minute.
            If you tap plastic, the game fails.
          </p>

          {!supportChecked && (
            <p style={{ opacity: 0.8 }}>Checking AR support...</p>
          )}

          {shouldUseMindAR && (
            <>
              <p
                style={{
                  maxWidth: "370px",
                  fontSize: "15px",
                  opacity: 0.9,
                  marginBottom: "24px",
                  lineHeight: 1.5,
                }}
              >
                iPhone uses MindAR marker tracking. Point your camera at the ICY
                marker to place the AR game in the real world.
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
                Start iOS AR Game
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
              background: "rgba(0,0,0,0.48)",
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
                background: "rgba(0,0,0,0.48)",
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
                background: "rgba(0,0,0,0.65)",
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

        {/* MINDAR STATUS */}
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
              background: "rgba(0,0,0,0.72)",
              padding: "14px 24px",
              borderRadius: "18px",
              maxWidth: "330px",
              backdropFilter: "blur(10px)",
            }}
          >
            Opening MindAR camera...
          </div>
        )}

        {mode === "mindar-marker" && mindARError && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "white",
              fontSize: "16px",
              fontWeight: "bold",
              textAlign: "center",
              background: "rgba(120,0,0,0.86)",
              padding: "18px 24px",
              borderRadius: "18px",
              maxWidth: "340px",
              lineHeight: 1.5,
              pointerEvents: "auto",
            }}
          >
            MindAR could not start.
            <br />
            Check that this file exists:
            <br />
            <b>public/targets/icy-marker.mind</b>
            <br />
            <br />
            Your screenshot shows <b>icy-marker.mind.png</b>, which is wrong.
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
                background: "rgba(0,0,0,0.72)",
                padding: "14px 24px",
                borderRadius: "18px",
                maxWidth: "330px",
                backdropFilter: "blur(10px)",
                lineHeight: 1.4,
              }}
            >
              Point your camera at the printed ICY marker.
            </div>
          )}

        {gameHasStartedForTimer && !isGameOver && currentTarget && (
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
              background: "rgba(0,0,0,0.55)",
              padding: "12px 18px",
              borderRadius: "999px",
              border: `2px solid ${ITEM_CONFIG[currentTarget.type].color}`,
              backdropFilter: "blur(10px)",
              whiteSpace: "nowrap",
            }}
          >
            Tap: {ITEM_CONFIG[currentTarget.type].icon}{" "}
            {ITEM_CONFIG[currentTarget.type].label}
          </div>
        )}

        {/* RESULT SCREEN */}
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
                <ambientLight intensity={2.7} />
                <directionalLight position={[0, 4, 3]} intensity={2.4} />

                {!androidGamePosition ? (
                  <Reticle onPlace={setAndroidGamePosition} />
                ) : (
                  <Suspense fallback={null}>
                    <group position={androidGamePosition}>
                      <BigIceGround android />
                      <IceFloe />
                      <Penguin target={currentTarget} />

                      {!isGameOver && currentTarget && (
                        <AndroidCollectable
                          key={currentTarget.id}
                          target={currentTarget}
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
      </Canvas>
    </div>
  );
}