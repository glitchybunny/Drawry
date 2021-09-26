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

// initialize canvases
const CANVAS_1 = new fabric.Canvas("c", {
	isDrawingMode: true,
	backgroundColor: "#FFFFFF",
});
const CANVAS_2 = new fabric.Canvas("c2", {
	isDrawingMode: true,
	backgroundColor: "#FFFFFF",
});
CANVAS_1.freeDrawingBrush.width = CANVAS_2.freeDrawingBrush.width = 10;
CANVAS_1.freeDrawingBrush.color = CANVAS_2.freeDrawingBrush.color = "#f94f18";

// fabric doesn't let us use a webgl context on the canvas so we have to make another layer
const CANVAS_3 = byId("c3");
byId("c2").after(CANVAS_3);
const REGL = wrapREGL({
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
		VIEWPORT.width = _w;
		VIEWPORT.height = _h;

		let zoom = CANVAS_1.getZoom() * (_w / CANVAS_1.getWidth());
		CANVAS_1.setDimensions(VIEWPORT);
		CANVAS_2.setDimensions(VIEWPORT);
		CANVAS_1.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
		CANVAS_2.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
		CANVAS_3.width = VIEWPORT.width;
		CANVAS_3.height = VIEWPORT.height;
		_base.style.height = _h + "px";
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
