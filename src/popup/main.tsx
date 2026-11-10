import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {App} from "./App";
import "./popup.css";

document.documentElement.lang = chrome.i18n.getUILanguage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
