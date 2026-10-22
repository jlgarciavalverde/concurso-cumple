import { describe, expect, it } from "vitest";
import { coincide } from "../shared/puntuacion.ts";

const si: [string, string][] = [
  ["cazoleta", "Cazoleta"],
  ["CAZOLETA", "Cazoleta"],
  ["  la cazoleta!! ", "Cazoleta"],
  ["cazoletas", "Cazoleta"],
  ["kazoleta", "Cazoleta"],
  ["casoleta", "Cazoleta"],
  ["cazoeta", "Cazoleta"], // errata
  ["carbon", "Carbón/Carbones"],
  ["carbones", "Carbón"],
  ["el carbón", "Carbón"],
  ["hielo", "Hielo"],
  ["ielo", "Hielo"],
  ["yelo", "Hielo"],
  ["manguera", "Manguera"],
  ["mangera", "Manguera"],
  ["base", "Base"],
  ["vase", "Base"],
  ["bases", "Base"],
  ["aluminio", "Papel de aluminio"],
  ["papel albal", "Aluminio/Papel albal"],
  ["papel de aluminio", "Aluminio/Papel de aluminio"],
  ["papel aluminio", "Papel de aluminio"],
  ["adalia", "Adalya"],
  ["ADALYA", "Adalya"],
  ["hooka", "Hookah"],
  ["sandia", "Sandía"],
  ["SANDÍA", "Sandía"],
  ["creo que es sandía", "Sandía"],
  ["sabor a menta", "Menta"],
  ["love66", "Love 66"],
  ["love 66", "Love 66"],
  ["Lady killer", "Lady Killer"],
  ["ladykiller", "Lady Killer"],
  ["sandía + menta", "Sandía + Menta"],
  ["menta y sandia", "Sandía + Menta"],
  ["Menta, sandía", "Sandía + Menta"],
  ["menta con sandia", "Sandía + Menta"],
  ["frutos rojos y hielo", "Frutos rojos + Ice/Frutos rojos + Hielo"],
  ["arándanos", "Arándano"],
  ["melocoton", "Melocotón"],
  ["maracuya", "Maracuyá"],
];
const no: [string, string][] = [
  ["", "Cazoleta"],
  ["menta", "Sandía"],
  ["melón", "Limón"],
  ["base", "Cazoleta"],
  ["love 69", "Love 66"],
  ["papel", "Papel de aluminio"],
  ["sandía", "Sandía + Menta"],
  ["sandía + uva", "Sandía + Menta"],
  ["uva", "Kiwi"],
  ["lima", "Limón"],
  ["pera", "Fresa"],
  ["cualquiera", "✏️"],
];

describe("coincide", () => {
  it.each(si)("«%s» vale para «%s»", (r, s) => expect(coincide(r, s)).toBe(true));
  it.each(no)("«%s» NO vale para «%s»", (r, s) => expect(coincide(r, s)).toBe(false));
});
