"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function CreatorDetailPage({ params }) {
  const { slug } = params;
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR(
    `/api/content-pipeline/creators/${slug}`,
    fetcher
  );
  const [form, setForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (data?.creator) {
      setForm({
        displayName: data.creator.displayName || "",
        telegramChannelId: data.creator.telegramChannelId || "",
        telegramBotToken: "",
        persona: data.creator.persona || "",
      });
    }
  }, [data?.creator]);

  if (isLoading || !form) return <p className="text-[#B9BDC7]">Caricamento…</p>;
  if (error) return <p className="text-red-400">Errore di rete</p>;
  if (data?.error) return <p className="text-red-400">{data.error}</p>;

  const c = data.creator;

  async function onSave(e) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setOk(false);
    const patch = {
      displayName: form.displayName,
      telegramChannelId: form.telegramChannelId,
      persona: form.persona,
    };
    if (form.telegramBotToken.trim().length > 0) {
      patch.telegramBotToken = form.telegramBotToken.trim();
    }
    try {
      const r = await fetch(`/api/content-pipeline/creators/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      setOk(true);
      setForm((f) => ({ ...f, telegramBotToken: "" }));
      mutate();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Eliminare il creator "${slug}"? Operazione irreversibile.`)) return;
    const r = await fetch(`/api/content-pipeline/creators/${slug}`, {
      method: "DELETE",
    });
    if (r.ok) {
      router.push("/content-pipeline/creators");
      return;
    }
    const json = await r.json().catch(() => ({}));
    setErr(json.error || `HTTP ${r.status}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{c.displayName}</h1>
        <span className="text-sm text-[#6B7080]">@{slug}</span>
      </div>

      <form
        onSubmit={onSave}
        className="border border-[#1B1E26] rounded p-4 space-y-3 bg-[#111318]"
      >
        <Field
          label="Display name"
          value={form.displayName}
          onChange={(v) => setForm((f) => ({ ...f, displayName: v }))}
          required
        />
        <Field
          label="Telegram channel id"
          value={form.telegramChannelId}
          onChange={(v) => setForm((f) => ({ ...f, telegramChannelId: v }))}
          required
        />

        <div>
          <div className="text-sm text-[#B9BDC7] mb-1">Bot token</div>
          <div className="text-xs text-[#6B7080] mb-1">
            {c.hasToken
              ? "Già configurato 🔐. Inserisci un nuovo token solo per sostituirlo."
              : "Non configurato. Incolla qui il BOT_TOKEN di @BotFather."}
          </div>
          <input
            type="password"
            value={form.telegramBotToken}
            onChange={(e) =>
              setForm((f) => ({ ...f, telegramBotToken: e.target.value }))
            }
            placeholder={
              c.hasToken
                ? "•••••••• (lascia vuoto per non cambiarlo)"
                : "123456:ABC-DEF…"
            }
            className="w-full bg-[#1B1E26] border border-[#2A2E39] text-[#F5F6F8] rounded p-2"
          />
        </div>

        <Field
          label="Persona"
          value={form.persona}
          onChange={(v) => setForm((f) => ({ ...f, persona: v }))}
          textarea
        />

        {err && <p className="text-red-400 text-sm">{err}</p>}
        {ok && <p className="text-emerald-400 text-sm">Salvato.</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#D4AF7A] text-[#08090F] px-4 py-2 rounded font-medium disabled:opacity-50"
          >
            {submitting ? "Salvataggio…" : "Salva"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="bg-red-900/40 border border-red-700 text-red-200 px-4 py-2 rounded hover:bg-red-900/60"
          >
            Elimina
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, textarea }) {
  return (
    <label className="block">
      <span className="block text-sm text-[#B9BDC7] mb-1">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          rows={3}
          className="w-full bg-[#1B1E26] border border-[#2A2E39] text-[#F5F6F8] rounded p-2"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="w-full bg-[#1B1E26] border border-[#2A2E39] text-[#F5F6F8] rounded p-2"
        />
      )}
    </label>
  );
}
