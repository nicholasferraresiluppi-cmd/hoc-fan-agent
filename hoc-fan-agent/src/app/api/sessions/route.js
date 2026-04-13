import { kv } from "@vercel/kv";

// GET — Recupera tutte le sessioni (opzionalmente filtrate per operatore)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const operator = searchParams.get("operator");

    // Recupera la lista di tutte le sessioni
    const sessionIds = (await kv.lrange("sessions:all", 0, -1)) || [];

    if (sessionIds.length === 0) {
      return Response.json({ sessions: [] });
    }

    // Recupera i dettagli di ogni sessione
    const sessions = [];
    for (const id of sessionIds) {
      const session = await kv.get(`session:${id}`);
      if (session) {
        if (!operator || session.operatorName === operator) {
          sessions.push(session);
        }
      }
    }

    // Ordina per data (più recente prima)
    sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return Response.json({ sessions });
  } catch (error) {
    console.error("Sessions GET error:", error);
    return Response.json({ sessions: [], error: "KV non configurato. Segui le istruzioni di setup." }, { status: 200 });
  }
}

// POST — Salva una nuova sessione
export async function POST(request) {
  try {
    const sessionData = await request.json();

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session = {
      id,
      operatorName: sessionData.operatorName,
      mode: sessionData.mode,
      fanProfileId: sessionData.fanProfileId,
      fanName: sessionData.fanName,
      fanDifficulty: sessionData.fanDifficulty,
      messageCount: sessionData.messageCount,
      messages: sessionData.messages,
      score: sessionData.score,
      feedbacks: sessionData.feedbacks || [],
      timestamp: new Date().toISOString(),
      duration: sessionData.duration || 0,
    };

    // Salva la sessione
    await kv.set(`session:${id}`, session);

    // Aggiungi l'ID alla lista globale
    await kv.lpush("sessions:all", id);

    // Aggiungi alla lista per operatore
    await kv.lpush(`sessions:operator:${sessionData.operatorName}`, id);

    // Aggiorna le stats dell'operatore
    const statsKey = `stats:${sessionData.operatorName}`;
    const existingStats = (await kv.get(statsKey)) || {
      totalSessions: 0,
      avgCloser: 0,
      avgBuilder: 0,
      avgSpammer: 0,
      avgOverall: 0,
      bestScore: 0,
      salesAchieved: 0,
      fansRetained: 0,
    };

    const n = existingStats.totalSessions;
    const s = sessionData.score;

    const updatedStats = {
      totalSessions: n + 1,
      avgCloser: Math.round((existingStats.avgCloser * n + s.closer) / (n + 1)),
      avgBuilder: Math.round((existingStats.avgBuilder * n + s.builder) / (n + 1)),
      avgSpammer: Math.round((existingStats.avgSpammer * n + s.spammer) / (n + 1)),
      avgOverall: Math.round((existingStats.avgOverall * n + s.overall) / (n + 1)),
      bestScore: Math.max(existingStats.bestScore, s.overall),
      salesAchieved: existingStats.salesAchieved + (s.sale_achieved ? 1 : 0),
      fansRetained: existingStats.fansRetained + (s.fan_retained ? 1 : 0),
    };

    await kv.set(statsKey, updatedStats);

    return Response.json({ success: true, id });
  } catch (error) {
    console.error("Sessions POST error:", error);
    return Response.json({ success: false, error: "KV non configurato." }, { status: 200 });
  }
}
