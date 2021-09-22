/*
	picturephone
	canvas_test.js
	a multiplayer art experiment by Glitch Taylor (rtay.io)
	this file is responsible for all the custom drawing/canvas logic
*/
"use strict";
const { push, unshift } = Array.prototype;
const byId = (id) => {
	return document.getElementById(id);
};
const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

function duplicateBuffer(buffer, stride, dupScale) {
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
}

function lineMesh(num) {
	let buffer = [];
	for (let i = 0; i < (num - 1) * 2; i += 2) {
		buffer.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
	}
	return buffer;
}

class ShaderPath extends fabric.Path {
	_renderPathCommands(ctx) {
		/*
		let current, subPathStartX, subPathStartY, x, y, controlX, controlY, l, t;
		subPathStartX = 0;
		subPathStartY = 0;
		x = 0;
		y = 0;
		controlX = 0;
		controlY = 0;
		l = -this.pathOffset.x;
		t = -this.pathOffset.y;

		ctx.beginPath();

		for (var i = 0, len = this.path.length; i < len; ++i) {
			current = this.path[i];

			switch (current[0]) {
				case "L": // lineto, absolute
					x = current[1];
					y = current[2];
					ctx.lineTo(x + l, y + t);
					break;

				case "M": // moveTo, absolute
					x = current[1];
					y = current[2];
					subPathStartX = x;
					subPathStartY = y;
					ctx.moveTo(x + l, y + t);
					break;

				case "C": // bezierCurveTo, absolute
					x = current[5];
					y = current[6];
					controlX = current[3];
					controlY = current[4];
					ctx.bezierCurveTo(
						current[1] + l,
						current[2] + t,
						controlX + l,
						controlY + t,
						x + l,
						y + t
					);
					break;

				case "Q": // quadraticCurveTo, absolute
					ctx.quadraticCurveTo(current[1] + l, current[2] + t, current[3] + l, current[4] + t);
					x = current[3];
					y = current[4];
					controlX = current[1];
					controlY = current[2];
					break;

				case "z":
				case "Z":
					x = subPathStartX;
					y = subPathStartY;
					ctx.closePath();
					break;
			}
		}*/
		// get positions of path
		let positions = [];
		for (let i of this.path) {
			switch (i[0]) {
				case "M":
				case "L":
					positions.push(i[1], i[2], i[1], i[2]); // push first and last twice
					break;
				case "Q":
					positions.push(i[3], i[4]);
					break;
			}
		}
		let points = positions.length / 2 - 2;

		// create buffers
		let positionsDup = new Float32Array(duplicateBuffer(positions, 2));
		let positionBuffer = regl.buffer({
			usage: "static",
			type: "float",
			length: (points + 2) * 4 * FLOAT_BYTES,
			data: positionsDup,
		});

		let offset = new Array(points * 2).fill().map((v, i) => 1 - (i % 2) * 2); // alternating [1, -1, 1, -1, etc]
		let offsetBuffer = regl.buffer({
			usage: "static",
			type: "float",
			length: (points + 2) * 2 * FLOAT_BYTES,
			data: offset,
		});

		let _color = fabric.Color.fromHex(this.stroke)._source;

		window.requestAnimationFrame(
			regl({
				attributes: {
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
				},
				uniforms: {
					color: [_color[0] / 255, _color[1] / 255, _color[2] / 255, 1],
					thickness: this.strokeWidth / 2 + 0.5,
				},
				elements: regl.elements({
					primitive: "triangles",
					usage: "static",
					type: "uint16",
					data: lineMesh(points),
				}),
				vert: `
uniform float thickness;
attribute vec2 prevPos;
attribute vec2 currPos;
attribute vec2 nextPos;
attribute float offset;
void main() {
  vec2 dir = normalize(nextPos - prevPos);
  vec2 normal = vec2(-dir.y, dir.x) * thickness;
  normal.x *= 3./4.;
  vec2 line = currPos + normal*offset;
  line /= vec2(400., 300.); // scale to screen
  line.y *= -1.; // flip vertically
  line += vec2(-1., 1); // move into position
  gl_Position = vec4(line, 0., 1.);
}`,
				frag: `
precision highp float;
uniform vec4 color;
void main() {
  gl_FragColor = color;
}`,
			})
		);
	}
}

function toShaderPath(path) {
	let sPath = new ShaderPath();
	for (let k of Object.keys(path)) {
		sPath[k] = path[k];
	}
	return sPath;
}

// initialize canvases
const CANVAS_1 = new fabric.Canvas("c", {
	isDrawingMode: true,
	backgroundColor: "#FFFFFF",
});
const CANVAS_2 = new fabric.Canvas("c2", {
	isDrawingMode: true,
	backgroundColor: "#FFFFFF",
});
CANVAS_1.freeDrawingBrush.width = CANVAS_2.freeDrawingBrush.width = 5;
CANVAS_1.freeDrawingBrush.color = CANVAS_2.freeDrawingBrush.color = "#123456";

// fabric doesn't let us use a webgl context on the canvas so we have to make another layer
// todo: see if you can just draw on that layer
const CANVAS_3 = byId("c3");
const regl = wrapREGL({
	canvas: CANVAS_3,
	pixelRatio: 1,
	attributes: { antialias: false, preserveDrawingBuffer: true },
});

// auto resize canvas
function resizeCanvas() {
	// Get base image of canvas
	let _base = byId("canvasBase");
	_base.style.height = "";

	// Make dimensions and ensure ratio is correct (sometimes gets weird in chrome)
	let _w = _base.scrollWidth,
		_h = _base.scrollHeight;
	let _ratio = ((_h / _w) * 3) / 4;
	if (_ratio <= 0.99 || _ratio >= 1.01) {
		// disproportionate, change height to compensate
		_h = (_w * 3) / 4;
	}

	// Resize canvas
	if (_w) {
		let zoom = CANVAS_1.getZoom() * (_w / CANVAS_1.getWidth());
		CANVAS_1.setDimensions({ width: _w, height: _h });
		CANVAS_2.setDimensions({ width: _w, height: _h });
		CANVAS_1.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
		CANVAS_2.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
		_base.style.height = _h + "px";
	}
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// copy drawings between canvases
CANVAS_1.on("path:created", (obj) => {
	// add Path to CANVAS_1 (implicit)

	// make duplicate ShaderPath on CANVAS_2
	let path = toShaderPath(obj.path);
	CANVAS_2.add(path);
});
CANVAS_2.on("path:created", (obj) => {
	// add Path to CANVAS_1
	CANVAS_1.add(obj.path);

	// make duplicate ShaderPath on CANVAS_2
	let path = toShaderPath(obj.path);
	CANVAS_2.add(path);

	// delete invisible path
	CANVAS_2.remove(obj.path);
});
