// Local deformation of the registered reference image. The lower paws stay
// fixed while the ribs expand and the head follows. Render at display density
// so a Retina screen does not enlarge a low-resolution breathing canvas.
export function createPandaBreathing(poster, { width, height, period = 4.8 }, onUnavailable = () => {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pd-media pd-breathing';
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const shaders = [], buffers = [], textures = [];
  const sourceWidth = poster.naturalWidth || width;
  const sourceHeight = poster.naturalHeight || height;
  const cycle = Number.isFinite(period) && period > 0 ? period : 4.8;
  const viewportLimits = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const renderbufferLimit = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  // 4096 px covers a 1920 px display at 2x density without allocating an
  // unbounded framebuffer on a large external display.
  const maxWidth = Math.min(4096, viewportLimits[0], renderbufferLimit);
  const maxHeight = Math.min(4096, viewportLimits[1], renderbufferLimit);
  let program, amount, raf, observer, densityQuery;
  let running = false, destroyed = false, unavailable = false;
  let elapsed = 0, started = 0, lastPaint = -Infinity, lastRendered = 0;

  function shader(type, source) {
    const s = gl.createShader(type); shaders.push(s); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Breathing shader unavailable');
    return s;
  }
  function pause() {
    if (running) elapsed += (performance.now() - started) / 1000;
    running = false; cancelAnimationFrame(raf); raf = undefined; canvas.dataset.state = 'paused';
  }
  function lost(event) {
    event.preventDefault(); pause(); unavailable = true; onUnavailable();
  }
  function destroy() {
    if (destroyed) return;
    pause(); destroyed = true;
    observer?.disconnect();
    window.removeEventListener('resize', refresh);
    densityQuery?.removeEventListener('change', densityChanged);
    canvas.removeEventListener('webglcontextlost', lost);
    for (const b of buffers) gl.deleteBuffer(b);
    for (const t of textures) gl.deleteTexture(t);
    for (const s of shaders) gl.deleteShader(s);
    if (program) gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  function resize() {
    // A new canvas is still detached, and a hidden reminder can report zero.
    // Fit the authored aspect ratio into the viewport for initialization,
    // rather than treating the source image's pixels as its CSS dimensions.
    // After attachment the measured CSS size always takes precedence.
    const rect = canvas.isConnected ? canvas.getBoundingClientRect() : null;
    const ratio = (width || sourceWidth) / (height || sourceHeight);
    const viewportWidth = window.innerWidth || width || sourceWidth;
    const viewportHeight = window.innerHeight || height || sourceHeight;
    const fittedWidth = Math.min(viewportWidth, viewportHeight * ratio);
    const cssWidth = rect?.width > 0 ? rect.width : fittedWidth;
    const cssHeight = rect?.height > 0 ? rect.height : fittedWidth / ratio;
    const density = Math.max(1, window.devicePixelRatio || 1);
    const desiredWidth = cssWidth * density, desiredHeight = cssHeight * density;
    const scale = Math.min(1, maxWidth / desiredWidth, maxHeight / desiredHeight,
      Math.sqrt(16_777_216 / (desiredWidth * desiredHeight)));
    const nextWidth = Math.max(1, Math.round(desiredWidth * scale));
    const nextHeight = Math.max(1, Math.round(desiredHeight * scale));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth; canvas.height = nextHeight;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    canvas.dataset.density = String(density);
  }
  function renderAt(seconds) {
    if (destroyed || unavailable || gl.isContextLost()) return;
    resize(); lastRendered = seconds;
    // Zero velocity at both ends avoids a jerk at entry or at the loop seam.
    const expansion = (1 - Math.cos(2 * Math.PI * seconds / cycle)) / 2;
    gl.uniform1f(amount, expansion); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function refresh() { renderAt(lastRendered); }
  function watchDensity() {
    densityQuery?.removeEventListener('change', densityChanged);
    densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    densityQuery.addEventListener('change', densityChanged);
  }
  function densityChanged() { watchDensity(); refresh(); }

  try {
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `
      attribute vec2 position; varying vec2 uv;
      void main(){ uv=position; gl_Position=vec4(position.x*2.0-1.0,1.0-position.y*2.0,0.0,1.0); }
    `));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
      precision highp float;
      varying vec2 uv; uniform sampler2D image; uniform float breath;
      void main(){
        // Coordinates stay in the authored 1024 x 576 composition regardless
        // of the source texture resolution or current display density.
        vec2 p=uv*vec2(1024.0,576.0);
        vec2 chest=(p-vec2(645.0,380.0))/vec2(205.0,130.0);
        vec2 head=(p-vec2(771.0,192.0))/vec2(145.0,160.0);
        float ribs=exp(-2.0*dot(chest,chest));
        float follow=exp(-2.0*dot(head,head));
        float grounded=1.0-smoothstep(420.0,475.0,p.y);
        vec2 displacement=vec2((p.x-675.0)*0.024*ribs-0.25*follow,-6.0*ribs-1.8*follow)*grounded*breath;
        gl_FragColor=texture2D(image,uv-displacement/vec2(1024.0,576.0));
      }
    `));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Breathing program unavailable');
    gl.useProgram(program);
    const buffer = gl.createBuffer(); buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture(); textures.push(texture); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let textureSource = poster;
    if (sourceWidth > textureLimit || sourceHeight > textureLimit) {
      // Only reduce the texture when required by this GPU. Ordinarily upload
      // the original poster pixels, not the video's smaller frame dimensions.
      const ratio = Math.min(textureLimit / sourceWidth, textureLimit / sourceHeight);
      textureSource = document.createElement('canvas');
      textureSource.width = Math.max(1, Math.floor(sourceWidth * ratio));
      textureSource.height = Math.max(1, Math.floor(sourceHeight * ratio));
      const context = textureSource.getContext('2d');
      if (!context) throw new Error('Breathing texture unavailable');
      context.drawImage(poster, 0, 0, textureSource.width, textureSource.height);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureSource);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Breathing texture unavailable');
    gl.uniform1i(gl.getUniformLocation(program, 'image'), 0);
    amount = gl.getUniformLocation(program, 'breath');
    gl.clearColor(0, 0, 0, 0);
    function tick(now) {
      if (!running || destroyed) return;
      if (now - lastPaint >= 1000 / 30 - 1) { renderAt(elapsed + (now - started) / 1000); lastPaint = now; }
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (destroyed || unavailable || running || gl.isContextLost()) return;
      running = true; started = performance.now(); lastPaint = started; renderAt(elapsed); canvas.dataset.state = 'running'; raf = requestAnimationFrame(tick);
    }
    function reset() { pause(); elapsed = 0; renderAt(0); }
    canvas.addEventListener('webglcontextlost', lost);
    if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(refresh); observer.observe(canvas); }
    window.addEventListener('resize', refresh); watchDensity(); reset();
    return { canvas, start, pause, reset, renderAt, resize: refresh, destroy };
  } catch {
    destroy(); return null;
  }
}
