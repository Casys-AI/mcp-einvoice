import { createRoot } from "react-dom/client";
import "~/global.css";
import { DirectoryList } from "./DirectoryList";

createRoot(document.getElementById("app")!).render(<DirectoryList />);
