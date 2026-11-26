import { createRoot } from "react-dom/client";
import Studio from "../shared/editor/studio";
import { getInstantAudio } from "./myinstants";
import "../shared/editor/ui/studio.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<Studio importLink={getInstantAudio} />);
