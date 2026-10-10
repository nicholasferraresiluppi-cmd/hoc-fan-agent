// Installazione sul telefono (10/10/2026): con il manifest HOC Pro si aggiunge alla schermata
// Home e si apre a schermo intero, senza la barra del browser. Le icone sono quelle di app/.
export default function manifest() {
  return {
    name: "HOC Pro",
    short_name: "HOC Pro",
    description: "La console operativa di House of Creators.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08090c",
    theme_color: "#08090c",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
