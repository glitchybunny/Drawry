/*
	picturephone
	fabric-regl.js
	a multiplayer art experiment by Glitch Taylor (rtay.io)
	this file extends upon fabric.js, providing an abstract webgl rendering layer using regl
*/
"use strict";

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

const mod = (a, n) => {
	return a - Math.floor(a / n) * n;
};

/// ANGLES
const Angle = {
	direction(cx, cy, ex, ey) {
		let theta;
		theta = (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI;
		return theta;
	},
	difference(a, b) {
		let diff = a - b;
		return mod(diff + 180, 360) - 180;
	},
};

/// BUFFERS
const Buffer = {
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

/// PATHS
const Path = {
	positions(p) {
		/// Gets array of positions to draw lines between
		let out, prev, pos;
		out = [];
		pos = [];

		// iterate over path and generate array of positions
		for (let i of p) {
			switch (i[0]) {
				case "M": // moveTo
				case "L": // lineto
					// add current position
					prev = [Math.round(i[1]), Math.round(i[2])];
					pos.push(...prev);
					break;
				case "Q": // quadraticCurveTo
					// generate approximate midpoints along quadratic bezier (for smoother lines)
					pos.push(
						prev[0] * 0.5625 + i[1] * 0.375 + i[3] * 0.0625,
						prev[1] * 0.5625 + i[2] * 0.375 + i[4] * 0.0625,
						Math.round(prev[0] * 0.25 + i[1] * 0.5 + i[3] * 0.25),
						Math.round(prev[1] * 0.25 + i[2] * 0.5 + i[4] * 0.25),
						prev[0] * 0.0625 + i[1] * 0.375 + i[3] * 0.5625,
						prev[1] * 0.0625 + i[2] * 0.375 + i[4] * 0.5625
					);

					// also add current position
					prev = [Math.round(i[3]), Math.round(i[4])];
					pos.push(...prev);
					break;
			}
		}

		// optimise line by removing close sequential points
		out.push(pos[0], pos[1], pos[0], pos[1]);
		for (let i = 2; i < pos.length; i += 2) {
			let dx = Math.abs(out[out.length - 2] - pos[i]);
			let dy = Math.abs(out[out.length - 1] - pos[i + 1]);
			if (dx > 1 || dy > 1) {
				out.push(pos[i], pos[i + 1]);
			}
		}
		out.push(pos[pos.length - 2], pos[pos.length - 1], pos[pos.length - 2], pos[pos.length - 1]);

		return out;
	},
	corners(pos) {
		/// Finds sharp corners of a positions array
		let out = [{ offset: pos.slice(0, 2) }, { offset: pos.slice(pos.length - 2, pos.length) }];
		let dir, dirPrev;

		// loop through all positions in the path and find big angle changes
		for (let i = 0; i < pos.length - 2; i += 2) {
			// calculate angle
			dir = Angle.direction(pos[i], pos[i + 1], pos[i + 2], pos[i + 3]);
			if (dirPrev !== undefined) {
				// determine difference between last two angles
				let diff = Math.abs(Angle.difference(dir, dirPrev));
				if (diff > 45) {
					out.push({ offset: pos.slice(i, i + 2) });
				}
			}
			dirPrev = dir;
		}
		return out;
	},
	positionBuffer(pos, n) {
		/// Creates a buffer containing line positions
		return REGL.buffer({
			usage: "static",
			type: "float",
			length: (n + 2) * 4 * FLOAT_BYTES,
			data: new Float32Array(Buffer.duplicate(pos, 2)),
		});
	},
	offsetBuffer(n) {
		// Creates a buffer containing alternating values [1, -1, 1, -1, etc]
		return REGL.buffer({
			usage: "static",
			type: "float",
			length: (n + 2) * 2 * FLOAT_BYTES,
			data: new Array(n * 2).fill().map((v, i) => 1 - (i % 2) * 2),
		});
	},
	mesh(n) {
		const out = [];
		for (let i = 0; i < (n - 1) * 2; i += 2) {
			out.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
		}
		return out;
	},
};

class ShaderPath extends fabric.Path {
	// ShaderPath Class to render crisp lines using WebGL
	constructor(pathObject) {
		super();

		// copy attributes from path
		for (let _ of Object.keys(pathObject)) {
			this[_] = pathObject[_];
		}

		// line color
		let colorSrc = fabric.Color.fromHex(this.stroke)._source;
		this.color = [colorSrc[0] / 255, colorSrc[1] / 255, colorSrc[2] / 255, 1];

		// line caps
		let sides = this.strokeWidth > 10 ? 16 : 8;
		this._drawCircles = Circle.prerender(this.strokeWidth / 2, sides, this.color);

		// preprocess path for rendering
		this._calculatePath();
		this._drawPath = this.prerender();
	}

	_calculatePath() {
		// Convert positions to be more useful for rendering
		let positions = Path.positions(this.path);
		let size = positions.length / 2 - 2;

		// Find corners
		this.corners = Path.corners(positions);

		// Generate buffers, mesh, etc
		let positionBuffer = Path.positionBuffer(positions, size);
		let offsetBuffer = Path.offsetBuffer(size);
		let mesh = Path.mesh(size);

		// Rendering arguments
		this.attributes = {
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
		this.uniforms = {
			color: this.color,
			thickness: this.strokeWidth / 2,
			display: REGL.prop("display"),
		};
		this.elements = REGL.elements({
			primitive: "triangles",
			usage: "static",
			type: "uint16",
			data: mesh,
		});
	}

	prerender() {
		return REGL({
			attributes: this.attributes,
			uniforms: this.uniforms,
			elements: this.elements,
			vert: SHD_LINE_VERT,
			frag: SHD_FRAG,
			viewport: REGL.prop("viewport"),
			depth: { func: "always" },
		});
	}

	render() {
		// draw circles/end caps
		this.corners.forEach((obj) => {
			obj.viewport = VIEWPORT;
			obj.display = [VIEWPORT.width, VIEWPORT.height];
		});
		this._drawCircles(this.corners);

		// draw path
		this._drawPath({
			viewport: VIEWPORT,
			display: [VIEWPORT.width, VIEWPORT.height],
		});
	}
}

/// CIRCLES
const Circle = {
	mesh(r, n) {
		const out = [[0, 0]];
		let step = (2 * Math.PI) / n;
		for (let i = 0; i <= n; i++) {
			out.push([Math.sin(i * step) * r, Math.cos(i * step) * r]);
		}
		return out;
	},

	prerender(radius, sides, color) {
		const mesh = this.mesh(radius, sides);
		return REGL({
			attributes: {
				position: mesh,
			},
			uniforms: {
				color: color,
				offset: REGL.prop("offset"),
				display: REGL.prop("display"),
			},
			vert: SHD_CIRCLE_VERT,
			frag: SHD_FRAG,
			viewport: REGL.prop("viewport"),
			primitive: "triangle fan",
			count: mesh.length,
			depth: { func: "always" },
		});
	},
};

/// SHADERS
// Default shaders (accounting for screen space)
const SHD_FRAG = `
precision mediump float;
uniform vec4 color;
void main() {
  gl_FragColor = color;
}`;

// Line shader
const SHD_LINE_VERT = `
precision mediump float;
uniform float thickness;
uniform vec2 display;
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
  line *= 2. * (display.x/800.) / vec2(display.x, -display.y); // scale to screen size
  line += vec2(-1., 1.); // correct offset
  gl_Position = vec4(line, 0., 1.);
}`;

// Circle shader
const SHD_CIRCLE_VERT = `
precision mediump float;
uniform vec2 offset;
uniform vec2 display;
attribute vec2 position;
void main () {
	vec2 pos = position + offset;
	pos *= 2. * (display.x/800.) / vec2(display.x, -display.y); // scale to screen size
	pos += vec2(-1., 1.); // correct offset
  gl_Position = vec4(pos, 0, 1);
}`;

/// OVERRIDES
// hooks into fabric.Canvas to override/extend functions that make integration easier
const hookREGL = (fabricCanvas) => {
	fabricCanvas.renderAll = (function (_super) {
		// extend fabric.Canvas.renderAll(); to clear and render the WebGL canvas
		return function () {
			// Clear context
			REGL.clear({ color: DRAW.backgroundColor, depth: 1, stencil: 0 });

			// Render objects
			this._renderObjects(this.contextContainer, this._objects);

			// No need to call original renderer AFAIK
			// But it might be necessary if other tools are added
			//return _super.apply(this, arguments);

			return this;
		};
	})(fabricCanvas.renderAll);
};
