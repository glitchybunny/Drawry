/*
	picturephone
	canvas_regl.js
	a multiplayer art experiment by Glitch Taylor (rtay.io)
	this file provides functionality to extend upon fabric.js, and provide a webgl rendering layer
*/
"use strict";

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const SHD_LINE_VERT = `
uniform float thickness;
attribute vec2 prevPos;
attribute vec2 currPos;
attribute vec2 nextPos;
attribute float offset;
void main() {
  vec2 dir = normalize(nextPos - prevPos);
  vec2 normal = vec2(-dir.y, dir.x) * thickness;
  normal.x *= 3./4.;
  gl_Position = vec4((currPos + normal*offset) / vec2(400., -300.) + vec2(-1., 1.), 0., 1.);
}`;
const SHD_LINE_FRAG = `
precision mediump float;
uniform vec4 color;
void main() {
  gl_FragColor = color;
}`;

function lineMesh(num) {
	let buffer = [];
	for (let i = 0; i < (num - 1) * 2; i += 2) {
		buffer.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
	}
	return buffer;
}

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

/*
// make canvas
const canvas = document.createElement("canvas");
canvas.width = 800;
canvas.height = 600;
document.body.appendChild(canvas);

const regl = wrapREGL({
	canvas: canvas,
	pixelRatio: 1,
	attributes: { antialias: false, preserveDrawingBuffer: true },
});

// compute line values
const positions = [
	137.24604966139955, 121.97990435513897, 138.14898419864562, 121.98490435513897,
	139.05191873589166, 122.88715948340288, 139.9548532731377, 135.5187312790978, 142.66365688487585,
	156.27059922916806, 145.372460496614, 174.3157017944465, 147.17832957110608, 195.06756974451673,
	151.69300225733633, 219.42845820764268, 156.2076749435666, 241.0825812859768, 158.01354401805867,
	259.12768385125526, 160.72234762979684, 273.56376590347804, 164.33408577878106, 282.5863171861173,
	167.94582392776522, 289.80435821222864, 174.26636568848758, 297.0223992383401, 180.58690744920995,
	302.4359300079236, 183.29571106094807, 305.1426953927154, 185.1015801354402, 306.94720564924324,
	187.81038374717832, 307.84946077750715, 190.5191873589165, 306.94720564924324, 194.13092550790068,
	304.2404402644515, 198.6455981941309, 298.8269094948679, 202.25733634311513, 290.7066133404926,
	204.06320541760724, 278.9772966730616, 204.96613995485328, 266.3457248773667, 206.77200902934538,
	253.71415308167178, 209.4808126410835, 242.8870915425047, 211.2866817155756, 234.76679538812937,
	212.18961625282168, 229.35326461854584, 213.99548532731376, 228.4510094902819, 216.70428893905193,
	231.1577748750737, 220.31602708803612, 238.3758159011851, 227.53950338600453, 249.20287744035215,
	234.7629796839729, 262.736704364311, 241.9864559819413, 278.07504154479767, 249.2099322799097,
	288.9021030839648, 252.82167042889392, 294.3156338535483, 256.43340857787814, 299.72916462313185,
	261.8510158013544, 306.94720564924324, 267.26862302483073, 313.2629915470907, 269.97742663656885,
	315.96975693188244, 271.78329571106093, 316.8720120601464, 275.39503386004515, 315.06750180361854,
	279.00677200902936, 310.5562261622989, 282.6185101580136, 303.3381851361875, 287.13318284424383,
	287.09759282743687, 289.84198645598195, 265.44346974910275, 293.45372460496617, 243.7893466707686,
	297.9683972911964, 223.03747872069835, 299.7742663656885, 204.9923761554199, 299.7742663656885,
	186.94727359014144, 299.7742663656885, 171.60893640965475, 299.7742663656885, 164.39089538354335,
	299.7742663656885, 160.78187487048768, 299.7742663656885, 158.0701094856959,
];
const POINTS = positions.length / 2;
buffer.pushElement(positions, POINTS - 1, 2);
buffer.unshiftElement(positions, 0, 2);

const positionsDup = new Float32Array(buffer.duplicate(positions, 2));
const positionBuffer = regl.buffer({
	usage: "static",
	type: "float",
	length: (POINTS + 2) * 4 * FLOAT_BYTES,
	data: positionsDup,
});

const offset = new Array(POINTS * 2).fill().map((v, i) => 1 - (i % 2) * 2); // alternating [1, -1, 1, -1, etc]
const offsetBuffer = regl.buffer({
	usage: "static",
	type: "float",
	length: (POINTS + 2) * 2 * FLOAT_BYTES,
	data: offset,
});

const mesh = lineMesh(POINTS);

// regl inputs
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
	color: [0.5, 0, 0.5, 1],
	thickness: 2.5,
};

const elements = regl.elements({
	primitive: "triangles",
	usage: "static",
	type: "uint16",
	data: mesh,
});

// render single frame
window.requestAnimationFrame(
	regl({
		attributes,
		uniforms,
		elements,
		vert,
		frag,
	})
);
*/
