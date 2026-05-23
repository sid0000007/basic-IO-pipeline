import { webEnvSchema } from '@olives/types';
import { Button } from '@/components/ui/button';

const env = webEnvSchema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
});

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Olives</h1>
      <p className="text-muted-foreground text-sm">
        API base URL: <span className="font-mono">{env.NEXT_PUBLIC_API_BASE_URL}</span>
      </p>
      <Button>Phase 0 ready</Button>
    </main>
  );
}
