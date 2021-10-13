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

/// OVERRIDES
// hooks into fabric.Canvas to override/extend functionality for shaders
const hookREGL = (fabricCanvas) => {
	// extends fabric.Canvas.clear(); to clear the WebGL canvas too
	fabricCanvas.clear = (function (_super) {
		return function () {
			// Clear context
			REGL.clear({ color: [1, 1, 1, 1], depth: 1, stencil: 0 });

			// Delete objects to free memory
			this._objects.forEach((o) => {
				o.dispose();
			});
			this._objects = [];

			// Return
			return this;
		};
	})(fabricCanvas.clear);

	// extends fabric.Canvas.renderAll(); to clear and render the WebGL canvas
	fabricCanvas.renderAll = (function (_super) {
		return function () {
			// Clear context
			REGL.clear({ color: [1, 1, 1, 1], depth: 1, stencil: 0 });

			// Render objects
			this._objects.forEach((o) => {
				o && o.render(this.contextContainer);
			});

			// Return
			return this;
		};
	})(fabricCanvas.renderAll);
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

	dispose() {
		// Clean up object
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

/// IMAGES
class ShaderImage extends fabric.Image {
	constructor(element, options) {
		super(element, options);

		this._texture = REGL.texture({
			data: this._element,
		});

		this._drawImage = this.prerender();
	}

	prerender() {
		// prerender/compile image and shaders
		return REGL({
			frag: SHD_IMAGE_FRAG,
			vert: SHD_IMAGE_VERT,
			attributes: {
				position: [
					[0, 0],
					[0, 1],
					[1, 1],
					[0, 0],
					[1, 1],
					[1, 0],
				],
			},
			uniforms: {
				texture: this._texture,
				bounds: [
					this.left / VIEWPORT.width,
					this.right / VIEWPORT.width,
					this.top / VIEWPORT.height,
					this.bottom / VIEWPORT.height,
				],
			},
			viewport: REGL.prop("viewport"),
			depth: { func: "always" },
			count: 6,
		});
	}

	render() {
		// draw the image
		this._drawImage({
			viewport: VIEWPORT,
		});
	}

	static fromURL(url, callback, imgOptions) {
		fabric.util.loadImage(
			url,
			function (img, isError) {
				callback && callback(new ShaderImage(img, imgOptions), isError);
			},
			null,
			imgOptions && imgOptions.crossOrigin
		);
	}

	dispose() {
		// Clean up object
		fabric.Image.prototype.dispose.call(this);
	}
}

/// FILL
class Fill {
	constructor(options) {
		// Define instance vars
		this.x = this.minX = this.maxX = Math.floor(options.x);
		this.y = this.minY = this.maxY = Math.floor(VIEWPORT.height - options.y);
		this.drawColor = fabric.Color.fromHex(options.color)._source.slice(0, 3);

		// Ensure fill is within image bounds
		if (this.x >= 0 && this.x < VIEWPORT.width && this.y >= 0 && this.y < VIEWPORT.height) {
			let data = new Uint8ClampedArray(REGL.read());

			// Get start position/color
			let startPos = this.coordsToPos({ x: this.x, y: this.y });
			this.startColor = data.slice(startPos, startPos + 3);

			// Ensure start color and draw color are different
			if (!this.colorEquals(this.startColor, this.drawColor)) {
				// Change all pixels to alpha 0
				for (let i = 0; i < VIEWPORT.width * VIEWPORT.height; i++) {
					data[4 * i + 3] = 0;
				}

				// Run flood fill algorithm on data
				this._fill(data);

				// Use canvas to bake fill data
				let imageData = new ImageData(data, 800, 600);
				let canvas = document.createElement("canvas");
				canvas.width = VIEWPORT.width;
				canvas.height = VIEWPORT.height;
				let ctx = canvas.getContext("2d");
				ctx.putImageData(imageData, 0, 0);

				// Create image from fill data
				ShaderImage.fromURL(
					this.crop(
						canvas,
						this.minX,
						this.minY,
						this.maxX - this.minX + 1,
						this.maxY - this.minY + 1
					).toDataURL(),
					(e) => {
						// Add to canvas
						CANVAS.add(e);
						record("floodfill:created", e);

						// Delete temp data
						canvas.remove();
					},
					{ left: this.minX, right: this.maxX + 1, top: this.minY, bottom: this.maxY + 1 }
				);
			}
		}
	}

	_fill(data) {
		let todo = [{ x: this.x, y: this.y }];
		let n = 0;
		while (todo.length) {
			let coords, pos, reachLeft, reachRight;
			coords = todo.pop();
			pos = this.coordsToPos(coords);
			reachLeft = false;
			reachRight = false;

			while (coords.y-- >= 0 && this.colorEquals(this.startColor, data.slice(pos, pos + 4))) {
				pos -= VIEWPORT.width * 4;
			}

			pos += VIEWPORT.width * 4;
			++coords.y;

			while (
				coords.y++ < VIEWPORT.height - 1 &&
				this.colorEquals(this.startColor, data.slice(pos, pos + 4))
			) {
				this.recolorPixel(data, pos, this.drawColor);

				if (coords.x > 0) {
					if (this.colorEquals(this.startColor, data.slice(pos - 4, pos))) {
						if (!reachLeft) {
							todo.push({
								x: coords.x - 1,
								y: coords.y,
							});
							reachLeft = true;
						}
					} else if (reachLeft) {
						reachLeft = false;
					}
				}

				if (coords.x < VIEWPORT.width - 1) {
					if (this.colorEquals(this.startColor, data.slice(pos + 4, pos + 8))) {
						if (!reachRight) {
							todo.push({
								x: coords.x + 1,
								y: coords.y,
							});
							reachRight = true;
						}
					} else if (reachRight) {
						reachRight = false;
					}
				}

				pos += VIEWPORT.width * 4;

				if (++n > VIEWPORT.width * VIEWPORT.height) {
					// Automatically break from an infinite loop - THIS SHOULD NEVER HAPPEN
					console.error("PICTUREPHONE ERROR: Infinite loop in flood fill algorithm");
					todo = [];
					break;
				}
			}
		}
	}

	coordsToPos(coords) {
		// Get buffer position from coordinates
		return (coords.y * VIEWPORT.width + coords.x) * 4;
	}

	posToCoords(pos) {
		// Get coordinates from buffer position
		let p, x, y;
		p = pos / 4;
		x = p % VIEWPORT.width;
		y = (p - x) / VIEWPORT.width;
		return { x: x, y: y };
	}

	colorEquals(c1, c2) {
		// Checks if two colours are the same
		return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2];
	}

	recolorPixel(data, pos, color) {
		// Recolors pixel at the position
		data[pos] = color[0];
		data[pos + 1] = color[1];
		data[pos + 2] = color[2];
		data[pos + 3] = 255;

		// Record boundaries of fill
		let coords = this.posToCoords(pos);
		this.minX = Math.min(this.minX, coords.x);
		this.minY = Math.min(this.minY, coords.y);
		this.maxX = Math.max(this.maxX, coords.x);
		this.maxY = Math.max(this.maxY, coords.y);
	}

	crop(source, left, top, width, height) {
		// Crop a canvas to the specified dimensions
		let dest = document.createElement("canvas");
		dest.width = width;
		dest.height = height;
		dest.getContext("2d").drawImage(source, left, top, width, height, 0, 0, width, height);
		return dest;
	}
}

/// SHADERS
// Default fragment shader
const SHD_FRAG = `
precision mediump float;
uniform vec4 color;
void main() {
  gl_FragColor = color;
}`;

// Line vertex shader
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

// Circle vertex shader
const SHD_CIRCLE_VERT = `
precision mediump float;
uniform vec2 offset;
uniform vec2 display;
attribute vec2 position;
void main () {
	vec2 pos = position + offset;
	pos *= 2. * (display.x/800.) / vec2(display.x, -display.y); // scale to screen size
	pos -= vec2(1., -1.); // correct offset
  gl_Position = vec4(pos, 0, 1);
}`;

// Image fragment shader
const SHD_IMAGE_FRAG = `
precision mediump float;
uniform sampler2D texture;
varying vec2 uv;
void main() {
	vec4 texColor = texture2D(texture, uv);
	if (texColor.a == 0.) {
		discard;
	}
	gl_FragColor = texColor;
}`;

// Image vertex shader
const SHD_IMAGE_VERT = `
precision mediump float;
attribute vec2 position;
uniform vec4 bounds;
varying vec2 uv;
void main() {
	vec2 pos = position;
	pos *= vec2(bounds.y - bounds.x, bounds.w - bounds.z); // resize
	pos += vec2(bounds.x, bounds.z); // reposition
	pos = pos * 2. - 1.; // adjust coords to screen space
	uv = position;
	gl_Position = vec4(pos, 0, 1);
}`;
