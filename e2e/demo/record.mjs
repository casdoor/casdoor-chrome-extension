// Records the demo video in docs/: the real extension, signed in to a real Casdoor, on the made-up systems of Acme,
// in the stage page of e2e/demo. The sign-in window of Casdoor is recorded on its own and cut in.
//   CASDOOR_ADMIN_PASSWORD=... node e2e/demo/record.mjs
// It needs the local Casdoor of e2e/run.mjs, a build from `node scripts/build.mjs --e2e`, and ffmpeg.

import {execFileSync} from "node:child_process";
import {cp, mkdir, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {alice} from "../acme.mjs";
import {launch, prepareExtension} from "../run.mjs";
import {setup} from "../setup.mjs";
import {startSystems} from "../systems.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = resolve(root, "docs");
const size = {width: 1280, height: 800};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await setup();
const systems = await startSystems(Number(process.env.SYSTEMS_PORT ?? 18200), {signInDelay: 1800});
const extension = await prepareExtension("dist-e2e");
await cp(here, join(extension, "demo"), {recursive: true});
const videos = await mkdtemp(join(tmpdir(), "casdoor-demo-"));
const {context, extensionId} = await launch(extension, {viewport: size, recordVideo: {dir: videos, size}});

const stage = await context.newPage();
const start = Date.now();
await stage.goto(`chrome-extension://${extensionId}/demo/stage.html`);
await stage.waitForLoadState("networkidle");
const stageReady = Date.now();

const site = () => stage.frameLocator("#site");
const popup = () => stage.frameLocator("#popupFrame");
const call = (name, ...args) => stage.evaluate(([name, args]) => window.stage[name](...args), [name, args]);

// keep the address bar on the page the site frame is on
const addressTimer = setInterval(async () => {
  const frame = stage.frames().find((item) => item.name() === "" && item.parentFrame() === stage.mainFrame() && /acme\.test/.test(item.url()));
  if (frame) {
    await call("showUrl", frame.url()).catch(() => undefined);
  }
}, 250);

async function pointAt(locator) {
  await locator.waitFor({timeout: 20000});
  const box = await locator.boundingBox();
  await call("moveCursor", box.x + box.width / 2 - 4, box.y + box.height / 2 - 4);
  await sleep(800);
}

async function clickAt(locator) {
  await pointAt(locator);
  await call("clickCursor");
  await sleep(150);
  await locator.click();
}

async function typeAt(locator, text) {
  await clickAt(locator);
  await locator.pressSequentially(text, {delay: 75});
  await sleep(250);
}

try {
  await sleep(2600);

  await call("caption", "1", "Sign in to your company's Casdoor once");
  await sleep(1200);
  await clickAt(stage.locator("#extension"));
  await call("openPopup");
  await sleep(900);
  await typeAt(popup().getByLabel(/Casdoor server URL/), "http://door.acme.test");
  await typeAt(popup().getByLabel(/^Application/), "app-acme");
  const authWindow = context.waitForEvent("page");
  await clickAt(popup().getByRole("button", {name: "Sign in with Casdoor"}));
  const auth = await authWindow;
  const authOpened = Date.now();
  await auth.getByPlaceholder(/username/i).waitFor();
  await sleep(700);
  const authReady = Date.now();
  await auth.getByPlaceholder(/username/i).pressSequentially(alice.name, {delay: 90});
  await auth.locator("input[type=password]").pressSequentially(alice.password, {delay: 60});
  await sleep(500);
  const authClosed = new Promise((resolve) => auth.on("close", () => resolve(Date.now())));
  await auth.getByRole("button", {name: "Sign In"}).click();
  const authDone = await authClosed;
  await popup().getByText("Acme ERP", {exact: true}).waitFor({timeout: 20000});
  await sleep(2800);

  await call("caption", "2", "Open a system: your account is filled in and you are signed in");
  await call("closePopup");
  await sleep(1200);
  await call("open", "http://oa.acme.test/login");
  await site().locator("#who").waitFor({timeout: 20000});
  await sleep(2600);

  await call("caption", "3", "More than one account? Pick one, and it is used next time");
  await sleep(800);
  await call("open", "http://crm.acme.test/");
  const chip = site().locator("casdoor-autofill").getByRole("button", {name: "alice.sales"});
  await pointAt(chip);
  await sleep(900);
  await call("clickCursor");
  await chip.click();
  await site().locator("#who").waitFor({timeout: 20000});
  await sleep(2400);

  await call("caption", "4", "Image captchas are read on your computer, never sent anywhere");
  await sleep(800);
  await call("open", "http://erp.acme.test/login");
  await site().locator("#who").waitFor({timeout: 20000});
  await sleep(2400);

  await call("caption", "5", "Signed in by hand? Save the account to Casdoor for next time");
  await sleep(800);
  await call("open", "http://hr.acme.test/login");
  await sleep(1500);
  await typeAt(site().locator("#hr-user"), "E1024");
  await typeAt(site().locator("#hr-pass"), "Hr-Typed-2026");
  await clickAt(site().locator("button[type=submit]"));
  const save = site().locator("casdoor-autofill").getByRole("button", {name: "Save"});
  await pointAt(save);
  await sleep(1200);
  await call("clickCursor");
  await save.click();
  await site().locator("casdoor-autofill").getByText("Saved to Casdoor").waitFor();
  await sleep(2600);

  clearInterval(addressTimer);
  await call("caption", "", "Casdoor browser extension, free on the Chrome Web Store");
  await call("moveCursor", 1400, 900);
  await stage.evaluate(() => {
    document.getElementById("site").classList.remove("shown");
    document.getElementById("intro").classList.remove("hidden");
    window.stage.showUrl("github.com/casdoor/casdoor-chrome-extension");
  });
  await sleep(3200);
  const end = Date.now();

  clearInterval(addressTimer);
  const stageVideo = stage.video();
  const authVideo = auth.video();
  await context.close();
  const stagePath = await stageVideo.path();
  const authPath = await authVideo.path();

  // stage from its first painted frame to the sign-in window, the sign-in window, then the stage again
  const seconds = (ms) => (ms / 1000).toFixed(2);
  const segments = [
    [stagePath, stageReady - start, authOpened - start],
    [authPath, authReady - authOpened, authDone - authOpened - 150],
    [stagePath, authDone - start, end - start],
  ];
  await mkdir(out, {recursive: true});
  const filters = segments
    .map(([, from, to], index) => `[${index}:v]trim=start=${seconds(from)}:end=${seconds(to)},setpts=PTS-STARTPTS,scale=${size.width}:${size.height},fps=30[v${index}]`)
    .join(";");
  const inputs = segments.flatMap(([path]) => ["-i", path]);
  execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", `${filters};[v0][v1][v2]concat=n=3:v=1[out]`, "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", join(out, "demo.mp4")], {stdio: "inherit"});
  execFileSync("ffmpeg", ["-y", "-i", join(out, "demo.mp4"), "-vf", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", join(out, "demo.gif")], {stdio: "inherit"});
  console.log(`Wrote ${join(out, "demo.mp4")} and demo.gif`);
} catch (error) {
  await stage.screenshot({path: join(videos, "..", "casdoor-demo-failed.png")}).catch(() => undefined);
  throw error;
} finally {
  clearInterval(addressTimer);
  await context.close().catch(() => undefined);
  systems.close();
  await rm(extension, {recursive: true, force: true});
  await rm(videos, {recursive: true, force: true});
}
