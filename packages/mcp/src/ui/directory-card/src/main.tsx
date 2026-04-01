import { createRoot } from "react-dom/client";
import "~/global.css";
import { DirectoryCard } from "./DirectoryCard";

createRoot(document.getElementById("app")!).render(<DirectoryCard />);
