import { useEffect, useRef } from "react";
import {
  FIXES_PER_LEVEL,
  getLevelProfile,
  MAX_LEVEL,
  MAX_MISSES,
} from "../lib/gameDifficulty";

const CHARACTERS = "@%#*+=-:.?01/\\|{}[]()<>$&;";
const CELL_WIDTH = 9;
const CELL_HEIGHT = 12;
const CURSOR_RADIUS = 32;
const CURSOR_HOVER_RADIUS = 48;
const CLOSED_THRESHOLD = 0.3;
const OPEN_THRESHOLD = 0.58;
const INPUT_TIMEOUT = 600;
const PARTICLE_LIFETIME = 1_100;
const MAX_THROW_SPEED = 1_800;
const PROXIMITY_DISTANCE = 180;
const FIRST_BUG_DELAY = 1_200;
const LEVEL_TRANSITION_DELAY = 1_800;
const BUG_COLORS = ["#ff2d2d", "#ff665c"];
const GRAB_COLOR = "#a855f7";
const GAME_WON_MESSAGE = "TEN LEVELS. PRODUCTION SURVIVED.";
const GAME_OVER_MESSAGES = [
  "YOU SHOULDN'T BE WORKING HERE.",
  "ASK CLAUDE TO FIX THIS, PLEASE.",
  "PRODUCTION WAS SAFER WITHOUT YOU.",
  "YOUR CODE REVIEW WAS AN ACT OF VIOLENCE.",
  "SOMEHOW, YOU MADE LEGACY CODE LOOK GOOD.",
  "THE INTERN WOULD HAVE FIXED THIS BY NOW.",
  "PLEASE STEP AWAY FROM THE KEYBOARD.",
  "EVEN THE STACK TRACE GAVE UP.",
  "QA SAW THAT. QA REMEMBERS.",
  "PRODUCTION ACCESS REVOKED. EMOTIONALLY.",
];

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
        bugId: null,
        hidden: false,
        flashUntil: 0,
        nextChange: time + 120 + Math.random() * 1_500,
      });
    }
  }

  return cells;
}

export function AsciiField({
  inputRef,
  onGameStateChange,
  paused = false,
  interactionTargetRef,
  cursorOverlayRef,
  onDismiss,
}) {
  const canvasRef = useRef(null);
  const onGameStateChangeRef = useRef(onGameStateChange);
  const pausedRef = useRef(paused);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onGameStateChangeRef.current = onGameStateChange;
  }, [onGameStateChange]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext("2d");
    const wallCanvas = document.createElement("canvas");
    const wallContext = wallCanvas.getContext("2d");
    const cursorOverlay = cursorOverlayRef?.current;
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
      radius: CURSOR_RADIUS,
      fillOpacity: 1,
    };

    let cells = [];
    let bugs = [];
    let heldBug = null;
    let heldCharacters = [];
    let particles = [];
    let handClosed = false;
    let wasClosed = false;
    let pointerDown = false;
    let wallDirty = true;
    let nextWallFrame = 0;
    let frameId;
    let previousTime = performance.now();
    let gameStartedAt = 0;
    let nextBugAt = Number.POSITIVE_INFINITY;
    let bugSequence = 0;
    let score = 0;
    let misses = 0;
    let level = 1;
    let levelProgress = 0;
    let status = "WAITING";
    let statusUntil = 0;
    let gameOver = false;
    let gameOverMessage = "";
    let gameWon = false;
    let lastPublishedState = "";

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
      bugs = [];
      heldBug = null;
      heldCharacters = [];
      if (gameStartedAt > 0 && !gameOver && !gameWon) {
        nextBugAt = performance.now() + FIRST_BUG_DELAY;
        status = "HEALTHY";
      }
      wallDirty = true;
    }

    function grabBug(bug, time) {
      if (!bug) return;
      bugs = bugs.filter((candidate) => candidate.id !== bug.id);
      heldBug = bug;
      heldCharacters = bug.cells.map((cell, index) => {
        const captured = {
          character: cell.character,
          color: BUG_COLORS[index % BUG_COLORS.length],
          offsetX: cell.x - bug.x,
          offsetY: cell.y - bug.y,
          x: cell.x,
          y: cell.y,
        };
        cell.bugId = null;
        cell.character = randomCharacter();
        cell.nextChange = time + 250 + Math.random() * 1_200;
        return captured;
      });
      cursor.throwVelocityX = cursor.velocityX;
      cursor.throwVelocityY = cursor.velocityY;
      cursor.throwMotion = 0;
      status = "BUG CAPTURED";
      statusUntil = Number.POSITIVE_INFINITY;
      wallDirty = true;
    }

    function releaseCharacters(time) {
      if (heldCharacters.length === 0) return;

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
          color: character.color,
          bornAt: time,
        });
      });

      const profile = getLevelProfile(level);
      const remainingRatio = heldBug
        ? Math.max(0, (heldBug.expiresAt - time) / heldBug.lifetime)
        : 0;
      const timeBonus =
        Math.round((remainingRatio * profile.captureReward * 0.5) / 10) * 10;
      score += profile.captureReward + timeBonus;
      levelProgress += 1;
      heldBug = null;
      heldCharacters = [];

      if (levelProgress >= FIXES_PER_LEVEL) {
        if (level >= MAX_LEVEL) {
          levelProgress = FIXES_PER_LEVEL;
          completeGame(time);
        } else {
          level += 1;
          levelProgress = 0;
          status = "LEVEL UP";
          statusUntil = time + LEVEL_TRANSITION_DELAY;
          nextBugAt = time + LEVEL_TRANSITION_DELAY;
        }
      } else {
        nextBugAt = Math.min(nextBugAt, time + profile.successDelay);
        status = bugs.length > 0 ? "BUG DETECTED" : "HEALTHY";
        statusUntil = time + 1_200;
      }
    }

    function spawnBug(time) {
      if (gameOver || gameWon) return;

      const profile = getLevelProfile(level);
      const widthInCells = 5 + Math.floor(Math.random() * 4);
      const heightInCells = 3 + Math.floor(Math.random() * 3);
      let x;
      let y;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        x = 90 + Math.random() * Math.max(1, size.width - 180);
        y = 100 + Math.random() * Math.max(1, size.height - 190);
        const clear = bugs.every(
          (bug) => Math.hypot(bug.x - x, bug.y - y) > 190,
        );
        if (clear) break;
      }

      const halfWidth = widthInCells * CELL_WIDTH * 0.5;
      const halfHeight = heightInCells * CELL_HEIGHT * 0.5;
      const bugCells = cells.filter(
        (cell) =>
          !cell.hidden &&
          !cell.bugId &&
          Math.abs(cell.x - x) <= halfWidth &&
          Math.abs(cell.y - y) <= halfHeight,
      );
      if (bugCells.length === 0) return;

      const id = ++bugSequence;
      bugCells.forEach((cell) => {
        cell.bugId = id;
        cell.character = randomCharacter();
      });
      const left =
        Math.min(...bugCells.map((cell) => cell.x)) - CELL_WIDTH * 0.5;
      const right =
        Math.max(...bugCells.map((cell) => cell.x)) + CELL_WIDTH * 0.5;
      const top =
        Math.min(...bugCells.map((cell) => cell.y)) - CELL_HEIGHT * 0.5;
      const bottom =
        Math.max(...bugCells.map((cell) => cell.y)) + CELL_HEIGHT * 0.5;
      bugs.push({
        id,
        x: (left + right) * 0.5,
        y: (top + bottom) * 0.5,
        bounds: { left, right, top, bottom },
        cells: bugCells,
        spawnedAt: time,
        lifetime: profile.bugLifetime,
        expiresAt: time + profile.bugLifetime,
        missPenalty: profile.missPenalty,
      });
      status = "BUG DETECTED";
      statusUntil = 0;
      wallDirty = true;
    }

    function publishGameState() {
      const nextState = {
        score,
        misses,
        level,
        maxLevel: MAX_LEVEL,
        levelProgress,
        levelTarget: FIXES_PER_LEVEL,
        maxMisses: MAX_MISSES,
        activeBugs: bugs.length + (heldBug ? 1 : 0),
        status,
        gameOver,
        gameOverMessage,
        gameWon,
        gameWonMessage: gameWon ? GAME_WON_MESSAGE : "",
      };
      const serialized = JSON.stringify(nextState);
      if (serialized === lastPublishedState) return;
      lastPublishedState = serialized;
      onGameStateChangeRef.current?.(nextState);
    }

    function clearActiveBugs(time) {
      bugs.forEach((bug) => {
        bug.cells.forEach((cell) => {
          cell.bugId = null;
          cell.character = randomCharacter();
          cell.nextChange = time + 250 + Math.random() * 1_200;
        });
      });
      bugs = [];
      heldBug = null;
      heldCharacters = [];
      wallDirty = true;
    }

    function endGame(time) {
      gameOver = true;
      gameOverMessage =
        GAME_OVER_MESSAGES[
          Math.floor(Math.random() * GAME_OVER_MESSAGES.length)
        ];
      status = "GAME OVER";
      statusUntil = Number.POSITIVE_INFINITY;
      nextBugAt = Number.POSITIVE_INFINITY;
      clearActiveBugs(time);
    }

    function completeGame(time) {
      gameWon = true;
      status = "SYSTEM CLEAN";
      statusUntil = Number.POSITIVE_INFINITY;
      nextBugAt = Number.POSITIVE_INFINITY;
      clearActiveBugs(time);
    }

    function restartGame(time) {
      clearActiveBugs(time);
      particles = [];
      score = 0;
      misses = 0;
      level = 1;
      levelProgress = 0;
      status = "HEALTHY";
      statusUntil = 0;
      gameOver = false;
      gameOverMessage = "";
      gameWon = false;
      gameStartedAt = time;
      nextBugAt = time + FIRST_BUG_DELAY;
      wallDirty = true;
      publishGameState();
    }

    function updateGame(time, tracked) {
      if (gameOver || gameWon) {
        publishGameState();
        return;
      }

      if (gameStartedAt === 0) {
        if (tracked) {
          gameStartedAt = time;
          nextBugAt = time + FIRST_BUG_DELAY;
          status = "HEALTHY";
        }
        publishGameState();
        return;
      }

      const expired = bugs.filter((bug) => time >= bug.expiresAt);
      if (expired.length > 0) {
        expired.forEach((bug) => {
          bug.cells.forEach((cell) => {
            cell.bugId = null;
            cell.character = randomCharacter();
          });
        });
        const expiredIds = new Set(expired.map((bug) => bug.id));
        bugs = bugs.filter((bug) => !expiredIds.has(bug.id));
        misses += expired.length;
        score -= expired.reduce(
          (total, bug) => total + bug.missPenalty,
          0,
        );
        levelProgress = 0;
        status = "BUG MISSED";
        statusUntil = time + 1_600;
        const profile = getLevelProfile(level);
        nextBugAt = Math.min(
          nextBugAt,
          time + profile.missRecoveryDelay,
        );
        wallDirty = true;

        if (misses >= MAX_MISSES) {
          endGame(time);
          publishGameState();
          return;
        }
      }

      const profile = getLevelProfile(level);
      const activeBugCount = bugs.length + (heldBug ? 1 : 0);
      if (time >= nextBugAt) {
        if (activeBugCount < profile.maxConcurrent) {
          spawnBug(time);
          nextBugAt = time + profile.spawnInterval;
        } else {
          nextBugAt = time + 300;
        }
      }

      if (!heldBug && time >= statusUntil) {
        status = bugs.length > 0 ? "BUG DETECTED" : "HEALTHY";
      }
      publishGameState();
    }

    function updateWall(time) {
      if (!wallDirty && time < nextWallFrame) return;

      if (Math.random() < 0.68) {
        const flashCount = Math.random() < 0.2 ? 2 : 1;
        for (let index = 0; index < flashCount; index += 1) {
          const cell = cells[Math.floor(Math.random() * cells.length)];
          if (cell && !cell.hidden && !cell.bugId) {
            cell.flashUntil = time + 120 + Math.random() * 260;
          }
        }
      }

      cells.forEach((cell) => {
        if (!cell.hidden && !cell.bugId && time >= cell.nextChange) {
          cell.character = randomCharacter();
          cell.nextChange = time + 120 + Math.random() * 1_500;
        }
      });

      wallContext.clearRect(0, 0, size.width, size.height);
      configureText(wallContext);
      wallContext.fillStyle = "rgba(255, 255, 255, 0.28)";
      cells.forEach((cell) => {
        if (!cell.hidden && !cell.bugId && cell.flashUntil <= time) {
          wallContext.fillText(cell.character, cell.x, cell.y);
        }
      });

      wallContext.fillStyle = "#39ff14";
      wallContext.shadowColor = "#39ff14";
      wallContext.shadowBlur = 7;
      cells.forEach((cell) => {
        if (!cell.hidden && !cell.bugId && cell.flashUntil > time) {
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
      particles.forEach((character) => {
        context.fillStyle = character.color || "#ffffff";
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

    function drawBugs(time) {
      configureText(context);
      bugs.forEach((bug) => {
        const remaining = Math.max(0, (bug.expiresAt - time) / bug.lifetime);
        const urgency = 1 - remaining;
        const pulse =
          0.9 +
          Math.sin(time * (0.006 + urgency * 0.012) + bug.id) * 0.1;

        bug.cells.forEach((cell, index) => {
          context.save();
          context.globalAlpha = pulse;
          context.fillStyle = BUG_COLORS[index % BUG_COLORS.length];
          context.shadowColor = context.fillStyle;
          context.shadowBlur = 12 + urgency * 10;
          context.fillText(cell.character, cell.x, cell.y);
          context.fillText(cell.character, cell.x, cell.y);
          context.restore();
        });
      });
    }

    function findNearestBug() {
      let nearest = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      bugs.forEach((bug) => {
        const distance = Math.hypot(cursor.x - bug.x, cursor.y - bug.y);
        if (distance < nearestDistance) {
          nearest = bug;
          nearestDistance = distance;
        }
      });
      return { bug: nearest, distance: nearestDistance };
    }

    function findHoveredBug() {
      return (
        bugs.find(
          (bug) =>
            cursor.x >= bug.bounds.left &&
            cursor.x <= bug.bounds.right &&
            cursor.y >= bug.bounds.top &&
            cursor.y <= bug.bounds.bottom,
        ) || null
      );
    }

    function drawProximityLink(nearest, hoveredBug, tracked, time) {
      if (
        !tracked ||
        !nearest.bug ||
        nearest.distance > PROXIMITY_DISTANCE ||
        heldBug ||
        hoveredBug
      ) {
        return;
      }

      const strength = 1 - nearest.distance / PROXIMITY_DISTANCE;
      const deltaX = nearest.bug.x - cursor.x;
      const deltaY = nearest.bug.y - cursor.y;
      const length = Math.max(1, Math.hypot(deltaX, deltaY));
      const normalX = -deltaY / length;
      const normalY = deltaX / length;
      const segments = 14;
      context.save();
      context.strokeStyle = `rgba(255, 45, 45, ${0.58 + strength * 0.4})`;
      context.lineWidth = 1.2 + strength * 1.5;
      context.shadowColor = "#ff2d2d";
      context.shadowBlur = 5 + strength * 7;
      context.beginPath();
      for (let index = 0; index <= segments; index += 1) {
        const progress = index / segments;
        const envelope = Math.sin(Math.PI * progress);
        const vibration =
          (Math.sin(time * 0.024 + index * 1.65) +
            Math.sin(time * 0.011 - index * 0.9) * 0.55) *
          (1.5 + strength * 2.8) *
          envelope;
        const x = cursor.x + deltaX * progress + normalX * vibration;
        const y = cursor.y + deltaY * progress + normalY * vibration;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.fillStyle = "#ff2d2d";
      context.beginPath();
      context.arc(
        nearest.bug.x,
        nearest.bug.y,
        2.5 + strength * 2.5,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();
    }

    function drawCursor(tracked, time) {
      if (!tracked) return;
      const grabbed = heldCharacters.length > 0;
      context.save();
      context.fillStyle = `rgba(0, 0, 0, ${cursor.fillOpacity})`;
      context.strokeStyle = grabbed
        ? GRAB_COLOR
        : "rgba(255, 255, 255, 0.92)";
      context.lineWidth = grabbed ? 1.5 : 0.75;
      context.shadowColor = grabbed ? GRAB_COLOR : "transparent";
      context.shadowBlur = grabbed ? 8 : 0;
      context.beginPath();
      context.arc(cursor.x, cursor.y, cursor.radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      if (grabbed) {
        context.shadowBlur = 4;
        context.globalAlpha = 0.86;
        context.lineWidth = 0.8;
        context.setLineDash([3, 5]);
        context.lineDashOffset = -time * 0.035;
        context.beginPath();
        context.arc(cursor.x, cursor.y, cursor.radius + 6, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }

    function isInteractionTargetHovered(tracked) {
      const target = interactionTargetRef?.current;
      if (!tracked || !target) return false;
      const bounds = target.getBoundingClientRect();
      return (
        cursor.x >= bounds.left &&
        cursor.x <= bounds.right &&
        cursor.y >= bounds.top &&
        cursor.y <= bounds.bottom
      );
    }

    function updateCursorAppearance(delta, hovered) {
      const targetRadius = hovered ? CURSOR_HOVER_RADIUS : CURSOR_RADIUS;
      const targetOpacity = hovered ? 0.38 : 1;
      const follow = Math.min(1, delta * 16);
      cursor.radius += (targetRadius - cursor.radius) * follow;
      cursor.fillOpacity += (targetOpacity - cursor.fillOpacity) * follow;
    }

    function updateCursorOverlay(tracked, source, hovered) {
      if (!cursorOverlay) return;

      const visible = pausedRef.current && tracked && source === "camera";
      cursorOverlay.classList.toggle("is-visible", visible);
      cursorOverlay.classList.toggle("is-hovering", visible && hovered);
      cursorOverlay.style.left = `${cursor.x}px`;
      cursorOverlay.style.top = `${cursor.y}px`;
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
      heldCharacters.forEach((character) => {
        context.fillStyle = character.color || "#ffffff";
        context.shadowColor = context.fillStyle;
        context.shadowBlur = 7;
        drawCharacter(context, character.character, character.x, character.y);
      });
      context.shadowBlur = 0;
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

      const interactionHovered = isInteractionTargetHovered(tracked);
      updateCursorOverlay(tracked, input.source, interactionHovered);

      if (pausedRef.current) {
        updateCursorAppearance(delta, interactionHovered);
        if (
          handClosed &&
          !wasClosed &&
          (input.source === "remote" ||
            (input.source === "camera" && interactionHovered))
        ) {
          onDismissRef.current?.();
        }
        wasClosed = handClosed;
        publishGameState();
        updateWall(time);

        context.fillStyle = "#000000";
        context.fillRect(0, 0, size.width, size.height);
        context.drawImage(wallCanvas, 0, 0, size.width, size.height);
        drawCursor(tracked, time);
        frameId = requestAnimationFrame(render);
        return;
      }

      const gameWasEnded = gameOver || gameWon;
      updateGame(time, tracked);
      if (
        gameWasEnded &&
        (gameOver || gameWon) &&
        handClosed &&
        !wasClosed
      ) {
        restartGame(time);
      }
      const nearest = findNearestBug();
      const hoveredBug = findHoveredBug();
      updateCursorAppearance(delta, Boolean(hoveredBug));

      if (
        !gameOver &&
        !gameWon &&
        handClosed &&
        !wasClosed &&
        nearest.bug &&
        nearest.distance <= PROXIMITY_DISTANCE
      ) {
        grabBug(nearest.bug, time);
      } else if (!gameOver && !gameWon && !handClosed && wasClosed) {
        releaseCharacters(time);
      }
      wasClosed = handClosed;

      updateWall(time);
      updateHeld(delta, time);
      updateParticles(delta, time);

      context.fillStyle = "#000000";
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(wallCanvas, 0, 0, size.width, size.height);
      drawBugs(time);
      drawProximityLink(nearest, hoveredBug, tracked, time);
      drawParticles(time);
      drawCursor(tracked, time);
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
      cursorOverlay?.classList.remove("is-visible", "is-hovering");
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [cursorOverlayRef, inputRef, interactionTargetRef]);

  return <canvas ref={canvasRef} className="ascii-field" />;
}
