import { createRoot } from "react-dom/client";
import "~/global.css";
import { StatusTimeline } from "./StatusTimeline";

createRoot(document.getElementById("app")!).render(<StatusTimeline />);
