#!/usr/bin/env python3
"""
controllo_video.py — controllo qualità di un video (girato o generato con AI) prima della coda di
approvazione. Due parti:

1. CONTROLLI TECNICI automatici (bloccanti se falliscono):
   formato verticale 9:16, risoluzione ≥720 di larghezza, durata 3–90 s (limite API Instagram
   indicato da fonti secondarie: tenerlo prudente), audio presente, niente tratti neri,
   niente fotogrammi congelati > 1 s (tipico difetto dei video generati).
2. FOGLIO DI CONFRONTO per la somiglianza: fotogrammi di riferimento della creator accanto a
   fotogrammi del video. La somiglianza la giudica una persona (o Claude guardando il foglio,
   come pre-filtro): niente riconoscimento facciale automatico — è un dato biometrico.

Uso:
  python3 controllo_video.py video.mp4 [--riferimenti cartella_o_immagini ...] [--out foglio.jpg]
Esce con codice 1 se un controllo tecnico fallisce.
"""
import argparse, glob, json, os, re, subprocess, sys, tempfile


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def info(video):
    r = sh(["ffprobe", "-v", "error", "-show_entries",
            "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", video])
    d = json.loads(r.stdout)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), None)
    a = any(s["codec_type"] == "audio" for s in d["streams"])
    return v, a, float(d["format"]["duration"])


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--riferimenti", nargs="*", default=[])
    p.add_argument("--out")
    p.add_argument("--senza-audio-ok", action="store_true", help="per clip da montare (audio aggiunto dopo)")
    a = p.parse_args()

    v, ha_audio, dur = info(a.video)
    w, h = int(v["width"]), int(v["height"])
    esiti = []
    esiti.append(("verticale 9:16", abs(w / h - 9 / 16) < 0.02, f"{w}x{h}"))
    esiti.append(("larghezza ≥720", w >= 720, f"{w}px"))
    esiti.append(("durata 3–90 s", 3 <= dur <= 90, f"{dur:.1f}s"))
    esiti.append(("audio presente", ha_audio or a.senza_audio_ok, "sì" if ha_audio else "no"))

    r = sh(["ffmpeg", "-hide_banner", "-i", a.video, "-vf",
            "blackdetect=d=0.3:pix_th=0.10,freezedetect=n=0.003:d=1", "-an", "-f", "null", "-"])
    neri = re.findall(r"black_start:([\d.]+)", r.stderr)
    fermi = re.findall(r"freeze_start: ([\d.]+)", r.stderr)
    esiti.append(("nessun tratto nero", not neri, ", ".join(neri) or "ok"))
    esiti.append(("nessun fermo-immagine >1s", not fermi, ", ".join(fermi) or "ok"))

    ok = all(e[1] for e in esiti)
    for nome, passa, det in esiti:
        print(f"{'OK ' if passa else 'NO '} {nome:28s} {det}")

    if a.riferimenti:
        rif = []
        for x in a.riferimenti:
            rif += sorted(glob.glob(os.path.join(x, "*.jpg"))) if os.path.isdir(x) else [x]
        rif = rif[:4]
        out = a.out or os.path.splitext(a.video)[0] + "_confronto.jpg"
        with tempfile.TemporaryDirectory() as tmp:
            for i in range(6):
                t = dur * (i + 0.5) / 6
                sh(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-i", a.video,
                    "-frames:v", "1", "-vf", "scale=-1:400", os.path.join(tmp, f"g{i}.jpg")])
            for i, f in enumerate(rif):
                sh(["ffmpeg", "-loglevel", "error", "-y", "-i", f, "-vf", "scale=-1:400",
                    os.path.join(tmp, f"r{i}.jpg")])
            ins = []
            for f in sorted(glob.glob(os.path.join(tmp, "r*.jpg"))) + sorted(glob.glob(os.path.join(tmp, "g*.jpg"))):
                ins += ["-i", f]
            n = len(ins) // 2
            sh(["ffmpeg", "-loglevel", "error", "-y", *ins, "-filter_complex",
                "".join(f"[{i}:v]scale=-2:400,pad=iw+8:400:4:0:white[p{i}];" for i in range(n)) +
                "".join(f"[p{i}]" for i in range(n)) + f"hstack=inputs={n}", out])
        print(f"Foglio di confronto (prime {len(rif)} = riferimento, poi il video): {out}")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
