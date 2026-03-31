import fs from "node:fs/promises";
import { Chess } from "chess.js";

const user = process.env.LICHESS_USER || "marwinwijaya";
const token = process.env.CHESS_TOKEN || "";
const output = "metrics-chess.svg";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pieceLabel(piece) {
  const map = {
    p: "P",
    n: "N",
    b: "B",
    r: "R",
    q: "Q",
    k: "K",
  };
  return map[piece.type] || "?";
}

function boardStatesFromPgn(pgn) {
  const parsed = new Chess();
  parsed.loadPgn(pgn);
  const replay = new Chess();
  const history = parsed.history();
  const states = [replay.board()];

  for (const move of history) {
    replay.move(move);
    states.push(replay.board());
  }

  return { history, states };
}

function resultText(game, userLogin) {
  const white = game.players?.white?.user?.name || "White";
  const black = game.players?.black?.user?.name || "Black";
  const winner = game.winner;
  const lower = userLogin.toLowerCase();

  const userColor =
    white.toLowerCase() === lower
      ? "white"
      : black.toLowerCase() === lower
        ? "black"
        : null;

  if (!userColor) return "Latest game found";
  if (!winner) return `Draw as ${userColor}`;
  return winner === userColor ? `Win as ${userColor}` : `Loss as ${userColor}`;
}

function renderResultBadge(resultLabel) {
  let text = "DRAW";
  let fill = "#d29922";

  if (resultLabel.startsWith("Win")) {
    text = "WIN";
    fill = "#2ea043";
  } else if (resultLabel.startsWith("Loss")) {
    text = "LOSS";
    fill = "#da3633";
  }

  const width = text === "DRAW" ? 84 : 78;
  const x = 800 - width - 28;

  return `
  <g>
    <rect x="${x}" y="28" width="${width}" height="34" rx="17" fill="${fill}"/>
    <text x="${x + width / 2}" y="50" text-anchor="middle" fill="#f0f6fc" font-size="15" font-weight="700" font-family="'Segoe UI', Arial, sans-serif">${text}</text>
  </g>`;
}

function renderBoard(states) {
  const boardX = 32;
  const boardY = 144;
  const square = 42;
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const frames = states.slice(0, 14);
  const frameDuration = 1.2;

  let squares = "";
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const isLight = (rank + file) % 2 === 0;
      const x = boardX + file * square;
      const y = boardY + rank * square;
      squares += `<rect x="${x}" y="${y}" width="${square}" height="${square}" fill="${isLight ? "#f0d9b5" : "#b58863"}"/>`;
    }
  }

  let labels = "";
  for (let i = 0; i < 8; i++) {
    labels += `<text x="${boardX + i * square + 16}" y="${boardY + 352}" fill="#8b949e" font-size="12" font-family="'Segoe UI', Arial, sans-serif">${files[i]}</text>`;
    labels += `<text x="${boardX - 16}" y="${boardY + i * square + 26}" fill="#8b949e" font-size="12" font-family="'Segoe UI', Arial, sans-serif">${8 - i}</text>`;
  }

  const layers = frames.map((state, index) => {
    let pieces = "";

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = state[rank][file];
        if (!piece) continue;

        const cx = boardX + file * square + 21;
        const cy = boardY + rank * square + 21;
        const fill = piece.color === "w" ? "#f8fafc" : "#0f172a";
        const stroke = piece.color === "w" ? "#94a3b8" : "#e2e8f0";
        const textFill = piece.color === "w" ? "#0f172a" : "#f8fafc";

        pieces += `<g>
  <circle cx="${cx}" cy="${cy}" r="15" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
  <text x="${cx}" y="${cy + 6}" text-anchor="middle" fill="${textFill}" font-size="16" font-weight="700" font-family="'Segoe UI', Arial, sans-serif">${pieceLabel(piece)}</text>
</g>`;
      }
    }

    const begin = (index * frameDuration).toFixed(2);
    const dur = frameDuration.toFixed(2);
    const animationValues = index === frames.length - 1 ? "0;1;1" : "0;1;0";

    return `<g opacity="${index === 0 ? "1" : "0"}">
  ${pieces}
  <animate attributeName="opacity" values="${animationValues}" keyTimes="0;0.08;1" dur="${dur}s" begin="${begin}s" fill="freeze"/>
</g>`;
  }).join("\n");

  return `
  <g>
    <rect x="${boardX - 10}" y="${boardY - 10}" width="356" height="356" rx="14" fill="#161b22" stroke="#30363d"/>
    ${squares}
    ${labels}
    ${layers}
  </g>`;
}

function renderMoves(history) {
  const containerX = 408;
  const containerY = 134;
  const containerWidth = 360;
  const moveRows = [];

  for (let i = 0; i < history.length && moveRows.length < 20; i += 2) {
    const turn = Math.floor(i / 2) + 1;
    const white = history[i] || "";
    const black = history[i + 1] || "";
    moveRows.push(`${turn}. ${white} ${black}`.trim());
  }

  const leftRows = moveRows.slice(0, 10);
  const rightRows = moveRows.slice(10, 20);
  const rowCount = Math.max(leftRows.length, rightRows.length, 1);
  const rowHeight = 24;
  const headerHeight = 52;
  const paddingBottom = 20;
  const containerHeight = headerHeight + rowCount * rowHeight + paddingBottom;
  const leftX = containerX + 22;
  const rightX = containerX + 194;

  const leftColumn = leftRows.map((line, index) => {
    const y = containerY + 60 + index * rowHeight;
    return `<text x="${leftX}" y="${y}" fill="#c9d1d9" font-size="16" font-family="'Segoe UI', Arial, sans-serif">${escapeHtml(line)}</text>`;
  }).join("\n      ");

  const rightColumn = rightRows.map((line, index) => {
    const y = containerY + 60 + index * rowHeight;
    return `<text x="${rightX}" y="${y}" fill="#c9d1d9" font-size="16" font-family="'Segoe UI', Arial, sans-serif">${escapeHtml(line)}</text>`;
  }).join("\n      ");

  return {
    bottomY: containerY + containerHeight,
    svg: `
    <g>
      <rect x="${containerX}" y="${containerY}" width="${containerWidth}" height="${containerHeight}" rx="16" fill="#161b22" stroke="#30363d"/>
      <text x="${containerX + 22}" y="${containerY + 32}" fill="#f0f6fc" font-size="20" font-weight="700" font-family="'Segoe UI', Arial, sans-serif">Moves</text>
      <line x1="${containerX + 20}" y1="${containerY + 44}" x2="${containerX + containerWidth - 20}" y2="${containerY + 44}" stroke="#30363d"/>
      <line x1="${containerX + 180}" y1="${containerY + 56}" x2="${containerX + 180}" y2="${containerY + containerHeight - 16}" stroke="#30363d"/>
      ${leftColumn}
      ${rightColumn}
    </g>`,
  };
}

function renderSummary({ resultLabel, speed, variant, opening, players, startY }) {
  return {
    bottomY: startY + 52,
    svg: `
    <g>
      <text x="32" y="${startY}" fill="#c9d1d9" font-size="16" font-family="'Segoe UI', Arial, sans-serif">${escapeHtml(`${resultLabel} | ${speed} | ${variant}`)}</text>
      <text x="32" y="${startY + 26}" fill="#c9d1d9" font-size="16" font-family="'Segoe UI', Arial, sans-serif">${escapeHtml(`Opening: ${opening}`)}</text>
      <text x="32" y="${startY + 52}" fill="#8b949e" font-size="15" font-family="'Segoe UI', Arial, sans-serif">${escapeHtml(players)}</text>
    </g>`,
  };
}

function renderSvg({
  subtitle,
  history,
  states,
  footer,
  resultLabel,
  speed,
  variant,
  opening,
  players,
  accent = "#2ea043",
}) {
  const moves = renderMoves(history);
  const boardBottomY = 490;
  const sectionBottomY = Math.max(boardBottomY, moves.bottomY);
  const summaryStartY = sectionBottomY + 40;
  const summary = renderSummary({ resultLabel, speed, variant, opening, players, startY: summaryStartY });
  const dividerY = summary.bottomY + 34;
  const footerY = dividerY + 26;
  const svgHeight = footerY + 30;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="${svgHeight}" viewBox="0 0 800 ${svgHeight}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Last Chess Game</title>
  <desc id="desc">${escapeHtml(subtitle)}</desc>

  <rect width="800" height="${svgHeight}" rx="20" fill="#0d1117"/>
  <rect x="1" y="1" width="798" height="${svgHeight - 2}" rx="19" stroke="#30363d"/>

  <rect x="24" y="24" width="8" height="${svgHeight - 48}" rx="4" fill="${accent}"/>

  <text x="52" y="62" fill="#f0f6fc" font-size="30" font-weight="700" font-family="'Segoe UI', Arial, sans-serif">
    Last Chess Game
  </text>
  <text x="52" y="92" fill="#8b949e" font-size="18" font-family="'Segoe UI', Arial, sans-serif">
    ${escapeHtml(subtitle)}
  </text>

  ${renderResultBadge(resultLabel)}
  ${renderBoard(states)}
  ${moves.svg}
  ${summary.svg}

  <line x1="32" y1="${dividerY}" x2="768" y2="${dividerY}" stroke="#30363d"/>
  <text x="32" y="${footerY}" fill="#8b949e" font-size="14" font-family="'Segoe UI', Arial, sans-serif">
    ${escapeHtml(footer)}
  </text>
</svg>
`;
}

async function fetchLatestGame() {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=1&tags=true&clocks=false&evals=false&opening=true&pgnInJson=true`;

  const headers = {
    Accept: "application/x-ndjson",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Lichess API returned ${response.status}`);
  }

  const body = await response.text();
  const line = body.split("\n").find((entry) => entry.trim());

  if (!line) {
    throw new Error("No game data returned");
  }

  const game = JSON.parse(line);

  if (!game.pgn || typeof game.pgn !== "string") {
    throw new Error("PGN missing from Lichess response");
  }

  return game;
}

function renderFallback(message) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="260" viewBox="0 0 800 260" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Last Chess Game</title>
  <desc id="desc">Chess data unavailable</desc>
  <rect width="800" height="260" rx="20" fill="#0d1117"/>
  <rect x="1" y="1" width="798" height="258" rx="19" stroke="#30363d"/>
  <rect x="24" y="24" width="8" height="212" rx="4" fill="#d29922"/>
  <text x="52" y="62" fill="#f0f6fc" font-size="30" font-weight="700" font-family="'Segoe UI', Arial, sans-serif">Last Chess Game</text>
  <text x="52" y="100" fill="#c9d1d9" font-size="18" font-family="'Segoe UI', Arial, sans-serif">Chess data is temporarily unavailable.</text>
  <text x="52" y="132" fill="#c9d1d9" font-size="18" font-family="'Segoe UI', Arial, sans-serif">The README remains stable even if the API or token fails.</text>
  <text x="52" y="164" fill="#c9d1d9" font-size="18" font-family="'Segoe UI', Arial, sans-serif">Check the Metrics (Chess) workflow logs for details.</text>
  <text x="52" y="208" fill="#8b949e" font-size="15" font-family="'Segoe UI', Arial, sans-serif">${escapeHtml(message)}</text>
</svg>
`;
}

async function main() {
  try {
    const game = await fetchLatestGame();

    const white = game.players?.white?.user?.name || "White";
    const black = game.players?.black?.user?.name || "Black";
    const whiteElo = game.players?.white?.rating ? ` (${game.players.white.rating})` : "";
    const blackElo = game.players?.black?.rating ? ` (${game.players.black.rating})` : "";
    const opening = game.opening?.name || "Opening unavailable";

    const { history, states } = boardStatesFromPgn(game.pgn);
    const resultLabel = resultText(game, user);

    const speed = game.speed || "unknown";
    const variant = game.variant || "standard";
    const players = `${white}${whiteElo} vs ${black}${blackElo}`;
    const footer = `Status: ${game.status || "unknown"} | Game ID: ${game.id || "unknown"}`;

    const svg = renderSvg({
      subtitle: `Lichess profile: ${user}`,
      history,
      states,
      footer,
      resultLabel,
      speed,
      variant,
      opening,
      players,
    });

    await fs.writeFile(output, svg, "utf8");
  } catch (error) {
    await fs.writeFile(
      output,
      renderFallback(`Last update attempt failed: ${error.message}`),
      "utf8"
    );
    process.exitCode = 0;
  }
}

await main();
