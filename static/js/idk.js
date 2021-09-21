/*
  tags: advanced

  <p>This example demonstrates rendering screen space projected lines
  from a technique described <a href="https://mattdesl.svbtle.com/drawing-lines-is-hard">here</a>.</p>

  <p>This technique requires each vertex to reference the previous and next vertex in the line;
  this example utilizes attribute byte offsets to share a single position buffer for all three
  of these attributes.</p>
*/
const { push, unshift } = Array.prototype;

const geometry = {
	polarCurve(buffer, howMany, polarFn) {
		const thetaMax = Math.PI * 2;
		for (let i = 0; i < howMany; i++) {
			const theta = (i / (howMany - 1)) * thetaMax;
			const radius = polarFn(theta, i);
			const x = Math.cos(theta) * radius;
			const y = Math.sin(theta) * radius;
			buffer.push(x, y);
		}
		return buffer;
	},
};

const links = {
	lineMesh(buffer, howMany, index) {
		for (let i = 0; i < howMany - 1; i++) {
			const a = index + i * 2;
			const b = a + 1;
			const c = a + 2;
			const d = a + 3;
			buffer.push(a, b, c, c, b, d);
		}
		return buffer;
	},
};

const buffer = {
	duplicate(buffer, stride, dupScale) {
		if (stride == null) stride = 1;
		if (dupScale == null) dupScale = 1;
		const out = [];
		const component = new Array(stride * 2);
		for (let i = 0, il = buffer.length / stride; i < il; i++) {
			const index = i * stride;
			for (let j = 0; j < stride; j++) {
				const value = buffer[index + j];
				component[j] = value;
				component[j + stride] = value * dupScale;
			}
			push.apply(out, component);
		}
		return out;
	},

	mapElement(buffer, elementIndex, stride, map) {
		for (let i = 0, il = buffer.length / stride; i < il; i++) {
			const index = elementIndex + i * stride;
			buffer[index] = map(buffer[index], index, i);
		}
		return buffer;
	},

	pushElement(buffer, elementIndex, stride) {
		const component = new Array(stride);
		const ai = elementIndex * stride;
		for (let i = 0; i < stride; i++) {
			component[i] = buffer[ai + i];
		}
		push.apply(buffer, component);
		return buffer;
	},

	unshiftElement(buffer, elementIndex, stride) {
		const component = new Array(stride);
		const ai = elementIndex * stride;
		for (let i = 0; i < stride; i++) {
			component[i] = buffer[ai + i];
		}
		unshift.apply(buffer, component);
		return buffer;
	},
};

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

const canvas = document.createElement("canvas");
canvas.width = 800;
canvas.height = 600;
const regl = wrapREGL({
	canvas: canvas,
	pixelRatio: 1,
	attributes: { antialias: false, preserveDrawingBuffer: true },
});

const POINTS = 200;
const POINTS_TOTAL = POINTS + 2;
const curve = geometry.polarCurve([], POINTS, (t) => Math.sin(2.5 * t) * 20);

const positions = curve.slice();
buffer.pushElement(positions, 0, 2);
buffer.unshiftElement(positions, POINTS - 1, 2);
const positionsDup = new Float32Array(buffer.duplicate(positions, 2));
const positionBuffer = regl.buffer({
	usage: "static",
	type: "float",
	length: POINTS_TOTAL * 4 * FLOAT_BYTES,
	data: positionsDup,
});

const offset = new Array(POINTS * 2).fill().map((v, i) => 1 - (i % 2) * 2); // alternating [1, -1, 1, -1, etc]
const offsetBuffer = regl.buffer({
	usage: "static",
	type: "float",
	length: POINTS_TOTAL * 2 * FLOAT_BYTES,
	data: offset,
});

const indices = links.lineMesh([], POINTS, 0);

const attributes = {
	prevPos: {
		buffer: positionBuffer,
		offset: 0,
		stride: FLOAT_BYTES * 2,
	},
	currPos: {
		buffer: positionBuffer,
		offset: FLOAT_BYTES * 2 * 2,
		stride: FLOAT_BYTES * 2,
	},
	nextPos: {
		buffer: positionBuffer,
		offset: FLOAT_BYTES * 2 * 4,
		stride: FLOAT_BYTES * 2,
	},
	offset: offsetBuffer,
};

const uniforms = {
	aspect: ({ viewportWidth, viewportHeight }) => viewportWidth / viewportHeight,
	color: [0.8, 0.5, 0, 1],
	thickness: 0.05,
};

const elements = regl.elements({
	primitive: "triangles",
	usage: "static",
	type: "uint16",
	data: indices,
});

// Vertex shader from https://mattdesl.svbtle.com/drawing-lines-is-hard
// The MIT License (MIT) Copyright (c) 2015 Matt DesLauriers
const vert = `
uniform float aspect;
uniform float thickness;
attribute vec2 prevPos;
attribute vec2 currPos;
attribute vec2 nextPos;
attribute float offset;
void main() {
  // starting point uses (next - current)
  vec2 dir = vec2(0.);
  if (currPos == prevPos) {
    dir = normalize(nextPos - currPos);
  } else {
    dir = normalize(currPos - prevPos);
  }
  vec2 normal = vec2(-dir.y, dir.x) * thickness;
  normal.x /= aspect;
  gl_Position = vec4((currPos + (normal * offset)), 0., 1.);
}`;

const frag = `
precision lowp float;
uniform vec4 color;
void main() {
  gl_FragColor = vec4(color.rgb, float(color.a > 0.));
}`;

const draw = regl({
	attributes,
	uniforms,
	elements,
	vert,
	frag,
});

regl.frame(({ tick }) => {
	regl.clear({
		color: [0.1, 0.1, 0.1, 1],
		depth: 1,
	});
	draw();
});

document.body.appendChild(canvas);

/*
function resizeCanvas() {
	canvas.width = document.body.clientWidth;
	canvas.height = document.body.clientHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
*/
