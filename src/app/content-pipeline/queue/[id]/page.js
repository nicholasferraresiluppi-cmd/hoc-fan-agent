// Dettaglio singolo draft: preview Telegram, editor body/media, SchedulePicker, ApprovalActions.

export default function DraftDetailPage({ params }) {
  // TODO: caricare draft da /api/content-pipeline/queue/[id]
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Draft {params.id}</h1>
      <p className="text-[#B9BDC7]">TODO: editor + preview + approve/reject + schedule.</p>
    </div>
  );
}
