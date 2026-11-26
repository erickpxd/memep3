import { createRoot } from "react-dom/client";
import Studio from "../editor/studio";
import { getInstantAudio } from "./myinstants";
import "../editor/studio.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<Studio importLink={getInstantAudio} />);
