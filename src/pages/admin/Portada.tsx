// Primera pantalla del admin: qué es esto, qué falta y qué hay que preparar.
import type { Contenido } from "../../../shared/tipos.ts";
import { preparacion, revisarSub } from "../../../shared/revision.ts";
import { Icono } from "../../components/iconos.tsx";

export function Portada({ c, onIr }: { c: Contenido; onIr: (subId: string) => void }) {
  const rondas = c.pruebas.flatMap((p, pi) => p.subs.map((s, si) => ({ s, num: p.subs.length > 1 ? `${pi + 1}.${si + 1}` : `${pi + 1}`, prueba: p.titulo })));
  const pendientes = rondas.filter((r) => revisarSub(r.s).length);
  return (
    <>
      <div className="panel col bienvenida">
        <h2>Preparar el concurso</h2>
        <p>
          Aquí se prepara todo lo que sale el día del cumple. <b>La TV</b> enseña las preguntas, <b>el presentador</b> lo maneja desde su móvil y
          <b> cada equipo</b> responde con el suyo. Tú solo tienes que rellenar cada ronda y tener preparado lo de la lista de abajo.
        </p>
        <p className="suave">
          Se guarda solo mientras escribes. Abre cada ronda: arriba de cada una tienes una guía con qué es, cómo se juega y qué poner. Lo que está en
          amarillo es lo que falta.
        </p>
      </div>

      <div className="panel col">
        <h3>{pendientes.length ? `¿Está todo listo? Faltan ${pendientes.length} de ${rondas.length} rondas` : "Todo listo para jugar"}</h3>
        <div className="lista-revision">
          {rondas.map(({ s, num, prueba }) => {
            const falta = revisarSub(s);
            return (
              <button key={s.id} type="button" className={`fila-revision ${falta.length ? "con-falta" : "lista"}`} onClick={() => onIr(s.id)}>
                <span className="etiqueta">{num}</span>
                <span className="fila-revision-nombre">
                  <b>{s.titulo}</b>
                  <span className="suave"> · {prueba}</span>
                </span>
                <span className="fila-revision-estado">{falta.length ? falta.join(" · ") : <><Icono n="check" /> Lista</>}</span>
                <Icono n="siguiente" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel col">
        <h3>Lo que hay que tener preparado el día</h3>
        <ul className="preparacion">
          {preparacion(c).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
