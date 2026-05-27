// --- Basic setup ---------------------------------------------------------
const svg = document.getElementById('canvas');
const addBtn = document.getElementById('add');
const gridInput = document.getElementById('grid');
let GRID = Number(gridInput.value) || 40;

// Groups
const defs = create('defs');
svg.appendChild(defs);
const gridLayerRect = create('rect', { x: 0, y: 0, width: '100%', height: '100%' });
const edgesLayer = create('g', { id: 'edges' });
const nodesLayer = create('g', { id: 'nodes' });
svg.append(gridLayerRect, edgesLayer, nodesLayer);

// Arrow marker
const marker = create('marker', {
  id: 'arrow',
  viewBox: '0 0 10 10',
  refX: '10',
  refY: '5',
  markerWidth: '10',
  markerHeight: '10',
  orient: 'auto-start-reverse',
});
marker.appendChild(create('path', { d: 'M0 0 L10 5 L0 10 Z', fill: '#444' }));
defs.appendChild(marker);

// Grid patterns
function rebuildGrid() {
  // clear old patterns if any
  [...defs.querySelectorAll('pattern, #gridBg')].forEach((n) => n.remove());

  const half = GRID / 2;

  const small = create('pattern', {
    id: 'smallGrid',
    width: half,
    height: half,
    patternUnits: 'userSpaceOnUse',
  });
  small.appendChild(
    create('path', {
      d: `M ${half} 0 H 0 V ${half}`,
      fill: 'none',
      stroke: 'lightgray',
      'stroke-width': '0.5',
    })
  );

  const big = create('pattern', {
    id: 'bigGrid',
    width: GRID,
    height: GRID,
    patternUnits: 'userSpaceOnUse',
  });
  big.appendChild(create('rect', { width: GRID, height: GRID, fill: 'url(#smallGrid)' }));
  big.appendChild(
    create('path', {
      // d: `M 0 ${GRID / 4} V 0 H ${GRID / 4} M ${GRID / 4 * 3} 0 H ${GRID} V ${GRID / 4} M ${GRID} ${GRID / 4 * 3} V ${GRID} H ${GRID / 4 * 3} M ${GRID / 4} ${GRID} H 0 V ${GRID / 4 * 3}`,
      d: `M ${GRID} 0 H 0 V ${GRID}`,
      fill: 'none',
      stroke: '#c0c0c0',
      'stroke-width': '1',
    })
  );

  defs.append(small, big);
  gridLayerRect.setAttribute('fill', 'url(#bigGrid)');
}
rebuildGrid();

// --- Data model ----------------------------------------------------------
let nodeSeq = 1;
const nodes = new Map(); // id -> { id, x, y, w, h, g, rect, text }
const edges = []; // { from, to, line }

function addNode(x, y, label) {
  const id = `n${nodeSeq++}`;
  const w = 140;
  const h = 64;
  x = snap(x ?? 100 + nodes.size * 60, GRID);
  y = snap(y ?? 100 + nodes.size * 40, GRID);

  const g = create('g', { class: 'node', 'data-id': id, transform: `translate(${x},${y})` });
  const rect = create('rect', { width: w, height: h });
  const text = create('text', { x: w / 2, y: h / 2 + 5, 'text-anchor': 'middle' });
  text.textContent = label ?? `Node ${nodes.size + 1}`;
  g.append(rect, text);
  nodesLayer.appendChild(g);

  const n = { id, x, y, w, h, g, rect, text };
  nodes.set(id, n);
  return n;
}

function addEdge(fromId, toId) {
  if (!nodes.has(fromId) || !nodes.has(toId) || fromId === toId) return;
  const line = create('line', { class: 'edge', 'marker-end': 'url(#arrow)' });
  edgesLayer.appendChild(line);
  const e = { from: fromId, to: toId, line };
  edges.push(e);
  updateEdge(e);
}

// --- Geometry helpers ----------------------------------------------------
// Привязать значение к сетке
function snap(v, g = GRID) {
  return Math.round(v / g) * g;
}
function center(n) {
  return { cx: n.x + n.w / 2, cy: n.y + n.h / 2 };
}
function centerLeft(n) {
  return { cx: n.x, cy: n.y + n.h / 2 };
}
function centerRight(n) {
  return { cx: n.x + n.w, cy: n.y + n.h / 2 };
}

// Intersection point of line center->(tx,ty) with rectangle border
// function rectAnchor(n, tx, ty) {
//   const { cx, cy } = center(n);
//   const dx = tx - cx;
//   const dy = ty - cy;

//   if (dx === 0 && dy === 0) return { x: cx, y: cy };

//   const wx = n.w / 2;
//   const hy = n.h / 2;
//   const adx = Math.abs(dx);
//   const ady = Math.abs(dy);

//   let sx, sy;
//   if (adx / wx > ady / hy) {
//     // hit left/right side
//     sx = Math.sign(dx) * wx;
//     sy = dy * (wx / adx);
//   } else {
//     // hit top/bottom side
//     sy = Math.sign(dy) * hy;
//     sx = dx * (hy / ady);
//   }

//   return { x: cx + sx, y: cy + sy };
// }

function rectAnchor(n, tx, ty, type) {
  const { cx, cy } = center(n);
  const dx = tx - cx;
  const dy = ty - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const wx = n.w / 2;
  const hy = n.h / 2;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  let sx, sy;
  if (adx / wx > ady / hy) {
    // hit left/right side
    sx = Math.sign(dx) * wx;
    sy = dy * (wx / adx);
  } else {
    // hit top/bottom side
    sy = Math.sign(dy) * hy;
    sx = dx * (hy / ady);
  }

  return type === 'from' ? { x: cx + wx, y: cy } : { x: cx - wx, y: cy };
}

// screen -> svg coords
function clientToSvg(x, y) {
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const ctm = svg.getScreenCTM().inverse();
  return pt.matrixTransform(ctm);
}

// --- Rendering updates ---------------------------------------------------
function moveNode(id, x, y) {
  const n = nodes.get(id);
  n.x = x;
  n.y = y;
  n.g.setAttribute('transform', `translate(${x},${y})`);
  // update all edges touching this node
  edges.forEach((e) => {
    if (e.from === id || e.to === id) updateEdge(e);
  });
}

function updateEdge(e) {
  const a = nodes.get(e.from);
  const b = nodes.get(e.to);
  const { cx: ax, cy: ay } = center(a);
  const { cx: bx, cy: by } = center(b);
  const p1 = rectAnchor(a, bx, by, 'from');
  const p2 = rectAnchor(b, ax, ay, 'to');
  e.line.setAttribute('x1', p1.x);
  e.line.setAttribute('y1', p1.y);
  e.line.setAttribute('x2', p2.x);
  e.line.setAttribute('y2', p2.y);
}

// --- Interaction: drag with snap-to-grid --------------------------------
let drag = null; // { id, offsetX, offsetY, pointerId }
let connectFrom = null; // id of node awaiting connection

nodesLayer.addEventListener('pointerdown', (e) => {
  const g = e.target.closest('.node');
  if (!g) return;
  const id = g.dataset.id;

  // Shift+click toggles connect mode
  if (e.shiftKey) {
    if (!connectFrom) {
      connectFrom = id;
      g.classList.add('selected');
    } else if (connectFrom && connectFrom !== id) {
      addEdge(connectFrom, id);
      nodes.get(connectFrom).g.classList.remove('selected');
      connectFrom = null;
    } else {
      g.classList.remove('selected');
      connectFrom = null;
    }
    return;
  }

  // start drag
  const n = nodes.get(id);
  const p = clientToSvg(e.clientX, e.clientY);
  drag = {
    id,
    offsetX: p.x - n.x,
    offsetY: p.y - n.y,
    pointerId: e.pointerId,
  };
  g.setPointerCapture(e.pointerId);
});

nodesLayer.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = clientToSvg(e.clientX, e.clientY);
  const x = snap(p.x - drag.offsetX);
  const y = snap(p.y - drag.offsetY);
  moveNode(drag.id, x, y);
});

nodesLayer.addEventListener('pointerup', () => {
  drag = null;
});
nodesLayer.addEventListener('pointercancel', () => {
  drag = null;
});

// --- UI handlers ---------------------------------------------------------
addBtn.addEventListener('click', () => {
  const n = addNode(100 + Math.random() * 600, 100 + Math.random() * 400);
  // Ensure snap on creation
  moveNode(n.id, snap(n.x), snap(n.y));
});

gridInput.addEventListener('input', () => {
  GRID = Math.max(5, Number(gridInput.value) || 40);
  rebuildGrid();
  // snap all nodes to new grid
  nodes.forEach((n) => moveNode(n.id, snap(n.x), snap(n.y)));
});

// --- Utilities -----------------------------------------------------------
function create(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// --- Demo content --------------------------------------------------------
const A = addNode(120, 120, 'Start');
const B = addNode(420, 240, 'Process');
const C = addNode(720, 120, 'End');
addEdge(A.id, B.id);
addEdge(B.id, C.id);
