// Reads the image captcha of a sign-in page with the model of ddddocr (public/models/ddddocr) in ONNX Runtime Web.
// Everything happens on the user's computer: the picture is never sent anywhere.

import * as ort from "onnxruntime-web/wasm";
import type {RecognizeRequest} from "../background/captcha";
import type {CaptchaCharset} from "../shared/types";

const MODEL_HEIGHT = 64;

// the loader and the WebAssembly of ONNX Runtime are copied to ort/ by scripts/build.mjs
ort.env.wasm.wasmPaths = chrome.runtime.getURL("ort/");
// threads need a cross-origin isolated page
ort.env.wasm.numThreads = 1;

interface Model {
  session: ort.InferenceSession;
  charset: string[];
}

let model: Promise<Model> | null = null;

function loadModel(): Promise<Model> {
  model ??= (async () => {
    const [session, charset] = await Promise.all([
      ort.InferenceSession.create(chrome.runtime.getURL("models/ddddocr/common_old.onnx"), {executionProviders: ["wasm"]}),
      fetch(chrome.runtime.getURL("models/ddddocr/charset.json")).then((response) => response.json() as Promise<string[]>),
    ]);
    return {session, charset};
  })().catch((error: unknown) => {
    model = null;
    throw error;
  });
  return model;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The captcha picture could not be read"));
    image.src = dataUrl;
  });
}

/** The input of ddddocr: 64 pixels high, grey as PIL's "L" (ITU-R 601-2 luma), from -1 to 1, a transparent picture on white */
async function toTensor(dataUrl: string): Promise<ort.Tensor> {
  const image = await loadImage(dataUrl);
  const width = Math.max(1, Math.round((image.naturalWidth * MODEL_HEIGHT) / image.naturalHeight));
  const canvas = new OffscreenCanvas(width, MODEL_HEIGHT);
  const context = canvas.getContext("2d", {willReadFrequently: true});
  if (!context) {
    throw new Error("No canvas to read the captcha with");
  }
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, MODEL_HEIGHT);
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

const charsetPatterns: Partial<Record<CaptchaCharset, RegExp>> = {
  Digits: /^[0-9]$/,
  Alphanumeric: /^[0-9a-zA-Z]$/,
};

/** CTC decoding of the model's output [steps, 1, classes], over the characters that the captcha can have */
function decode(output: ort.Tensor, charset: string[], allowedCharset: CaptchaCharset): string {
  const [steps, , classes] = output.dims;
  const scores = output.data as Float32Array;
  const pattern = charsetPatterns[allowedCharset];
  const allowed: number[] = [];
  for (let c = 0; c < classes; c++) {
    if (c === 0 || !pattern || pattern.test(charset[c])) {
      allowed.push(c);
    }
  }
  let text = "";
  let last = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestScore = -Infinity;
    for (const c of allowed) {
      const score = scores[t * classes + c];
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best !== last && best !== 0) {
      text += charset[best];
    }
    last = best;
  }
  return text;
}

async function recognize(image: string, charset: CaptchaCharset): Promise<string> {
  const {session, charset: characters} = await loadModel();
  const outputs = await session.run({[session.inputNames[0]]: await toTensor(image)});
  return decode(outputs[session.outputNames[0]], characters, charset);
}

chrome.runtime.onMessage.addListener((message: RecognizeRequest, _sender, sendResponse: (reply: {text?: string; error?: string}) => void) => {
  if (message?.target !== "offscreen") {
    return false;
  }
  recognize(message.image, message.charset)
    .then((text) => sendResponse({text}))
    .catch((error: unknown) => sendResponse({error: error instanceof Error ? error.message : String(error)}));
  return true;
});
