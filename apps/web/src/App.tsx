import { useQuery } from '@tanstack/react-query';
import { healthSchema } from '@archimesh/contracts';

async function getHealth() {
  const response = await fetch('/api/health');
  if (!response.ok) throw new Error('Service unavailable');
  return healthSchema.parse(await response.json());
}

export default function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">Archimesh</h1>
      <p className="mt-4 text-slate-600">Enterprise architecture knowledge platform</p>
      <p className="mt-8" role="status">
        {health.isPending
          ? 'Checking service…'
          : health.isError
            ? 'Service unavailable'
            : `Service ${health.data.status} · Database ${health.data.database}`}
      </p>
    </main>
  );
}
