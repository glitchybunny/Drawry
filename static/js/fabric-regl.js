/*
	picturephone
	fabric-regl.js
	a multiplayer art experiment by Glitch Taylor (rtay.io)
	this file extends upon fabric.js, providing an abstract webgl rendering layer using regl
*/
"use strict";

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const SHD_LINE_VERT = `
uniform float thickness;
uniform float width;
uniform float height;
uniform float scale;
attribute vec2 prevPos;
attribute vec2 currPos;
attribute vec2 nextPos;
attribute float offset;
void main() {
	// calculate normals
  vec2 dir = normalize(nextPos - prevPos);
  vec2 normal = vec2(-dir.y, dir.x) * thickness;
  
  // calculate and render line
  vec2 line = currPos + (normal * offset);
  line *= 2. * scale / vec2(width, -height); // scale to screen size
  line += vec2(-1., 1.); // correct offset
  gl_Position = vec4(line, 0., 1.);
}`;
const SHD_LINE_FRAG = `
precision mediump float;
uniform vec4 color;
void main() {
  gl_FragColor = color;
}`;

const buffer = {
	duplicate(buffer, stride) {
		const out = [];
		const component = new Array(stride * 2);
		for (let i = 0, il = buffer.length / stride; i < il; i++) {
			for (let j = 0; j < stride; j++) {
				const value = buffer[i * stride + j];
				component[j] = value;
				component[j + stride] = value;
			}
			out.push(...component);
		}
		return out;
	},
};

function createPositions(path) {
	let prev, positions;
	positions = [];

	// iterate over path and generate array of positions
	for (let i of path) {
		switch (i[0]) {
			case "M": // moveTo
			case "L": // lineto
				positions.push(i[1], i[2], i[1], i[2]); // push first and last twice
				prev = [i[1], i[2]];
				break;
			case "Q": // quadraticCurveTo
				// generate approximate midpoints along the quadratic bezier (for smoother lines)
				positions.push(
					prev[0] * 0.5625 + i[1] * 0.375 + i[3] * 0.0625,
					prev[1] * 0.5625 + i[2] * 0.375 + i[4] * 0.0625,
					prev[0] * 0.25 + i[1] * 0.5 + i[3] * 0.25,
					prev[1] * 0.25 + i[2] * 0.5 + i[4] * 0.25,
					prev[0] * 0.0625 + i[1] * 0.375 + i[3] * 0.5625,
					prev[1] * 0.0625 + i[2] * 0.375 + i[4] * 0.5625
				);

				// add positions
				positions.push(i[3], i[4]);
				prev = [i[3], i[4]];
				break;
		}
	}

	return positions;
}

const createPositionBuffer = (positions, points) => {
	let positionDup = new Float32Array(buffer.duplicate(positions, 2));
	return regl.buffer({
		usage: "static",
		type: "float",
		length: (points + 2) * 4 * FLOAT_BYTES,
		data: positionDup,
	});
};

const createOffsetBuffer = (points) => {
	let offset = new Array(points * 2).fill().map((v, i) => 1 - (i % 2) * 2); // alternating [1, -1, 1, -1, etc]
	return regl.buffer({
		usage: "static",
		type: "float",
		length: (points + 2) * 2 * FLOAT_BYTES,
		data: offset,
	});
};

const createLineMesh = (points) => {
	let buffer = [];
	for (let i = 0; i < (points - 1) * 2; i += 2) {
		buffer.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
	}
	return buffer;
};

// ShaderPath Class to render crisp lines using WebGL
class ShaderPath extends fabric.Path {
	constructor(path) {
		super();

		// copy attributes from path
		for (let _ of Object.keys(path)) {
			this[_] = path[_];
		}

		// precalculate positions, buffers, mesh, etc for rendering
		this._precalculatePath();
	}

	_precalculatePath() {
		let _positions, _points, _positionBuffer, _offsetBuffer, _lineMesh;
		_positions = createPositions(this.path);
		_points = _positions.length / 2 - 2;
		_positionBuffer = createPositionBuffer(_positions, _points);
		_offsetBuffer = createOffsetBuffer(_points);
		_lineMesh = createLineMesh(_points);

		this.attributes = {
			prevPos: {
				buffer: _positionBuffer,
				offset: 0,
				stride: FLOAT_BYTES * 2,
			},
			currPos: {
				buffer: _positionBuffer,
				offset: FLOAT_BYTES * 2 * 2,
				stride: FLOAT_BYTES * 2,
			},
			nextPos: {
				buffer: _positionBuffer,
				offset: FLOAT_BYTES * 2 * 4,
				stride: FLOAT_BYTES * 2,
			},
			offset: _offsetBuffer,
		};

		this.elements = regl.elements({
			primitive: "triangles",
			usage: "static",
			type: "uint16",
			data: _lineMesh,
		});
	}

	_renderPathCommands(ctx) {
		// drawing parameters
		let color, thickness, w, h;
		color = fabric.Color.fromHex(this.stroke)._source;
		thickness = this.strokeWidth / 2;
		w = CANVAS_3.width;
		h = CANVAS_3.height;

		// draw the line
		let render = regl({
			attributes: this.attributes,
			uniforms: {
				color: [color[0] / 255, color[1] / 255, color[2] / 255, 1],
				thickness: thickness,
				width: w,
				height: h,
				scale: w / 800,
			},
			elements: this.elements,
			vert: SHD_LINE_VERT,
			frag: SHD_LINE_FRAG,
			viewport: {
				x: 0,
				y: 0,
				width: w,
				height: h,
			},
		});
		render();

		// clean up render object nto free memory
		render.destroy();
		render = null;
	}
}
