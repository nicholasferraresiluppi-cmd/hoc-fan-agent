#!/usr/bin/env python3
"""
sottotitoli.py — sottotitoli italiani parola per parola, impressi nel video (stile reel).

Uso:
  python3 sottotitoli.py input.mp4 output.mp4 [--parole 3] [--correzioni correzioni.json]

Passi: audio 16 kHz → whisper.cpp (modello medium, italiano, timestamp per parola)
→ blocchi di N parole → immagini trasparenti (stile reel: maiuscolo, bianco con
bordo nero, parola attiva in giallo) → ffmpeg le sovrappone (funziona anche con
un ffmpeg senza libass/drawtext). Il file .srt resta accanto
all'output per la revisione umana: i sottotitoli vanno SEMPRE riletti prima di
pubblicare (nomi, gergo, parolacce camuffate).

--correzioni: JSON {"parola sbagliata": "parola giusta"} applicato alla trascrizione.
Richiede: ffmpeg, Pillow, whisper-cli (whisper.cpp), modello ggml-medium.bin.
"""
import argparse, json, os, re, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
MODELLO = os.environ.get(
    "WHISPER_MODEL",
    "/Users/nicholasferraresiluppi/Documents/progetti/hoc-video/corso-ads/ggml-medium.bin")


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"Errore: {' '.join(cmd[:2])}\n{r.stderr[-800:]}")
    return r


def trascrivi(video, tmp):
    wav = os.path.join(tmp, "a.wav")
    run(["ffmpeg", "-loglevel", "error", "-y", "-i", video, "-ac", "1", "-ar", "16000", wav])
    base = os.path.join(tmp, "t")
    run(["whisper-cli", "-m", MODELLO, "-l", "it", "-f", wav, "-ml", "1", "-sow", "-oj", "-of", base])
    d = json.load(open(base + ".json", encoding="utf-8"))
    parole = []
    for s in d.get("transcription", []):
        t = s["text"].strip()
        if not t or re.fullmatch(r"\[.*\]|\(.*\)", t):
            continue
        parole.append({"t": t, "a": s["offsets"]["from"] / 1000, "b": s["offsets"]["to"] / 1000})
    return parole


def ts_srt(x):
    ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def dimensioni(video):
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=width,height", "-of", "csv=p=0", video])
    w, h = r.stdout.strip().split("\n")[0].split(",")[:2]
    return int(w), int(h)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("input"); p.add_argument("output")
    p.add_argument("--parole", type=int, default=3)
    p.add_argument("--correzioni")
    a = p.parse_args()
    corr = json.load(open(a.correzioni)) if a.correzioni else {}
    w, h = dimensioni(a.input)
    with tempfile.TemporaryDirectory() as tmp:
        parole = trascrivi(a.input, tmp)
        for x in parole:
            x["t"] = corr.get(x["t"].lower().strip(".,!?"), x["t"])
        if not parole:
            sys.exit("Nessun parlato trovato: niente sottotitoli.")
        blocchi = [parole[i:i + a.parole] for i in range(0, len(parole), a.parole)]
        fs = round(h * 0.055)
        font = ImageFont.truetype(FONT, fs)
        bordo = max(3, fs // 12)
        eventi, srt = [], []
        for i, b in enumerate(blocchi):
            fine_blocco = blocchi[i + 1][0]["a"] if i + 1 < len(blocchi) else b[-1]["b"] + 0.3
            for j, wd in enumerate(b):   # un evento per parola attiva: evidenziata in giallo
                fine = b[j + 1]["a"] if j + 1 < len(b) else fine_blocco
                eventi.append((wd["a"], fine, [x["t"].upper() for x in b], j))
            srt += [str(i + 1), f"{ts_srt(b[0]['a'])} --> {ts_srt(fine_blocco)}", " ".join(x["t"] for x in b), ""]
        cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", a.input]
        filtri, prec = [], "0:v"
        for k, (t0, t1, testi, att) in enumerate(eventi):
            png = os.path.join(tmp, f"e{k}.png")
            img = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
            spazio = d.textlength(" ", font=font)
            larg = [d.textlength(t, font=font) for t in testi]
            tot = sum(larg) + spazio * (len(testi) - 1)
            if tot > w * 0.9:      # troppo largo: riduci il blocco a due righe non serve, scala il font
                scala = w * 0.9 / tot
                f2 = ImageFont.truetype(FONT, int(fs * scala)); larg = [d.textlength(t, font=f2) for t in testi]
                spazio = d.textlength(" ", font=f2); tot = sum(larg) + spazio * (len(testi) - 1)
            else:
                f2 = font
            x, y = (w - tot) / 2, h * 0.68
            for n, t in enumerate(testi):
                col = (255, 229, 0, 255) if n == att else (255, 255, 255, 255)
                d.text((x, y), t, font=f2, fill=col, stroke_width=bordo, stroke_fill=(0, 0, 0, 255))
                x += larg[n] + spazio
            img.save(png)
            cmd += ["-i", png]
            out = f"v{k}"
            filtri.append(f"[{prec}][{k + 1}:v]overlay=0:0:enable='between(t,{t0:.3f},{t1:.3f})'[{out}]")
            prec = out
        open(os.path.splitext(a.output)[0] + ".srt", "w", encoding="utf-8").write("\n".join(srt))
        cmd += ["-filter_complex", ";".join(filtri), "-map", f"[{prec}]", "-map", "0:a?",
                "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", a.output]
        run(cmd)
    print(f"OK {a.output} — {len(parole)} parole, {len(blocchi)} blocchi. Rileggere {os.path.splitext(a.output)[0]}.srt")


if __name__ == "__main__":
    main()
