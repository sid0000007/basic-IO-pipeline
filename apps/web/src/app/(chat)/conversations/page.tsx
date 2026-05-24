export default function ConversationsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="text-2xl font-semibold">Start a conversation</h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Click <span className="font-medium">+ New chat</span> in the sidebar, or pick a recent
        conversation to resume.
      </p>
    </div>
  );
}
