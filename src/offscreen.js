// Copyright 2026 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Reads the image captcha of a sign-in page with ddddocr's model in ONNX Runtime Web, on the user's own computer: the
// image never leaves it. This hidden page exists because a service worker can't run WebAssembly with a canvas.

/* global ort */

const MODEL_HEIGHT = 64;

let model = null;

async function loadModel() {
  if (!model) {
    model = (async() => {
      ort.env.wasm.wasmPaths = chrome.runtime.getURL("/vendor/onnxruntime-web/");
      // threads need a cross-origin isolated page
      ort.env.wasm.numThreads = 1;
      const [session, charset] = await Promise.all([
        ort.InferenceSession.create(chrome.runtime.getURL("/vendor/ddddocr/common_old.onnx"), {executionProviders: ["wasm"]}),
        fetch(chrome.runtime.getURL("/vendor/ddddocr/charset.json")).then((res) => res.json()),
      ]);
      return {session, charset};
    })();
    model.catch(() => {
      model = null;
    });
  }
  return model;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("the captcha image could not be read"));
    image.src = dataUrl;
  });
}

// the same input as ddddocr: scaled to 64 pixels high, grey (ITU-R 601-2 luma, as PIL's "L"), from -1 to 1
async function toTensor(dataUrl) {
  const image = await loadImage(dataUrl);
  const width = Math.max(1, Math.round(image.naturalWidth * MODEL_HEIGHT / image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = MODEL_HEIGHT;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  // a transparent captcha is read on white
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, MODEL_HEIGHT);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, MODEL_HEIGHT);
  const pixels = context.getImageData(0, 0, width, MODEL_HEIGHT).data;
  const data = new Float32Array(width * MODEL_HEIGHT);
  for (let i = 0; i < data.length; i++) {
    const grey = Math.round((pixels[i * 4] * 299 + pixels[i * 4 + 1] * 587 + pixels[i * 4 + 2] * 114) / 1000);
    data[i] = (grey / 255 - 0.5) / 0.5;
  }
  return new ort.Tensor("float32", data, [1, 1, MODEL_HEIGHT, width]);
}

const charsetPatterns = {
  Digits: /^[0-9]$/,
  Alphanumeric: /^[0-9a-zA-Z]$/,
};

// CTC decoding of the model's output [steps, 1, classes], only over the characters the captcha can have
function decode(output, charset, allowedName) {
  const [steps, , classes] = output.dims;
  const pattern = charsetPatterns[allowedName];
  const allowed = [];
  for (let c = 0; c < classes; c++) {
    if (c === 0 || !pattern || pattern.test(charset[c])) {
      allowed.push(c);
    }
  }
  let result = "";
  let last = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestScore = -Infinity;
    for (const c of allowed) {
      const score = output.data[t * classes + c];
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best !== last && best !== 0) {
      result += charset[best];
    }
    last = best;
  }
  return result;
}

async function recognize(image, charsetName) {
  const {session, charset} = await loadModel();
  const input = await toTensor(image);
  const outputs = await session.run({[session.inputNames[0]]: input});
  return decode(outputs[session.outputNames[0]], charset, charsetName);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen" || message.type !== "recognizeCaptcha") {
    return false;
  }
  recognize(message.image, message.charset)
    .then((text) => sendResponse({text}))
    .catch((error) => sendResponse({error: error.message}));
  return true;
});
