/*
	picturephone
	canvas_test.js
	a multiplayer art experiment by Glitch Taylor (rtay.io)
	this file is for testing custom drawing/canvas logic
*/
"use strict";

const byId = (id) => {
	return document.getElementById(id);
};

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
		_positions = this._precalculatePositions(this.path);
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

	_precalculatePositions(path) {
		let prev, positions;
		prev = [0, 0];
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

byId("c2").after(CANVAS_3);
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
		_h = Math.floor((_w * 3) / 4);
	}

	// Resize canvas
	if (_w) {
		let zoom = CANVAS_1.getZoom() * (_w / CANVAS_1.getWidth());
		CANVAS_1.setDimensions({ width: _w, height: _h });
		CANVAS_2.setDimensions({ width: _w, height: _h });
		CANVAS_1.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
		CANVAS_2.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
		_base.style.height = _h + "px";

		CANVAS_3.width = _w;
		CANVAS_3.height = _h;
	}
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// copy drawings between canvases
CANVAS_1.on("path:created", (obj) => {
	// add path
	CANVAS_2.add(new ShaderPath(obj.path));
});
CANVAS_2.on("path:created", (obj) => {
	// add paths
	CANVAS_1.add(obj.path);
	CANVAS_2.add(new ShaderPath(obj.path));

	// remove duplicate path
	CANVAS_2.remove(obj.path);
});
