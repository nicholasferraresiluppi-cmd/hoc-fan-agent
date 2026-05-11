"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function CreatorsPage() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/content-pipeline/creators",
    fetcher
  );
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  async function onCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch("/api/content-pipeline/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      setShowForm(false);
      setForm(emptyForm());
      mutate();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Creators</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-[#D4AF7A] text-[#08090F] px-4 py-2 rounded font-medium hover:bg-[#B89158]"
        >
          {showForm ? "Annulla" : "Nuovo creator"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-[#1B1E26] rounded p-4 space-y-3 bg-[#111318]"
        >
          <Field
            label="Slug (a-z, 0-9, trattino)"
            value={form.slug}
            onChange={(v) => setForm((f) => ({ ...f, slug: v }))}
            required
          />
          <Field
            label="Display name"
            value={form.displayName}
            onChange={(v) => setForm((f) => ({ ...f, displayName: v }))}
            required
          />
          <Field
            label="Telegram channel id (@username o -100…)"
            value={form.telegramChannelId}
            onChange={(v) => setForm((f) => ({ ...f, telegramChannelId: v }))}
            required
          />
          <Field
            label="Telegram bot token"
            type="password"
            value={form.telegramBotToken}
            onChange={(v) => setForm((f) => ({ ...f, telegramBotToken: v }))}
            required
          />
          <Field
            label="Persona prompt (opzionale)"
            value={form.persona}
            onChange={(v) => setForm((f) => ({ ...f, persona: v }))}
            textarea
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#D4AF7A] text-[#08090F] px-4 py-2 rounded font-medium disabled:opacity-50"
          >
            {submitting ? "Creazione…" : "Crea creator"}
          </button>
        </form>
      )}

      {isLoading && <p className="text-[#B9BDC7]">Caricamento…</p>}
      {error && <p className="text-red-400">Errore di rete</p>}
      {data?.error && <p className="text-red-400">{data.error}</p>}

      {data?.creators && (
        <ul className="space-y-2">
          {data.creators.length === 0 && (
            <li className="text-[#6B7080]">Nessun creator. Creane uno per cominciare.</li>
          )}
          {data.creators.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/content-pipeline/creators/${c.slug}`}
                className="block border border-[#1B1E26] rounded p-3 bg-[#111318] hover:border-[#D4AF7A]"
              >
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{c.displayName}</div>
                    <div className="text-sm text-[#6B7080]">
                      @{c.slug} → {c.telegramChannelId}
                    </div>
                  </div>
                  <div className="text-xs text-[#6B7080]">
                    {c.hasToken ? "🔐 token ok" : "⚠️ no token"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function emptyForm() {
  return {
    slug: "",
    displayName: "",
    telegramChannelId: "",
    telegramBotToken: "",
    persona: "",
  };
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
