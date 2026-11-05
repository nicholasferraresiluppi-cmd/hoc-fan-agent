// Fasce → «Due operatori» (26/10/2026): una riga per pagina × ora con quanti chatter
// erano in turno, quanti fan hanno iniziato a scrivere e quanto ha incassato la pagina.
// Definizioni e perché in fasce-duo-core.js. ~2,3 GB a giro (12 settimane di chat).
// Date come COSTANTI letterali (con sub-select la stima diventerebbe l'intera tabella).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function duoSQL({ from, to, project, org }) {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new Error("date non valide");
  if (!/^[\w-]+$/.test(project) || !/^[\w-]+$/.test(org)) throw new Error("progetto/organizzazione non validi");
  const P = project;
  return `
WITH sh AS (
  SELECT DISTINCT creator_id, member_name, started_at, ended_at
  FROM \`${P}.onlyfans.cache_members\`
  WHERE started_date >= DATE_SUB(DATE '${from}', INTERVAL 1 DAY) AND started_date < DATE '${to}'
    AND organization_id = '${org}'
    AND 'HOC - Chatter' IN UNNEST(role_names)
    AND member_name IS NOT NULL AND started_at IS NOT NULL AND ended_at > started_at
    AND TIMESTAMP_DIFF(ended_at, started_at, HOUR) <= 14
),
staffed AS (
  SELECT creator_id, h, COUNT(DISTINCT member_name) AS staff
  FROM sh, UNNEST(GENERATE_TIMESTAMP_ARRAY(TIMESTAMP_TRUNC(started_at, HOUR), TIMESTAMP_SUB(ended_at, INTERVAL 1 MINUTE), INTERVAL 1 HOUR)) AS h
  WHERE h >= TIMESTAMP '${from} 00:00:00' AND h < TIMESTAMP '${to} 00:00:00'
    AND TIMESTAMP_DIFF(LEAST(ended_at, TIMESTAMP_ADD(h, INTERVAL 1 HOUR)), GREATEST(started_at, h), MINUTE) >= 45
  GROUP BY 1, 2
),
msgs AS (
  SELECT creator_id, user_id, created_at, sender_id != creator_id AS inbound,
    LAG(created_at) OVER (PARTITION BY creator_id, user_id ORDER BY created_at) AS prev_at
  FROM \`${P}.onlyfans.chat\`
  WHERE created_at >= TIMESTAMP_SUB(TIMESTAMP '${from} 00:00:00', INTERVAL 1 DAY) AND created_at < TIMESTAMP '${to} 00:00:00'
    AND organization_id = '${org}'
),
arrivals AS (
  SELECT creator_id, TIMESTAMP_TRUNC(created_at, HOUR) AS h,
    COUNT(DISTINCT IF(inbound AND (prev_at IS NULL OR TIMESTAMP_DIFF(created_at, prev_at, MINUTE) >= 60), user_id, NULL)) AS starts
  FROM msgs WHERE created_at >= TIMESTAMP '${from} 00:00:00'
  GROUP BY 1, 2
),
sales AS (
  SELECT creator_id, TIMESTAMP_TRUNC(created_at, HOUR) AS h, SUM(CAST(net AS FLOAT64)) AS net
  FROM \`${P}.onlyfans.attributed_transactions\`
  WHERE created_at >= TIMESTAMP '${from} 00:00:00' AND created_at < TIMESTAMP '${to} 00:00:00'
    AND organization_id = '${org}' AND type IN ('message', 'tip')
  GROUP BY 1, 2
)
SELECT CAST(s.creator_id AS STRING) AS cid,
  EXTRACT(HOUR FROM s.h AT TIME ZONE 'Europe/Rome') AS rh,
  s.staff, IFNULL(a.starts, 0) AS starts, ROUND(IFNULL(x.net, 0), 2) AS net
FROM staffed s
LEFT JOIN arrivals a ON a.creator_id = s.creator_id AND a.h = s.h
LEFT JOIN sales x ON x.creator_id = s.creator_id AND x.h = s.h`;
}
