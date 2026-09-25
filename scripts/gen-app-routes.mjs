// Genera l'elenco dei template di pagina (es. "/leaderboard/creators/[alias]")
// da src/app/**/page.js. Serve al tracking d'uso per raggruppare le visite per
// PAGINA e non per URL (una scheda creator = una pagina, non 40).
// Gira da solo prima di ogni build (npm "prebuild"): non va aggiornato a mano.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "src/app";
const out = [];
function walk(dir, parts) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name.startsWith("_") || name === "api") continue;
      // (gruppi) non compaiono nell'URL
      walk(p, name.startsWith("(") ? parts : [...parts, name]);
    } else if (name === "page.js" || name === "page.jsx") {
      out.push("/" + parts.join("/"));
    }
  }
}
walk(root, []);
out.sort();
writeFileSync("src/lib/app-routes.generated.json", JSON.stringify(out, null, 1) + "\n");
console.log(`app-routes: ${out.length} pagine`);
