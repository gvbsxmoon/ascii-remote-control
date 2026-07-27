import { useEffect, useRef } from "react";

const CHARACTERS = "@%#*+=-:.?01/\\|{}[]()<>$&;";
const CELL_WIDTH = 9;
const CELL_HEIGHT = 12;
const CURSOR_RADIUS = 32;
const CLOSED_THRESHOLD = 0.3;
const OPEN_THRESHOLD = 0.58;
const INPUT_TIMEOUT = 600;
const PARTICLE_LIFETIME = 1_100;
const MAX_THROW_SPEED = 1_800;

function randomCharacter() {
  return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
}

function createGrid(width, height, time) {
  const cells = [];

  for (let y = CELL_HEIGHT * 0.5; y < height; y += CELL_HEIGHT) {
    for (let x = CELL_WIDTH * 0.5; x < width; x += CELL_WIDTH) {
      cells.push({
        x,
        y,
        character: randomCharacter(),
        hidden: false,
        flashUntil: 0,
        nextChange: time + 120 + Math.random() * 1_500,
      });
    }
  }

  return cells;
}

export function AsciiField({ inputRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext("2d");
    const wallCanvas = document.createElement("canvas");
    const wallContext = wallCanvas.getContext("2d");
    const size = { width: 0, height: 0, dpr: 1 };
    const cursor = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5,
      targetX: window.innerWidth * 0.5,
      targetY: window.innerHeight * 0.5,
      velocityX: 0,
      velocityY: 0,
      throwVelocityX: 0,
      throwVelocityY: 0,
      throwMotion: 0,
    };

    let cells = [];
    let heldCharacters = [];
    let particles = [];
    let handClosed = false;
    let wasClosed = false;
    let pointerDown = false;
    let wallDirty = true;
    let nextWallFrame = 0;
    let frameId;
    let previousTime = performance.now();

    function configureText(target) {
      target.font =
        '9px "Share Tech Mono", "SFMono-Regular", Menlo, Consolas, monospace';
      target.textAlign = "center";
      target.textBaseline = "middle";
    }

    function resize() {
      const previousWidth = size.width || window.innerWidth;
      const previousHeight = size.height || window.innerHeight;
      size.width = window.innerWidth;
      size.height = window.innerHeight;
      size.dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      canvas.width = Math.round(size.width * size.dpr);
      canvas.height = Math.round(size.height * size.dpr);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
      context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);

      wallCanvas.width = Math.round(size.width * size.dpr);
      wallCanvas.height = Math.round(size.height * size.dpr);
      wallContext.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);

      const scaleX = size.width / previousWidth;
      const scaleY = size.height / previousHeight;
      cursor.x *= scaleX;
      cursor.y *= scaleY;
      cursor.targetX *= scaleX;
      cursor.targetY *= scaleY;
      cursor.velocityX *= scaleX;
      cursor.velocityY *= scaleY;
      cursor.throwVelocityX *= scaleX;
      cursor.throwVelocityY *= scaleY;
      heldCharacters.forEach((character) => {
        character.x *= scaleX;
        character.y *= scaleY;
      });
      particles.forEach((character) => {
        character.x *= scaleX;
        character.y *= scaleY;
      });

      cells = createGrid(size.width, size.height, performance.now());
      wallDirty = true;
    }

    function regenerateSource() {
      heldCharacters.forEach((character) => {
        const cell = character.sourceCell;
        cell.character = randomCharacter();
        cell.hidden = false;
        cell.nextChange = performance.now() + 250 + Math.random() * 1_200;
      });
      wallDirty = true;
    }

    function grabCharacters() {
      const radiusSquared = CURSOR_RADIUS * CURSOR_RADIUS;
      const captured = [];

      cells.forEach((cell) => {
        if (cell.hidden) return;
        const dx = cell.x - cursor.x;
        const dy = cell.y - cursor.y;
        if (dx * dx + dy * dy > radiusSquared) return;

        cell.hidden = true;
        captured.push({
          character: cell.character,
          offsetX: dx,
          offsetY: dy,
          x: cell.x,
          y: cell.y,
          sourceCell: cell,
        });
      });

      heldCharacters = captured;
      cursor.throwVelocityX = cursor.velocityX;
      cursor.throwVelocityY = cursor.velocityY;
      cursor.throwMotion = 0;
      wallDirty = true;
    }

    function releaseCharacters() {
      if (heldCharacters.length === 0) return;
      regenerateSource();

      const releaseTime = performance.now();
      const rawThrowSpeed = Math.hypot(
        cursor.throwVelocityX,
        cursor.throwVelocityY,
      );
      const velocityLimit =
        rawThrowSpeed > MAX_THROW_SPEED
          ? MAX_THROW_SPEED / rawThrowSpeed
          : 1;
      const throwVelocityX = cursor.throwVelocityX * velocityLimit;
      const throwVelocityY = cursor.throwVelocityY * velocityLimit;
      const throwSpeed = Math.min(rawThrowSpeed, MAX_THROW_SPEED);
      const sensorBoost = Math.min(cursor.throwMotion, 20) * 28;

      heldCharacters.forEach((character) => {
        const baseAngle = Math.atan2(character.offsetY, character.offsetX);
        const angle = baseAngle + (Math.random() - 0.5) * 1.1;
        const radialSpeed =
          45 +
          sensorBoost +
          throwSpeed * 0.12 +
          Math.random() * (75 + throwSpeed * 0.18 + sensorBoost * 0.5);

        particles.push({
          character: character.character,
          x: character.x,
          y: character.y,
          vx: throwVelocityX * 0.72 + Math.cos(angle) * radialSpeed,
          vy: throwVelocityY * 0.72 + Math.sin(angle) * radialSpeed,
          rotation: 0,
          angularVelocity: (Math.random() - 0.5) * 5,
          bornAt: releaseTime,
        });
      });

      heldCharacters = [];
    }

    function updateWall(time) {
      if (!wallDirty && time < nextWallFrame) return;

      if (Math.random() < 0.68) {
        const flashCount = Math.random() < 0.2 ? 2 : 1;
        for (let index = 0; index < flashCount; index += 1) {
          const cell = cells[Math.floor(Math.random() * cells.length)];
          if (cell && !cell.hidden) {
            cell.flashUntil = time + 120 + Math.random() * 260;
          }
        }
      }

      cells.forEach((cell) => {
        if (!cell.hidden && time >= cell.nextChange) {
          cell.character = randomCharacter();
          cell.nextChange = time + 120 + Math.random() * 1_500;
        }
      });

      wallContext.clearRect(0, 0, size.width, size.height);
      configureText(wallContext);
      wallContext.fillStyle = "rgba(255, 255, 255, 0.28)";
      cells.forEach((cell) => {
        if (!cell.hidden && cell.flashUntil <= time) {
          wallContext.fillText(cell.character, cell.x, cell.y);
        }
      });

      wallContext.fillStyle = "#39ff14";
      wallContext.shadowColor = "#39ff14";
      wallContext.shadowBlur = 7;
      cells.forEach((cell) => {
        if (!cell.hidden && cell.flashUntil > time) {
          wallContext.fillText(cell.character, cell.x, cell.y);
        }
      });
      wallContext.shadowBlur = 0;
      wallDirty = false;
      nextWallFrame = time + 80;
    }

    function updateParticles(delta, time) {
      particles.forEach((character) => {
        const drag = Math.exp(-2.9 * delta);
        character.vx *= drag;
        character.vy *= drag;
        character.x += character.vx * delta;
        character.y += character.vy * delta;
        character.rotation += character.angularVelocity * delta;
      });

      particles = particles.filter(
        (character) => time - character.bornAt < PARTICLE_LIFETIME,
      );
    }

    function drawCharacter(
      target,
      character,
      x,
      y,
      rotation = 0,
      opacity = 1,
    ) {
      target.save();
      target.translate(x, y);
      target.rotate(rotation);
      target.globalAlpha = opacity;
      target.fillText(character, 0, 0);
      target.restore();
    }

    function drawParticles(time) {
      configureText(context);
      context.fillStyle = "#ffffff";
      particles.forEach((character) => {
        const progress = Math.min(
          1,
          (time - character.bornAt) / PARTICLE_LIFETIME,
        );
        drawCharacter(
          context,
          character.character,
          character.x,
          character.y,
          character.rotation,
          1 - progress * progress,
        );
      });
    }

    function drawCursor(tracked) {
      if (!tracked) return;
      context.save();
      context.fillStyle = "#000000";
      context.strokeStyle = "rgba(255, 255, 255, 0.92)";
      context.lineWidth = 0.75;
      context.beginPath();
      context.arc(cursor.x, cursor.y, CURSOR_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }

    function updateHeld(delta, time) {
      heldCharacters.forEach((character, index) => {
        const phase = index * 0.57;
        const targetX =
          cursor.x +
          character.offsetX * 0.86 +
          Math.sin(time * 0.006 + phase) * 1.5;
        const targetY =
          cursor.y +
          character.offsetY * 0.86 +
          Math.cos(time * 0.005 + phase) * 1.5;
        const follow = Math.min(1, delta * 24);
        character.x += (targetX - character.x) * follow;
        character.y += (targetY - character.y) * follow;
      });
    }

    function drawHeld() {
      configureText(context);
      context.fillStyle = "#ffffff";
      heldCharacters.forEach((character) => {
        drawCharacter(context, character.character, character.x, character.y);
      });
    }

    function setPointerInput(event, openness) {
      const bounds = canvas.getBoundingClientRect();
      inputRef.current = {
        tracked: true,
        x: (event.clientX - bounds.left) / bounds.width,
        y: (event.clientY - bounds.top) / bounds.height,
        openness,
        motionIntensity: 0,
        receivedAt: performance.now(),
        source: "pointer",
      };
    }

    function onPointerMove(event) {
      setPointerInput(event, pointerDown ? 0 : 1);
    }

    function onPointerDown(event) {
      pointerDown = true;
      canvas.setPointerCapture(event.pointerId);
      setPointerInput(event, 0);
    }

    function onPointerUp(event) {
      pointerDown = false;
      setPointerInput(event, 1);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    function onPointerLeave() {
      if (!pointerDown && inputRef.current.source === "pointer") {
        inputRef.current.tracked = false;
      }
    }

    function render(time) {
      const delta = Math.min((time - previousTime) / 1_000, 0.033);
      previousTime = time;
      const input = inputRef.current;
      const tracked =
        input.tracked &&
        (input.source === "pointer" ||
          time - input.receivedAt < INPUT_TIMEOUT);

      if (tracked) {
        cursor.targetX = input.x * size.width;
        cursor.targetY = input.y * size.height;
        const previousX = cursor.x;
        const previousY = cursor.y;
        const follow = Math.min(1, delta * 18);
        cursor.x += (cursor.targetX - cursor.x) * follow;
        cursor.y += (cursor.targetY - cursor.y) * follow;

        const velocityFollow = Math.min(1, delta * 12);
        const instantVelocityX = (cursor.x - previousX) / Math.max(delta, 0.001);
        const instantVelocityY = (cursor.y - previousY) / Math.max(delta, 0.001);
        cursor.velocityX +=
          (instantVelocityX - cursor.velocityX) * velocityFollow;
        cursor.velocityY +=
          (instantVelocityY - cursor.velocityY) * velocityFollow;

        if (handClosed && input.openness > OPEN_THRESHOLD) {
          handClosed = false;
        } else if (!handClosed && input.openness < CLOSED_THRESHOLD) {
          handClosed = true;
        }
      } else {
        handClosed = false;
        cursor.velocityX *= Math.exp(-12 * delta);
        cursor.velocityY *= Math.exp(-12 * delta);
      }

      if (handClosed) {
        const throwFollow = Math.min(1, delta * 10);
        cursor.throwVelocityX +=
          (cursor.velocityX - cursor.throwVelocityX) * throwFollow;
        cursor.throwVelocityY +=
          (cursor.velocityY - cursor.throwVelocityY) * throwFollow;
        cursor.throwMotion = Math.max(
          cursor.throwMotion * Math.exp(-5 * delta),
          Number(input.motionIntensity) || 0,
        );
      }

      if (handClosed && !wasClosed) {
        grabCharacters();
      } else if (!handClosed && wasClosed) {
        releaseCharacters();
      }
      wasClosed = handClosed;

      updateWall(time);
      updateHeld(delta, time);
      updateParticles(delta, time);

      context.fillStyle = "#000000";
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(wallCanvas, 0, 0, size.width, size.height);
      drawParticles(time);
      drawCursor(tracked);
      drawHeld();
      frameId = requestAnimationFrame(render);
    }

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    frameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [inputRef]);

  return <canvas ref={canvasRef} className="ascii-field" />;
}
