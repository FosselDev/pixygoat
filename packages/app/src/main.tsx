import { render } from "preact";
import { App } from "./components/App.tsx";
import { loadCatalog } from "./state/catalog-loader.ts";
import { startAutosave } from "./state/persistence.ts";
import "./styles.css";

render(<App />, document.getElementById("app")!);
void loadCatalog().then(() => startAutosave());
