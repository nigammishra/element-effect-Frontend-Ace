import * as THREE from "three";
      const canvas = document.querySelector("#scene"),
        container = document.querySelector("#webgl");
      const gradient = document.querySelector("#gradient"),
        loader = document.querySelector("#loader"),
        fill = document.querySelector("#progress-fill"),
        count = document.querySelector("#loader-count"),
        status = document.querySelector("#loader-status"),
        header = document.querySelector("#header");
      const control = { progress: 0, started: false };
      let ready = false,
        done = false,
        loaderValue = 0,
        loaderLast = performance.now(),
        doneTimer = null;
      let mousePos = { x: 99, y: 99, isDown: false },
        prevMouse = { x: 99, y: 99 },
        mouseWorldSpeed = 0;
      const palettes = {
        roseGold: {
          color: "#2F69FF",
          bg: "radial-gradient(circle at center,#ffffff 0%,#ecefff 35%,#c2d1ff 100%)",
        },
        pinkBlush: {
          color: "#FFC5C2",
          bg: "radial-gradient(circle at center,#ffffff 0%,#fff0f1 38%,#ffd1d5 100%)",
        },
        voltLime: {
          color: "#E1FC03",
          bg: "radial-gradient(circle at center,#ffffff 0%,#fbffe5 38%,#e8ff9c 100%)",
        },
        arcticBlue: {
          color: "#96E5FF",
          bg: "radial-gradient(circle at center,#ffffff 0%,#effaff 38%,#c9f1ff 100%)",
        },
      };
      let selected = "roseGold",
        scene,
        camera,
        renderer,
        balls = [],
        hemiLight,
        raf = 0,
        clock,
        localStarted = false,
        entranceStart = 0,
        reportedReady = false,
        viewportWidth = 10,
        viewportHeight = 6,
        shapeScale = 1,
        meanRadius = 0;
      const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v),
        smoothstep = (a, b, x) => {
          const t = clamp01((x - a) / (b - a));
          return t * t * (3 - 2 * t);
        },
        lerp = (a, b, t) => a + (b - a) * t,
        easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
      const getDynamicColors = (baseColor) => {
        const hex = baseColor.toLowerCase();
        if (hex === "#e1fc03")
          return {
            pastel: new THREE.Color("#FBFFE2"),
            light: new THREE.Color("#EFFE69"),
            medium: new THREE.Color("#E1FC03"),
            deep: new THREE.Color("#B1E200"),
            glass: new THREE.Color("#DCFF32"),
          };
        if (hex === "#ffc5c2" || hex === "#ffa19e")
          return {
            pastel: new THREE.Color("#FFF5F4"),
            light: new THREE.Color("#FFECEB"),
            medium: new THREE.Color("#FFA6B3"),
            deep: new THREE.Color("#FF4D6D"),
            glass: new THREE.Color("#FFA6B3"),
          };
        if (hex === "#96e5ff")
          return {
            pastel: new THREE.Color("#F0F9FF"),
            light: new THREE.Color("#C9F1FF"),
            medium: new THREE.Color("#96E5FF"),
            deep: new THREE.Color("#2BA5FF"),
            glass: new THREE.Color("#98E4FF"),
          };
        if (hex === "#2f69ff")
          return {
            pastel: new THREE.Color("#ECEFFF"),
            light: new THREE.Color("#A8C1FF"),
            medium: new THREE.Color("#2F69FF"),
            deep: new THREE.Color("#0A33BF"),
            glass: new THREE.Color("#4D80FF"),
          };
        const c = new THREE.Color(baseColor);
        return {
          pastel: c.clone().offsetHSL(0, -0.15, 0.25),
          light: c.clone().offsetHSL(0, -0.05, 0.12),
          medium: c.clone(),
          deep: c.clone().offsetHSL(0.01, 0.1, -0.12),
          glass: c.clone(),
        };
      };
      const ROLES = ["pastel", "light", "medium", "deep", "glass"];
      let palette,
        palHero,
        palLime = getDynamicColors("#E1FC03"),
        palPink = getDynamicColors("#FFC5C2"),
        curPal = {};
      function initScene() {
        if (raf) cancelAnimationFrame(raf);
        if (renderer) {
          renderer.dispose();
          balls.forEach((b) => b.material.dispose());
        }
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(
          38,
          container.clientWidth / container.clientHeight,
          0.1,
          100,
        );
        camera.position.set(0, 0, 11);
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        palette = getDynamicColors(palettes[selected].color);
        palHero = palette;
        ROLES.forEach((r) => (curPal[r] = new THREE.Color()));
        hemiLight = new THREE.HemisphereLight(
          0xffffff,
          new THREE.Color(palettes[selected].color),
          1.6,
        );
        scene.add(hemiLight);
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(-6, 10, 8);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        Object.assign(key.shadow.camera, {
          near: 0.5,
          far: 30,
          left: -8,
          right: 8,
          top: 8,
          bottom: -8,
        });
        key.shadow.bias = -0.0003;
        key.shadow.radius = 12;
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffffff, 1.25);
        rim.position.set(8, 7, -8);
        scene.add(rim);
        const front = new THREE.DirectionalLight(0xffffff, 0.4);
        front.position.set(0, 0, 11);
        scene.add(front);
        const side = new THREE.DirectionalLight(0xffffff, 0.3);
        side.position.set(-9, -2, 4);
        scene.add(side);
        updateFrustumBounds();
        const mobile = innerWidth < 768,
          n = mobile ? 54 : 96,
          geometry = new THREE.SphereGeometry(1, 48, 48),
          isBlack = false;
        balls = [];
        for (let i = 0; i < n; i++) {
          let radius = 0.33,
            r = Math.random();
          if (r < 0.3) radius = 0.27 + Math.random() * 0.12;
          else if (r < 0.8) radius = 0.42 + Math.random() * 0.18;
          else radius = 0.66 + Math.random() * 0.21;
          const mass = Math.pow(radius, 3),
            isGlass = Math.random() < 0.22 && !isBlack;
          let role = "medium",
            chosen = palette.medium,
            mat,
            color;
          if (isGlass) {
            mat = new THREE.MeshPhysicalMaterial({
              color: palette.glass,
              roughness: 0.08,
              metalness: 0,
              clearcoat: 1,
              clearcoatRoughness: 0.03,
              transmission: 0.95,
              ior: 1.485,
              thickness: 2.2,
              specularColor: new THREE.Color("#fff"),
              specularIntensity: 1,
              attenuationColor: palette.pastel,
              attenuationDistance: 1,
              emissive: palette.glass,
              emissiveIntensity: 0.12,
              transparent: true,
            });
            color = palette.glass;
            role = "glass";
          } else {
            const cr = Math.random();
            if (cr < 0.25) {
              chosen = palette.pastel;
              role = "pastel";
            } else if (cr < 0.55) {
              chosen = palette.light;
              role = "light";
            } else if (cr < 0.85) {
              chosen = palette.medium;
              role = "medium";
            } else {
              chosen = palette.deep;
              role = "deep";
            }
            mat = new THREE.MeshPhysicalMaterial({
              color: chosen,
              roughness: 0.44,
              metalness: 0,
              clearcoat: 0.24,
              clearcoatRoughness: 0.35,
              emissive: chosen,
              emissiveIntensity: 0.08,
              transparent: true,
            });
            color = chosen;
          }
          const group = new THREE.Group(),
            mesh = new THREE.Mesh(geometry, mat);
          mesh.scale.setScalar(radius);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
          scene.add(group);
          balls.push({
            id: i,
            radius,
            mass,
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            meshGroup: group,
            sphere: mesh,
            material: mat,
            role,
            isGlass,
            visualScale: radius,
            color,
            restPosition: new THREE.Vector3(),
            shapeTarget: new THREE.Vector3(),
            angleY: Math.random() * Math.PI * 2,
            angleZ: 0.1 + Math.random() * 0.45,
          });
        }
        meanRadius = balls.reduce((s, b) => s + b.radius, 0) / balls.length;
        assignHeartTargets();
        scatterFar(false);
        clock = new THREE.Clock();
        localStarted = false;
        entranceStart = 0;
        reportedReady = false;
        simulateAndRender();
      }
      function updateFrustumBounds() {
        const fov = THREE.MathUtils.degToRad(camera.fov);
        viewportHeight = 2 * Math.tan(fov / 2) * camera.position.z;
        viewportWidth =
          viewportHeight * (container.clientWidth / container.clientHeight);
      }
      const inHeart = (x, y) => {
        const a = x * x + y * y - 1;
        return a * a * a - x * x * y * y * y <= 0;
      };
      function assignHeartTargets() {
        if (!balls.length) return;
        const S = Math.min(viewportWidth * 0.3, viewportHeight * 0.27),
          baseCY = -viewportHeight * 0.03;
        shapeScale = Math.max(0.3, Math.min(1, (S * 0.45) / 2.3 / meanRadius));
        for (let i = 0; i < balls.length; i++) {
          let x = 0,
            y = 0,
            tries = 0;
          do {
            x = (Math.random() * 2 - 1) * 1.25;
            y = Math.random() * 2.55 - 1.4;
            tries++;
          } while (!inHeart(x, y) && tries < 60);
          balls[i].shapeTarget.set(
            x * S,
            (y + 0.12) * S + baseCY,
            (Math.random() - 0.5) * 0.35,
          );
        }
      }
      function scatterFar(inward) {
        const R = Math.max(viewportWidth, viewportHeight) * 1.5;
        for (const b of balls) {
          const a = Math.random() * Math.PI * 2,
            px = Math.cos(a) * R * 1.25,
            py = Math.sin(a) * R * 0.85,
            pz = (Math.random() - 0.5) * 4;
          b.position.set(px, py, pz);
          b.meshGroup.position.copy(b.position);
          if (inward)
            b.velocity
              .set(-px, -py, -pz)
              .normalize()
              .multiplyScalar(0.08 + Math.random() * 0.05);
          else b.velocity.set(0, 0, 0);
        }
      }
      const params = {
        gravity: 0,
        rebound: -0.3,
        mouseRepelForce: 0.05,
        mouseRepelRadius: 4.4,
        damping: 0.91,
        centerAttractForce: 0.0035,
        bounciness: 0.02,
      };
      const mouseProjVec = new THREE.Vector3(),
        mouseWorld3D = new THREE.Vector3(),
        prevMouseWorld = new THREE.Vector3(),
        diffVec = new THREE.Vector3(),
        collideDiff = new THREE.Vector3(),
        relVel = new THREE.Vector3(),
        deltaPos = new THREE.Vector3(),
        rotAxis = new THREE.Vector3();
      function updateMouse3D() {
        mouseProjVec.set(mousePos.x, mousePos.y, 0.5);
        mouseProjVec.unproject(camera);
        const dir = mouseProjVec.sub(camera.position).normalize(),
          distance = -camera.position.z / dir.z;
        mouseWorld3D.copy(camera.position).add(dir.multiplyScalar(distance));
      }
      function simulateAndRender() {
        raf = requestAnimationFrame(simulateAndRender);
        const time = clock.getElapsedTime();
        clock.getDelta();
        updateMouse3D();
        if (control.started && !localStarted) {
          localStarted = true;
          entranceStart = time;
          scatterFar(true);
        }
        if (!localStarted) {
          renderer.render(scene, camera);
          if (!reportedReady) {
            reportedReady = true;
            ready = true;
          }
          return;
        }
        const progress = control.progress,
          heroF = 1 - smoothstep(0.3, 0.8, progress),
          dropRaw = smoothstep(0.4, 0.95, progress),
          flyF = smoothstep(2.7, 3.45, progress),
          shapeF =
            smoothstep(1.4, 2.05, progress) *
            (1 - smoothstep(2.55, 3, progress)),
          dropF = dropRaw * (1 - smoothstep(1.25, 1.75, progress));
        const bLime = smoothstep(0.55, 1.05, progress),
          bPink = smoothstep(1.4, 1.95, progress);
        for (const role of ROLES)
          curPal[role]
            .copy(palHero[role])
            .lerp(palLime[role], bLime)
            .lerp(palPink[role], bPink);
        hemiLight.groundColor.copy(curPal.medium);
        const entranceT = easeOutCubic(clamp01((time - entranceStart) / 2.2)),
          attractionBoost = lerp(7.5, 1, entranceT),
          interacting =
            Math.abs(mousePos.x) < 0.99 || Math.abs(mousePos.y) < 0.99;
        let mouseSpeed = interacting
          ? mouseWorld3D.distanceTo(prevMouseWorld)
          : 0;
        if (mouseSpeed > 3) mouseSpeed = 3;
        prevMouseWorld.copy(mouseWorld3D);
        let damping = 0.91;
        damping = lerp(damping, 0.992, dropF);
        damping = lerp(damping, 0.9, shapeF);
        damping = lerp(damping, 0.985, flyF);
        const clusterActive = Math.max(heroF, entranceT < 1 ? 1 : 0);
        for (const b of balls) {
          if (heroF > 0.01) {
            b.velocity.x +=
              Math.sin(time * 0.4 + b.id * 1.5) * 0.0004 * b.radius * heroF;
            b.velocity.y +=
              Math.cos(time * 0.5 + b.id * 1.2) * 0.0004 * b.radius * heroF;
            b.velocity.z += Math.sin(time * 0.35 + b.id) * 0.0001 * heroF;
          }
          const cluster =
            params.centerAttractForce * attractionBoost * clusterActive;
          if (cluster > 0.00001) {
            b.velocity.x += (0 - b.position.x) * cluster * 0.38;
            b.velocity.y += (0 - b.position.y) * cluster * 1.85;
            b.velocity.z += (0 - b.position.z) * cluster * 1.8;
          }
          if (dropF > 0.001) b.velocity.y -= 0.011 * dropF;
          if (shapeF > 0.001) {
            const k = 0.06 * shapeF;
            b.velocity.x += (b.shapeTarget.x - b.position.x) * k;
            b.velocity.y += (b.shapeTarget.y - b.position.y) * k;
            b.velocity.z += (b.shapeTarget.z - b.position.z) * k;
          }
          if (flyF > 0.001) {
            const stagger = (b.id * 0.6180339887) % 1,
              local = smoothstep(stagger * 0.55, stagger * 0.55 + 0.45, flyF);
            b.velocity.z += 0.05 * local;
            b.velocity.x += b.position.x * 0.006 * local;
            b.velocity.y += b.position.y * 0.006 * local;
          }
          if (interacting) {
            diffVec.subVectors(b.position, mouseWorld3D);
            const dist = diffVec.length(),
              down = mousePos.isDown,
              rad = down
                ? params.mouseRepelRadius * 1.4
                : params.mouseRepelRadius,
              force = down
                ? params.mouseRepelForce * 1.7
                : params.mouseRepelForce;
            if (dist < rad && dist > 0.0001) {
              const ratio = dist / rad,
                sf = 1 - ratio * ratio * (3 - 2 * ratio),
                push = sf * force * (1 + mouseSpeed * 3.2);
              diffVec.normalize();
              diffVec.z *= 0.12;
              diffVec.normalize();
              b.velocity.addScaledVector(diffVec, push);
            }
          }
          b.velocity.multiplyScalar(damping);
          b.position.addScaledVector(b.velocity, 1);
          const c = b.isGlass ? curPal.glass : curPal[b.role];
          b.material.color.copy(c);
          b.material.emissive.copy(c);
          b.material.opacity =
            flyF > 0.001
              ? 1 -
                smoothstep(
                  camera.position.z - 2.6,
                  camera.position.z - 0.3,
                  b.position.z,
                )
              : 1;
          const target = b.radius * (1 - (1 - shapeScale) * shapeF);
          b.visualScale += (target - b.visualScale) * 0.12;
          b.sphere.scale.setScalar(b.visualScale);
        }
        const collideScale = 0.28 * (1 - 0.93 * shapeF) * (1 - flyF);
        for (let step = 0; step < 4; step++)
          for (let i = 0; i < balls.length; i++)
            for (let j = i + 1; j < balls.length; j++) {
              const a = balls[i],
                b = balls[j];
              collideDiff.subVectors(b.position, a.position);
              const dist = collideDiff.length(),
                min = a.visualScale + b.visualScale;
              if (dist < min && dist > 0.001) {
                const overlap = min - dist;
                collideDiff.multiplyScalar(1 / dist);
                const total = a.mass + b.mass,
                  r1 = b.mass / total,
                  r2 = a.mass / total;
                a.position.addScaledVector(
                  collideDiff,
                  -overlap * r1 * collideScale,
                );
                b.position.addScaledVector(
                  collideDiff,
                  overlap * r2 * collideScale,
                );
                relVel.subVectors(b.velocity, a.velocity);
                const along = relVel.dot(collideDiff);
                if (along < -0.0001) {
                  const impulse =
                    (-(1 + params.bounciness) * along) /
                    (1 / a.mass + 1 / b.mass);
                  a.velocity.addScaledVector(collideDiff, -impulse / a.mass);
                  b.velocity.addScaledVector(collideDiff, impulse / b.mass);
                }
              }
            }
        const xBound = viewportWidth / 2 - 0.2,
          topY = viewportHeight / 2 - 0.05,
          floorY = -viewportHeight / 2 + 0.05,
          zBound = 2,
          restitution = 0.3 + 0.35 * dropF,
          contain = flyF < 0.5,
          zContain = flyF < 0.02;
        for (const b of balls) {
          const r = b.visualScale;
          if (contain) {
            if (b.position.x < -xBound - r) {
              b.position.x = -xBound - r;
              b.velocity.x *= params.rebound;
            } else if (b.position.x > xBound + r) {
              b.position.x = xBound + r;
              b.velocity.x *= params.rebound;
            }
            if (b.position.y - r < floorY) {
              b.position.y = floorY + r;
              if (b.velocity.y < 0) b.velocity.y = -b.velocity.y * restitution;
              if (dropF > 0.3) {
                b.velocity.x *= 0.86;
                b.velocity.z *= 0.86;
              }
            }
            if (b.position.y + r > topY) {
              b.position.y = topY - r;
              if (b.velocity.y > 0) b.velocity.y *= params.rebound;
            }
          }
          if (zContain) {
            if (b.position.z < -zBound) {
              b.position.z = -zBound;
              b.velocity.z *= params.rebound;
            } else if (b.position.z > zBound) {
              b.position.z = zBound;
              b.velocity.z *= params.rebound;
            }
          }
          deltaPos.copy(b.position).sub(b.meshGroup.position);
          if (deltaPos.lengthSq() > 0.000001) {
            rotAxis.set(deltaPos.y, -deltaPos.x, 0).normalize();
            b.meshGroup.rotateOnWorldAxis(
              rotAxis,
              (deltaPos.length() / b.radius) * 0.95,
            );
          }
          b.meshGroup.position.copy(b.position);
        }
        renderer.render(scene, camera);
        if (!reportedReady) {
          reportedReady = true;
          ready = true;
        }
      }
      new ResizeObserver(() => {
        if (!camera || !renderer) return;
        const w = container.clientWidth,
          h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        updateFrustumBounds();
        assignHeartTargets();
      }).observe(container);
      window.addEventListener("pointermove", (e) => {
        mousePos.x = (e.clientX / innerWidth) * 2 - 1;
        mousePos.y = -(e.clientY / innerHeight) * 2 + 1;
      });
      window.addEventListener("mousedown", () => (mousePos.isDown = true));
      window.addEventListener("mouseup", () => (mousePos.isDown = false));
      window.addEventListener("blur", () => (mousePos.isDown = false));
      function selectPalette(id) {
        selected = id;
        document
          .querySelectorAll(".palette-option")
          .forEach((el) =>
            el.classList.toggle("selected", el.dataset.id === id),
          );
        gradient.style.background = palettes[id].bg;
        initScene();
      }
      document
        .querySelectorAll(".palette-option")
        .forEach((el) =>
          el.addEventListener("click", () => selectPalette(el.dataset.id)),
        );
      document
        .querySelector("#reset-theme")
        .addEventListener("click", () => selectPalette("roseGold"));
      const drawer = document.querySelector("#drawer"),
        scrim = document.querySelector("#scrim");
      function openDrawer() {
        drawer.classList.add("open");
        scrim.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
      }
      function closeDrawer() {
        drawer.classList.remove("open");
        scrim.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
      }
      document
        .querySelector("#open-drawer")
        .addEventListener("click", openDrawer);
      document
        .querySelector("#close-drawer")
        .addEventListener("click", closeDrawer);
      scrim.addEventListener("click", closeDrawer);
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeDrawer();
      });
      const observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              observer.unobserve(e.target);
            }
          }),
        { threshold: 0.45 },
      );
      document
        .querySelectorAll(".reveal")
        .forEach((el) => observer.observe(el));
      let scrollTarget = scrollY,
        scrollActual = scrollY,
        scrolling = false;
      window.addEventListener(
        "wheel",
        (e) => {
          if (Math.abs(e.deltaY) < 1) return;
          e.preventDefault();
          scrollTarget = Math.max(
            0,
            Math.min(
              document.documentElement.scrollHeight - innerHeight,
              scrollTarget + e.deltaY,
            ),
          );
          if (!scrolling) {
            scrolling = true;
            smoothScroll();
          }
        },
        { passive: false },
      );
      function smoothScroll() {
        scrollActual += (scrollTarget - scrollActual) * 0.09;
        if (Math.abs(scrollTarget - scrollActual) < 0.5) {
          scrollActual = scrollTarget;
          scrolling = false;
        }
        window.scrollTo(0, scrollActual);
        if (scrolling) requestAnimationFrame(smoothScroll);
      }
      window.addEventListener(
        "scroll",
        () => {
          if (!scrolling) scrollTarget = scrollY;
          const vh = innerHeight || 1;
          control.progress = scrollY / vh;
          const stage =
            control.progress > 1.55 ? 2 : control.progress > 0.7 ? 1 : 0;
          const bg =
            stage === 0
              ? palettes[selected].bg
              : stage === 1
                ? "radial-gradient(circle at center,#ffffff 0%,#fbffe5 38%,#e8ff9c 100%)"
                : "radial-gradient(circle at center,#ffffff 0%,#fff0f1 38%,#ffd1d5 100%)";
          gradient.style.background = bg;
        },
        { passive: true },
      );
      function loaderLoop(now) {
        const dt = Math.min(0.05, (now - loaderLast) / 1000);
        loaderLast = now;
        if (!done) {
          const ceiling = ready ? 100 : 92;
          loaderValue += (ceiling - loaderValue) * (ready ? 6 : 1.7) * dt;
          if (ready && loaderValue >= 99.4) loaderValue = 100;
          fill.style.width = loaderValue + "%";
          count.textContent =
            String(Math.floor(loaderValue)).padStart(3, "0") + "%";
          status.textContent =
            loaderValue >= 100 ? "Entering orbit" : "Calibrating gravity field";
          if (loaderValue >= 99.9 && ready && !done) {
            done = true;
            setTimeout(() => {
              loader.classList.add("leaving");
              setTimeout(() => {
                control.started = true;
                header.classList.add("visible");
                document.querySelector(".hero").classList.add("revealed");
              }, 520);
            }, 140);
          }
        }
        requestAnimationFrame(loaderLoop);
      }
      initScene();
      requestAnimationFrame(loaderLoop);

      const scrollTopBtn = document.getElementById("nigamScrollTopBtn");

// Show button after scrolling
window.addEventListener("scroll", () => {
  if (window.scrollY > 300) {
    scrollTopBtn.style.display = "flex";
  } else {
    scrollTopBtn.style.display = "none";
  }
});

// Scroll smoothly to top
scrollTopBtn.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});