import { render } from "@opentui/solid";
import { App } from "./App";

render(() => <App />, {
  targetFps: 30,
  exitOnCtrlC: true,
});
