# Third-party files

- `onnxruntime-web/`: the WebAssembly build of [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) 1.22.0 (`ort.wasm.min.js`, `ort-wasm-simd-threaded.mjs`, `ort-wasm-simd-threaded.wasm` from the npm package `onnxruntime-web@1.22.0`), MIT License.
- `ddddocr/`: the captcha recognition model `common_old.onnx` and its character set (`charset.json`, taken from `ddddocr/__init__.py`) of [ddddocr](https://github.com/sml2h3/ddddocr) 1.5.6 (the PyPI wheel), MIT License.

They are used by `src/offscreen.js` to read the image captchas of sign-in pages on the user's own computer.
