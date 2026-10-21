import { createRoot } from "react-dom/client";
import "./estilos.css";
import { Admin } from "./pages/Admin.tsx";
import { Jugar } from "./pages/Jugar.tsx";
import { Presentador } from "./pages/Presentador.tsx";
import { Tv } from "./pages/Tv.tsx";

const ruta = location.pathname.replace(/\/+$/, "");
const Pagina = ruta === "/tv" ? Tv : ruta === "/presentador" ? Presentador : ruta === "/admin" ? Admin : Jugar;
createRoot(document.getElementById("root")!).render(<Pagina />);
