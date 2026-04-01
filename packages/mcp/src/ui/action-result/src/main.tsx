import { createRoot } from "react-dom/client";
import "~/global.css";
import { ActionResult } from "./ActionResult";

createRoot(document.getElementById("app")!).render(<ActionResult />);
